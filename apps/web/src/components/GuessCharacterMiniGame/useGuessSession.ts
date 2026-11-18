"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // «Очікуємо сервер»: піднімається на дію, знімається наступним знімком сесії (або через 5 с).
  const [busy, setBusy] = useState(false);
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [stalledKey, setStalledKey] = useState<string | null>(null);
  const session =
    open && snapshot && snapshot.roomId === roomId && snapshot.mode === mode ? snapshot : null;

  useEffect(() => {
    if (!open || !socket || !roomId) return;
    const onSession = (payload: GuessSessionState) => {
      if (payload.roomId === roomId && payload.mode === mode) {
        setSnapshot(payload);
        setBusy(false);
      }
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

  const loaded = session != null && catalog != null;
  const stallId = `${roomId}:${mode}:${retryNonce}`;
  // Сервер може мовчки проігнорувати sync: через ~9 с без стану показуємо «Спробувати ще раз».
  useEffect(() => {
    if (!open || loaded) return;
    const id = setTimeout(() => setStalledKey(stallId), 9000);
    return () => clearTimeout(id);
  }, [open, loaded, stallId]);
  const stalled = open && !loaded && stalledKey === stallId;

  const retry = useCallback(() => {
    if (socket && roomId) socket.emit("guess-session-sync", { roomId, solo });
    setRetryNonce((n) => n + 1);
  }, [socket, roomId, solo]);

  useEffect(
    () => () => {
      if (busyTimer.current) clearTimeout(busyTimer.current);
    },
    [],
  );

  const send = useCallback(
    (event: string, extra: Record<string, unknown> = {}, track = false) => {
      if (!socket || !roomId) return;
      socket.emit(event, { roomId, solo, ...extra });
      if (track) {
        setBusy(true);
        if (busyTimer.current) clearTimeout(busyTimer.current);
        busyTimer.current = setTimeout(() => setBusy(false), 5000);
      }
    },
    [socket, roomId, solo],
  );

  return {
    session,
    catalog,
    busy,
    stalled,
    retry,
    selectLevel: useCallback((level: GuessLevel) => send("guess-level", { level }), [send]),
    setReady: useCallback((ready: boolean) => send("guess-ready", { ready }), [send]),
    pick: useCallback((character: string) => send("guess-pick", { character }, true), [send]),
    ask: useCallback((trait: string) => send("guess-ask", { trait }, true), [send]),
    guess: useCallback((character: string) => send("guess-guess", { character }, true), [send]),
    next: useCallback(() => send("guess-next", {}, true), [send]),
    respond: useCallback((accept: boolean) => send("guess-respond", { accept }, true), [send]),
    abort: useCallback(() => send("guess-abort", {}, true), [send]),
  };
}
