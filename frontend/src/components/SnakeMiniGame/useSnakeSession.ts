"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dir, SnakeSessionState, SnakeSocket } from "./snakeTypes";

type Options = {
  socket: SnakeSocket | null;
  roomId: string | null;
  open: boolean;
};

/** Підписка на серверну сесію Snake + команди (рівень, «Готовий», напрямок). */
export function useSnakeSession({ socket, roomId, open }: Options) {
  const [session, setSession] = useState<SnakeSessionState | null>(null);

  useEffect(() => {
    if (!open || !socket || !roomId) {
      setSession(null);
      return;
    }
    const onSession = (payload: SnakeSessionState) => {
      if (payload.roomId === roomId) setSession(payload);
    };
    // Присутність + актуальний стан: при відкритті, а також після перепідключення сокета.
    const sync = () => socket.emit("snake-session-sync", { roomId });
    socket.on("snake-session", onSession as never);
    socket.on("connect", sync as never);
    sync();
    return () => {
      socket.off("snake-session", onSession as never);
      socket.off("connect", sync as never);
      socket.emit("snake-presence", { roomId, present: false });
    };
  }, [open, socket, roomId]);

  const selectLevel = useCallback(
    (level: number) => {
      if (socket && roomId) socket.emit("snake-level-select", { roomId, level });
    },
    [socket, roomId],
  );

  const setReady = useCallback(
    (ready: boolean) => {
      if (socket && roomId) socket.emit("snake-ready", { roomId, ready });
    },
    [socket, roomId],
  );

  const sendDirection = useCallback(
    (dir: Dir) => {
      if (socket && roomId) socket.emit("snake-input", { roomId, dir });
    },
    [socket, roomId],
  );

  return { session, selectLevel, setReady, sendDirection };
}
