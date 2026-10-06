"use client";

import type { WatchSystemData } from "@/lib/watchSystemMessage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";
import { dismissRoomNotificationsLocally } from "@/lib/chatRoomNotifications";
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
  /** До якого моменту учасник переглянув чат кімнати — для аватарок "прочитано". */
  lastReadAt: string;
};

export type HallMessageReaction = { userId: string; type: string };

/** Знімок оригіналу для цитати; `deleted` — оригінал уже видалено. */
export type HallReplyPreview =
  | { id: string; deleted: true }
  | { id: string; deleted: false; userId: string; username: string; content: string };

export type HallMessage = {
  id: string;
  content: string;
  createdAt: string;
  user: WatchUser;
  reactions: HallMessageReaction[];
  replyTo?: HallReplyPreview | null;
  editedAt?: string | null;
  /** SYSTEM — службовий рядок (вихід/вхід учасника); відсутнє/TEXT — звичайне повідомлення. */
  type?: "TEXT" | "SYSTEM";
  systemData?: WatchSystemData | null;
};

/** Скільки повідомлень тримаємо в памʼяті (разом із дозавантаженою історією). */
const MAX_LOADED_MESSAGES = 500;

export type HallReaction = { id: string; emoji: string; userId: string };

/** Живі зміни чату зали (не історія): нове, відредаговане й видалене повідомлення. */
export type HallMessageEvent =
  | { type: "new"; message: HallMessage }
  | { type: "edited"; messageId: string; content: string }
  | { type: "deleted"; messageId: string };

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
      notificationsMuted: boolean;
    }
  | { ok: false; code: string; title?: string };

type ControlAck = { ok: boolean; code?: string; state?: WatchState | null };

export type HallEvent =
  | { type: "hostChanged"; hostId: string; previousHostId: string }
  | { type: "hostAway" }
  | { type: "commandRejected"; code: string };

const CLOCK_RESYNC_MS = 60_000;
const JOIN_RETRY_MS = 2_500;
const RESYNC_ACK_MS = 4_000;
/** Той самий ліміт, що й у backend/src/watch-party/watch-party.gateway.ts (RateLimiter для watch:reaction). */
const REACTION_RATE_LIMIT = 6;
const REACTION_RATE_WINDOW_MS = 3_000;

/**
 * Стан зали «Кіношки» поверх спільного сокета застосунку: вхід/перепідключення,
 * єдиний стан плеєра з сервера, учасники, присутність, чат і реакції.
 * `roomId === null` — зали немає (глобальний CinemaProvider без активної кімнати): хук спить.
 */
export function useWatchHall(roomId: string | null, onEvent?: (event: HallEvent) => void) {
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
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(() => new Set());
  const [notificationsMuted, setNotificationsMutedState] = useState(false);
  /** Пропозиції відео з міні-YouTube від учасників — не з БД, живуть лише в цій сесії. */
  const [suggestions, setSuggestions] = useState<HallSuggestion[]>([]);
  /** Збільшується, щоб повторно зайти в залу (напр. щойно прийняли запрошення). */
  const [joinEpoch, setJoinEpoch] = useState(0);

  // Зміна кімнати: скидаємо все, що належало попередній (раніше це робив `key={roomId}` на сторінці).
  const [seenRoomId, setSeenRoomId] = useState(roomId);
  if (seenRoomId !== roomId) {
    setSeenRoomId(roomId);
    setStatus("connecting");
    setRoomTitle("");
    setInviteToken(null);
    setState(null);
    setMembers([]);
    setPresentIds(new Set());
    setMessages([]);
    setReactionOptions([]);
    setTypingUserIds(new Set());
    setSuggestions([]);
  }

  const stateRef = useRef<WatchState | null>(null);
  /** Повторний вхід у залу без `watch:leave` — після повернення з фону (див. `resync`). */
  const resyncRef = useRef<(() => void) | null>(null);
  const reactionListeners = useRef(new Set<(r: HallReaction) => void>());
  const messageListeners = useRef(new Set<(event: HallMessageEvent) => void>());
  /** Автоприховування чужого "друкує…", якщо не прийшло явне isTyping:false (напр. клієнт впав). */
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
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
    if (!socket || !isConnected || !roomId) return;
    stateRef.current = null;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Той самий Map упродовж усього життя компонента — читаємо на старті ефекту,
    // а не в cleanup, щоб не чіпати `.current` у момент, коли рушій уже його прибирає.
    const typingTimersMap = typingTimers.current;

    const onState = (s: WatchState) => applyState(s);
    const onPresence = (p: { roomId: string; presentUserIds: string[] }) => {
      if (p.roomId === roomId) setPresentIds(new Set(p.presentUserIds));
    };
    const onMembers = (p: { roomId: string; members: HallMember[] }) => {
      if (p.roomId === roomId) setMembers(p.members);
    };
    const onMessage = (p: { roomId: string; message: HallMessage }) => {
      if (p.roomId !== roomId) return;
      messageListeners.current.forEach((listener) => listener({ type: "new", message: p.message }));
      setMessages((prev) =>
        prev.some((m) => m.id === p.message.id) ? prev : [...prev.slice(-(MAX_LOADED_MESSAGES - 1)), p.message],
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
    const onMessageReactions = (p: {
      roomId: string;
      messageId: string;
      reactions: HallMessageReaction[];
    }) => {
      if (p.roomId !== roomId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === p.messageId ? { ...m, reactions: p.reactions } : m)),
      );
    };
    // Рядок "вийшов" перетворюється на "знову в залі", коли людина швидко повернулась.
    const onSystemUpdated = (p: { roomId: string; messageId: string; systemData: WatchSystemData }) => {
      if (p.roomId !== roomId) return;
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, systemData: p.systemData } : m)));
    };
    const onMessageDeleted = (p: { roomId: string; messageId: string }) => {
      if (p.roomId !== roomId) return;
      messageListeners.current.forEach((listener) => listener({ type: "deleted", messageId: p.messageId }));
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== p.messageId)
          .map((m) =>
            m.replyTo?.id === p.messageId
              ? { ...m, replyTo: { id: p.messageId, deleted: true as const } }
              : m,
          ),
      );
    };
    const onMessageEdited = (p: {
      roomId: string;
      messageId: string;
      content: string;
      editedAt: string;
    }) => {
      if (p.roomId !== roomId) return;
      messageListeners.current.forEach((listener) =>
        listener({ type: "edited", messageId: p.messageId, content: p.content }),
      );
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === p.messageId) return { ...m, content: p.content, editedAt: p.editedAt };
          if (m.replyTo && !m.replyTo.deleted && m.replyTo.id === p.messageId) {
            return { ...m, replyTo: { ...m.replyTo, content: p.content } };
          }
          return m;
        }),
      );
    };
    const onReadUpdated = (p: { roomId: string; userId: string; lastReadAt: string }) => {
      if (p.roomId !== roomId) return;
      setMembers((prev) =>
        prev.map((m) => (m.id === p.userId ? { ...m, lastReadAt: p.lastReadAt } : m)),
      );
    };
    const onUserTyping = (p: { roomId: string; userId: string; isTyping: boolean }) => {
      if (p.roomId !== roomId) return;
      const existingTimer = typingTimersMap.get(p.userId);
      if (existingTimer) clearTimeout(existingTimer);
      typingTimersMap.delete(p.userId);

      if (!p.isTyping) {
        setTypingUserIds((prev) => {
          if (!prev.has(p.userId)) return prev;
          const next = new Set(prev);
          next.delete(p.userId);
          return next;
        });
        return;
      }

      setTypingUserIds((prev) => new Set(prev).add(p.userId));
      const timer = setTimeout(() => {
        typingTimersMap.delete(p.userId);
        setTypingUserIds((prev) => {
          if (!prev.has(p.userId)) return prev;
          const next = new Set(prev);
          next.delete(p.userId);
          return next;
        });
      }, 4_000);
      typingTimersMap.set(p.userId, timer);
    };

    socket.on("watch:state", onState);
    socket.on("watch:presence", onPresence);
    socket.on("watch:members", onMembers);
    socket.on("watch:message", onMessage);
    socket.on("watch:reaction", onReaction);
    socket.on("watch:videoSuggested", onVideoSuggested);
    socket.on("watch:roomDeleted", onDeleted);
    socket.on("watch:removedFromRoom", onRemoved);
    socket.on("watch:messageReactions", onMessageReactions);
    socket.on("watch:systemUpdated", onSystemUpdated);
    socket.on("watch:messageDeleted", onMessageDeleted);
    socket.on("watch:messageEdited", onMessageEdited);
    socket.on("watch:readUpdated", onReadUpdated);
    socket.on("watch:userTyping", onUserTyping);

    const handleJoinAck = (res: JoinAck) => {
      if (disposed) return;
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
      setNotificationsMutedState(res.notificationsMuted);
      // Перепідключення: стан сервера — істина, навіть якщо його версія «старша» (рестарт).
      stateRef.current = null;
      applyState(res.state);
      setStatus("ready");
    };

    const join = () => {
      void emitWithAck<JoinAck>(socket, "watch:join", { roomId }, 10_000).then((res) => {
        if (disposed) return;
        if (!res) {
          retryTimer = setTimeout(join, JOIN_RETRY_MS);
          return;
        }
        handleJoinAck(res);
      });
    };

    // Повернення з фону: iOS міг тихо вбити сокет (connected лишається true, але пакети не йдуть).
    // Короткий ack-таймаут → якщо мовчить, примусово перепідключаємось; сам ефект тоді зайде знову.
    resyncRef.current = () => {
      clearTimeout(retryTimer);
      void clock.sync(socket);
      void emitWithAck<JoinAck>(socket, "watch:join", { roomId }, RESYNC_ACK_MS).then((res) => {
        if (disposed) return;
        if (!res) {
          socket.disconnect();
          socket.connect();
          return;
        }
        handleJoinAck(res);
      });
    };

    void clock.sync(socket);
    join();
    const clockTimer = setInterval(() => void clock.sync(socket, 3), CLOCK_RESYNC_MS);

    return () => {
      disposed = true;
      resyncRef.current = null;
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
      socket.off("watch:messageReactions", onMessageReactions);
      socket.off("watch:systemUpdated", onSystemUpdated);
      socket.off("watch:messageDeleted", onMessageDeleted);
      socket.off("watch:messageEdited", onMessageEdited);
      socket.off("watch:readUpdated", onReadUpdated);
      socket.off("watch:userTyping", onUserTyping);
      for (const timer of typingTimersMap.values()) clearTimeout(timer);
      typingTimersMap.clear();
      setTypingUserIds(new Set());
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
      changeVideo: (
        videoId: string,
        startSec?: number,
        provider: WatchProvider = "YOUTUBE",
        videoTitle?: string,
        thumbnailUrl?: string,
      ) => control("watch:changeVideo", { videoId, startSec, provider, videoTitle, thumbnailUrl }),
      transferHost: (userId: string) => control("watch:transferHost", { userId }),
      // Ручна синхронізація (IFRAME/MANUAL) — див. ManualSyncControls.tsx.
      manualReady: (ready: boolean) => control("watch:manualReady", { ready }),
      manualStart: () => control("watch:manualStart"),
      manualPause: () => control("watch:manualPause"),
      manualResume: () => control("watch:manualResume"),
    }),
    [control],
  );

  const sendMessage = useCallback(
    (content: string, replyToId?: string) =>
      new Promise<boolean>((resolve) => {
        if (!socket?.connected) {
          resolve(false);
          return;
        }
        void emitWithAck<{ ok: boolean }>(
          socket,
          "watch:message",
          { roomId, content, replyToId },
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

  const subscribeMessages = useCallback((listener: (event: HallMessageEvent) => void) => {
    messageListeners.current.add(listener);
    return () => {
      messageListeners.current.delete(listener);
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

  /** Емодзі-реакція на конкретне повідомлення (не плутати з летючими реакціями на кімнату). */
  const toggleMessageReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket?.connected) return;
      socket.emit("watch:toggleReaction", { roomId, messageId, emoji });
    },
    [socket, roomId],
  );

  const deleteMessage = useCallback(
    (messageId: string) =>
      new Promise<boolean>((resolve) => {
        if (!socket?.connected) {
          resolve(false);
          return;
        }
        void emitWithAck<{ ok: boolean }>(
          socket,
          "watch:deleteMessage",
          { roomId, messageId },
          8_000,
        ).then((res) => resolve(Boolean(res?.ok)));
      }),
    [socket, roomId],
  );

  const editMessage = useCallback(
    (messageId: string, content: string) =>
      new Promise<boolean>((resolve) => {
        if (!socket?.connected) {
          resolve(false);
          return;
        }
        void emitWithAck<{ ok: boolean }>(
          socket,
          "watch:editMessage",
          { roomId, messageId, content },
          8_000,
        ).then((res) => resolve(Boolean(res?.ok)));
      }),
    [socket, roomId],
  );

  /** Дозавантажує історію чату старішу за `beforeId` (до `untilId` включно, якщо задано). */
  const loadOlderMessages = useCallback(
    (beforeId: string, untilId?: string) =>
      new Promise<boolean>((resolve) => {
        if (!socket?.connected) {
          resolve(false);
          return;
        }
        void emitWithAck<{ ok: boolean; messages?: HallMessage[] }>(
          socket,
          "watch:loadOlder",
          { roomId, beforeId, untilId },
          10_000,
        ).then((res) => {
          if (!res?.ok || !res.messages) {
            resolve(false);
            return;
          }
          const older = res.messages;
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const fresh = older.filter((m) => !known.has(m.id));
            return fresh.length ? [...fresh, ...prev] : prev;
          });
          resolve(true);
        });
      }),
    [socket, roomId],
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket?.connected) return;
      socket.emit("watch:typing", { roomId, isTyping });
    },
    [socket, roomId],
  );

  const markRead = useCallback(() => {
    if (!socket?.connected) return;
    void dismissRoomNotificationsLocally(`watch-${roomId}`);
    socket.emit("watch:markRead", { roomId });
  }, [socket, roomId]);

  const setNotificationsMuted = useCallback(
    (muted: boolean) =>
      new Promise<boolean>((resolve) => {
        if (!socket?.connected) {
          resolve(false);
          return;
        }
        void emitWithAck<{ ok: boolean; muted?: boolean }>(
          socket,
          "watch:setMuted",
          { roomId, muted },
          8_000,
        ).then((res) => {
          if (res?.ok) setNotificationsMutedState(muted);
          resolve(Boolean(res?.ok));
        });
      }),
    [socket, roomId],
  );

  /** Перезапитати стан кімнати (повернення з фону): без `watch:leave`, присутність не блимає. */
  const resync = useCallback(() => {
    resyncRef.current?.();
  }, []);

  const rejoin = useCallback(() => {
    setStatus("connecting");
    setJoinEpoch((n) => n + 1);
  }, []);

  return {
    status,
    rejoin,
    resync,
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
    deleteMessage,
    editMessage,
    loadOlderMessages,
    sendReaction,
    subscribeReactions,
    subscribeMessages,
    suggestions,
    suggestVideo,
    dismissSuggestion,
    typingUserIds,
    sendTyping,
    toggleMessageReaction,
    markRead,
    notificationsMuted,
    setNotificationsMuted,
  };
}
