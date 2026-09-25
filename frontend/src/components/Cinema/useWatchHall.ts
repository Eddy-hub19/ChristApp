"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";
import type { WatchUser } from "@/lib/queries/watchRoomsQueries";
import {
  DEVICE_TAG,
  ServerClock,
  emitWithAck,
  type WatchProvider,
  type WatchState,
} from "@/lib/watchSync";

export type HallMember = WatchUser & {
  status: "INVITED" | "JOINED";
  joinedAt: string | null;
};

export type HallMessage = {
  id: string;
  content: string;
  createdAt: string;
  user: WatchUser;
};

export type HallReaction = { id: string; emoji: string; userId: string };

export type HallSuggestion = {
  id: string;
  videoId: string;
  title: string;
  user: WatchUser;
};

const MAX_SUGGESTIONS = 5;

export type HallStatus =
  | "connecting"
  | "ready"
  | "invited"
  | "forbidden"
  | "notFound"
  | "deleted"
  | "removed";

type JoinAck =
  | {
      ok: true;
      room: { id: string; title: string; inviteToken: string | null };
      state: WatchState;
      members: HallMember[];
      presentUserIds: string[];
      messages: HallMessage[];
      reactions: string[];
    }
  | { ok: false; code: string; title?: string };

type ControlAck = { ok: boolean; code?: string; state?: WatchState | null };

export type HallEvent =
  | { type: "hostChanged"; hostId: string; previousHostId: string }
  | { type: "hostAway" }
  | { type: "commandRejected"; code: string };

const CLOCK_RESYNC_MS = 60_000;
const JOIN_RETRY_MS = 2_500;
/** Той самий ліміт, що й у backend/src/watch-party/watch-party.gateway.ts (RateLimiter для watch:reaction). */
const REACTION_RATE_LIMIT = 6;
const REACTION_RATE_WINDOW_MS = 3_000;

/**
 * Стан зали «Кіношки» поверх спільного сокета застосунку: вхід/перепідключення,
 * єдиний стан плеєра з сервера, учасники, присутність, чат і реакції.
 */
export function useWatchHall(roomId: string, onEvent?: (event: HallEvent) => void) {
  const { socket, isConnected } = usePresenceSocket();
  const clock = useMemo(() => new ServerClock(), []);

  const [status, setStatus] = useState<HallStatus>("connecting");
  const [roomTitle, setRoomTitle] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [state, setState] = useState<WatchState | null>(null);
  const [members, setMembers] = useState<HallMember[]>([]);
  const [presentIds, setPresentIds] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<HallMessage[]>([]);
  const [reactionOptions, setReactionOptions] = useState<string[]>([]);
  /** Пропозиції відео з міні-YouTube від учасників — не з БД, живуть лише в цій сесії. */
  const [suggestions, setSuggestions] = useState<HallSuggestion[]>([]);
  /** Збільшується, щоб повторно зайти в залу (напр. щойно прийняли запрошення). */
  const [joinEpoch, setJoinEpoch] = useState(0);

  const stateRef = useRef<WatchState | null>(null);
  const reactionListeners = useRef(new Set<(r: HallReaction) => void>());
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const applyState = useCallback(
    (next: WatchState | null | undefined) => {
      if (!next || next.roomId !== roomId) return;
      const prev = stateRef.current;
      // Пакети можуть прийти не по порядку (ack і broadcast) — старші за застосований відкидаємо.
      if (prev && next.version < prev.version) return;
      clock.seedFromServerNow(next.serverNow);
      stateRef.current = next;
      setState(next);

      if (prev && prev.hostId !== next.hostId) {
        onEventRef.current?.({
          type: "hostChanged",
          hostId: next.hostId,
          previousHostId: prev.hostId,
        });
      }
      if (next.reason === "hostAway") onEventRef.current?.({ type: "hostAway" });
    },
    [clock, roomId],
  );

  useEffect(() => {
    if (!socket || !isConnected) return;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const onState = (s: WatchState) => applyState(s);
    const onPresence = (p: { roomId: string; presentUserIds: string[] }) => {
      if (p.roomId === roomId) setPresentIds(new Set(p.presentUserIds));
    };
    const onMembers = (p: { roomId: string; members: HallMember[] }) => {
      if (p.roomId === roomId) setMembers(p.members);
    };
    const onMessage = (p: { roomId: string; message: HallMessage }) => {
      if (p.roomId !== roomId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === p.message.id) ? prev : [...prev.slice(-199), p.message],
      );
    };
    const onReaction = (p: HallReaction & { roomId: string }) => {
      if (p.roomId !== roomId) return;
      reactionListeners.current.forEach((listener) => listener(p));
    };
    const onVideoSuggested = (p: HallSuggestion & { roomId: string }) => {
      if (p.roomId !== roomId) return;
      setSuggestions((prev) => [...prev.slice(-(MAX_SUGGESTIONS - 1)), p]);
    };
    const onDeleted = (p: { roomId: string }) => {
      if (p.roomId === roomId) setStatus("deleted");
    };
    const onRemoved = (p: { roomId: string }) => {
      if (p.roomId === roomId) setStatus("removed");
    };

    socket.on("watch:state", onState);
    socket.on("watch:presence", onPresence);
    socket.on("watch:members", onMembers);
    socket.on("watch:message", onMessage);
    socket.on("watch:reaction", onReaction);
    socket.on("watch:videoSuggested", onVideoSuggested);
    socket.on("watch:roomDeleted", onDeleted);
    socket.on("watch:removedFromRoom", onRemoved);

    const join = () => {
      void emitWithAck<JoinAck>(socket, "watch:join", { roomId }, 10_000).then((res) => {
        if (disposed) return;
        if (!res) {
          retryTimer = setTimeout(join, JOIN_RETRY_MS);
          return;
        }
        if (!res.ok) {
          if (res.code === "INVITED") {
            setRoomTitle(res.title ?? "");
            setStatus("invited");
          } else if (res.code === "FORBIDDEN") {
            setStatus("forbidden");
          } else if (res.code === "NOT_FOUND") {
            setStatus("notFound");
          } else {
            retryTimer = setTimeout(join, JOIN_RETRY_MS);
          }
          return;
        }
        setRoomTitle(res.room.title);
        setInviteToken(res.room.inviteToken);
        setMembers(res.members);
        setPresentIds(new Set(res.presentUserIds));
        setMessages(res.messages);
        setReactionOptions(res.reactions);
        // Перепідключення: стан сервера — істина, навіть якщо його версія «старша» (рестарт).
        stateRef.current = null;
        applyState(res.state);
        setStatus("ready");
      });
    };

    void clock.sync(socket);
    join();
    const clockTimer = setInterval(() => void clock.sync(socket, 3), CLOCK_RESYNC_MS);

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(clockTimer);
      socket.off("watch:state", onState);
      socket.off("watch:presence", onPresence);
      socket.off("watch:members", onMembers);
      socket.off("watch:message", onMessage);
      socket.off("watch:reaction", onReaction);
      socket.off("watch:videoSuggested", onVideoSuggested);
      socket.off("watch:roomDeleted", onDeleted);
      socket.off("watch:removedFromRoom", onRemoved);
      if (socket.connected) socket.emit("watch:leave", { roomId });
    };
  }, [socket, isConnected, roomId, clock, applyState, joinEpoch]);

  const control = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      if (!socket?.connected) return;
      void emitWithAck<ControlAck>(
        socket,
        event,
        { roomId, tag: DEVICE_TAG, sentAt: clock.now(), ...payload },
        8_000,
      ).then((res) => {
        if (!res) return;
        if (res.state) applyState(res.state);
        if (!res.ok && res.code && res.code !== "RATE_LIMITED") {
          onEventRef.current?.({ type: "commandRejected", code: res.code });
        }
      });
    },
    [socket, roomId, clock, applyState],
  );

  const commands = useMemo(
    () => ({
      play: (positionSec: number) => control("watch:play", { positionSec }),
      pause: (positionSec: number) => control("watch:pause", { positionSec }),
      seek: (positionSec: number) => control("watch:seek", { positionSec }),
      heartbeat: (positionSec: number, isPlaying: boolean) =>
        control("watch:heartbeat", { positionSec, isPlaying }),
      changeVideo: (videoId: string, startSec?: number, provider: WatchProvider = "YOUTUBE") =>
        control("watch:changeVideo", { videoId, startSec, provider }),
      transferHost: (userId: string) => control("watch:transferHost", { userId }),
    }),
    [control],
  );

  const sendMessage = useCallback(
    (content: string) =>
      new Promise<boolean>((resolve) => {
        if (!socket?.connected) {
          resolve(false);
          return;
        }
        void emitWithAck<{ ok: boolean }>(
          socket,
          "watch:message",
          { roomId, content },
          8_000,
        ).then((res) => resolve(Boolean(res?.ok)));
      }),
    [socket, roomId],
  );

  // Дзеркалимо серверний ліміт (6 реакцій/3с на сокет), щоб зайві тапи не летіли в мережу —
  // сервер однаково їх відкине, але навіщо витрачати запит. UI при цьому не чекає на нас:
  // летючий емодзі на своєму екрані малюється завжди, лише мережевий emit тут може бути пропущений.
  const reactionSentAt = useRef<number[]>([]);
  const sendReaction = useCallback(
    (emoji: string): boolean => {
      if (!socket?.connected) return false;
      const now = Date.now();
      const recent = reactionSentAt.current.filter((t) => now - t < REACTION_RATE_WINDOW_MS);
      if (recent.length >= REACTION_RATE_LIMIT) {
        reactionSentAt.current = recent;
        return false;
      }
      recent.push(now);
      reactionSentAt.current = recent;
      socket.emit("watch:reaction", { roomId, emoji });
      return true;
    },
    [socket, roomId],
  );

  const subscribeReactions = useCallback((listener: (r: HallReaction) => void) => {
    reactionListeners.current.add(listener);
    return () => {
      reactionListeners.current.delete(listener);
    };
  }, []);

  /** Будь-хто в кімнаті може запропонувати відео з міні-YouTube — не тільки хост. */
  const suggestVideo = useCallback(
    (videoId: string, title: string) =>
      new Promise<boolean>((resolve) => {
        if (!socket?.connected) {
          resolve(false);
          return;
        }
        void emitWithAck<{ ok: boolean }>(
          socket,
          "watch:suggestVideo",
          { roomId, videoId, title },
          8_000,
        ).then((res) => resolve(Boolean(res?.ok)));
      }),
    [socket, roomId],
  );

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const rejoin = useCallback(() => {
    setStatus("connecting");
    setJoinEpoch((n) => n + 1);
  }, []);

  return {
    status,
    rejoin,
    isConnected,
    roomTitle,
    inviteToken,
    state,
    members,
    presentIds,
    messages,
    reactionOptions,
    clock,
    commands,
    sendMessage,
    sendReaction,
    subscribeReactions,
    suggestions,
    suggestVideo,
    dismissSuggestion,
  };
}
