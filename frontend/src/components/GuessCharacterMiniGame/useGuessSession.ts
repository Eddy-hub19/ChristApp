"use client";

import { useCallback, useEffect, useState } from "react";
import type { GuessCatalog, GuessLevel, GuessMode, GuessSessionState, GuessSocket } from "./guessTypes";

type Options = {
  socket: GuessSocket | null;
  roomId: string | null;
  open: boolean;
  mode: GuessMode;
};

/** Підписка на серверну сесію «Вгадай персонажа» + команди. Стан живе на сервері, тож перепідписка після виходу повертає гру. */
export function useGuessSession({ socket, roomId, open, mode }: Options) {
  // Знімок прив'язаний до кімнати й режиму: після перемикання режиму старий стан не показуємо.
  const [snapshot, setSnapshot] = useState<GuessSessionState | null>(null);
  const [catalog, setCatalog] = useState<GuessCatalog | null>(null);
  const solo = mode === "solo";
  const session =
    open && snapshot && snapshot.roomId === roomId && snapshot.mode === mode ? snapshot : null;

  useEffect(() => {
    if (!open || !socket || !roomId) return;
    const onSession = (payload: GuessSessionState) => {
      if (payload.roomId === roomId && payload.mode === mode) setSnapshot(payload);
    };
    const onCatalog = (payload: GuessCatalog) => setCatalog(payload);
    // Присутність + актуальний стан: при відкритті, зміні режиму й після перепідключення сокета.
    const sync = () => socket.emit("guess-session-sync", { roomId, solo });
    socket.on("guess-session", onSession);
    socket.on("guess-catalog", onCatalog);
    socket.on("connect", sync);
    sync();
    return () => {
      socket.off("guess-session", onSession);
      socket.off("guess-catalog", onCatalog);
      socket.off("connect", sync);
      socket.emit("guess-presence", { roomId, solo, present: false });
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
    selectLevel: useCallback((level: GuessLevel) => send("guess-level", { level }), [send]),
    setReady: useCallback((ready: boolean) => send("guess-ready", { ready }), [send]),
    pick: useCallback((character: string) => send("guess-pick", { character }), [send]),
    ask: useCallback((trait: string) => send("guess-ask", { trait }), [send]),
    guess: useCallback((character: string) => send("guess-guess", { character }), [send]),
    next: useCallback(() => send("guess-next"), [send]),
    abort: useCallback(() => send("guess-abort"), [send]),
  };
}
