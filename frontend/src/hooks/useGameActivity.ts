"use client";

import { useEffect, useState } from "react";
import type createSocket from "socket.io-client";
import {
  GAME_ACTIVITY_HEARTBEAT_MS,
  isGameActivityRoom,
  parseGameActivities,
  type GameActivity,
} from "@/lib/games/gameActivity";
import type { GameId } from "@/lib/games/gameRegistry";

type ActivitySocket = ReturnType<typeof createSocket>;

/**
 * Повідомляє сервер, що користувач зараз у грі (`presence:activity`), і тримає статус живим heartbeat-ом.
 * Статус знімається при закритті гри, виході з чату, згортанні вкладки й втраті сокета.
 */
export function useGameActivityBroadcast(
  socket: ActivitySocket | null,
  roomId: string | null | undefined,
  game: GameId | null,
) {
  useEffect(() => {
    if (!socket || !game || !isGameActivityRoom(roomId)) return;

    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const send = (value: GameId | null) => {
      if (socket.connected) socket.emit("presence:activity", { roomId, game: value });
    };
    const stop = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
    };
    const start = () => {
      stop();
      send(game);
      heartbeat = setInterval(() => send(game), GAME_ACTIVITY_HEARTBEAT_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        send(null);
      } else {
        start();
      }
    };

    // Новий сокет після реконекту нічого не пам'ятає — оголошуємо статус знову.
    socket.on("connect", start);
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState !== "hidden") start();

    return () => {
      socket.off("connect", start);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
      send(null);
    };
  }, [socket, roomId, game]);
}

/** Хто з інших людей зараз грає: roomId → активності (без власної). Сервер надсилає стан кімнати цілком. */
export function useGameActivityFeed(
  socket: ActivitySocket | null,
  selfUserId: string | null | undefined,
) {
  const [byRoom, setByRoom] = useState<Map<string, GameActivity[]>>(() => new Map());

  /* eslint-disable react-hooks/set-state-in-effect -- скидання стану при втраті сокета */
  useEffect(() => {
    if (!socket) {
      setByRoom((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const onActivity = (payload: { roomId?: string; activities?: unknown }) => {
      const roomId = payload?.roomId;
      if (typeof roomId !== "string") return;
      const list = parseGameActivities(payload.activities, selfUserId);
      setByRoom((prev) => {
        const next = new Map(prev);
        if (list.length === 0) next.delete(roomId);
        else next.set(roomId, list);
        return next;
      });
    };
    const sync = () => socket.emit("presence:activity-sync");
    // Втратили сокет — не знаємо, що відбувається: чистимо, після реконекту сервер віддасть актуальне.
    const onDisconnect = () => setByRoom(new Map());

    socket.on("presence:activity", onActivity);
    socket.on("connect", sync);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) sync();
    return () => {
      socket.off("presence:activity", onActivity);
      socket.off("connect", sync);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket, selfUserId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return byRoom;
}
