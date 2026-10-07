"use client";

import { useCallback, useEffect, useState } from "react";
import type { PieceCount, PuzzleCatalog, PuzzleMode, PuzzleSessionState, PuzzleSocket, SelectionMode } from "./puzzleTypes";

type Options = {
  socket: PuzzleSocket | null;
  roomId: string | null;
  open: boolean;
  mode: PuzzleMode;
};

/** Підписка на серверну сесію «Пазлів» + команди. Стан живе на сервері: перепідписка після виходу повертає пазл як був. */
export function usePuzzleSession({ socket, roomId, open, mode }: Options) {
  // Знімок прив'язаний до кімнати й режиму: після перемикання режиму старий стан не показуємо.
  const [snapshot, setSnapshot] = useState<PuzzleSessionState | null>(null);
  const [catalog, setCatalog] = useState<PuzzleCatalog | null>(null);
  const solo = mode === "solo";
  const session =
    open && snapshot && snapshot.roomId === roomId && snapshot.mode === mode ? snapshot : null;

  useEffect(() => {
    if (!open || !socket || !roomId) return;
    const onSession = (payload: PuzzleSessionState) => {
      if (payload.roomId === roomId && payload.mode === mode) setSnapshot(payload);
    };
    const onCatalog = (payload: PuzzleCatalog) => setCatalog(payload);
    // Присутність + актуальний стан: при відкритті, зміні режиму й після перепідключення сокета.
    const sync = () => socket.emit("puzzle-session-sync", { roomId, solo });
    socket.on("puzzle-session", onSession);
    socket.on("puzzle-catalog", onCatalog);
    socket.on("connect", sync);
    sync();
    return () => {
      socket.off("puzzle-session", onSession);
      socket.off("puzzle-catalog", onCatalog);
      socket.off("connect", sync);
      socket.emit("puzzle-presence", { roomId, solo, present: false });
    };
  }, [open, socket, roomId, mode, solo]);

  const send = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      if (socket && roomId) socket.emit(event, { roomId, solo, ...extra });
    },
    [socket, roomId, solo],
  );

  return {
    session,
    catalog,
    select: useCallback(
      (selectionMode: SelectionMode, character?: string) => send("puzzle-select", { mode: selectionMode, character }),
      [send],
    ),
    setCount: useCallback((count: PieceCount) => send("puzzle-count", { count }), [send]),
    start: useCallback(() => send("puzzle-start"), [send]),
    again: useCallback(() => send("puzzle-again"), [send]),
    toLobby: useCallback(() => send("puzzle-lobby"), [send]),
    gather: useCallback(() => send("puzzle-gather"), [send]),
    grab: useCallback((group: number) => send("puzzle-grab", { group }), [send]),
    move: useCallback((group: number, x: number, y: number) => send("puzzle-move", { group, x, y }), [send]),
    drop: useCallback((group: number, x: number, y: number) => send("puzzle-drop", { group, x, y }), [send]),
    cursor: useCallback((x: number, y: number) => send("puzzle-cursor", { x, y }), [send]),
  };
}
