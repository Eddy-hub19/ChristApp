"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import createSocket from "socket.io-client";
import { getDirectApiOrigin, getSocketPath } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { fetchRadioState, type RadioListener, type RadioState, type RadioTrack } from "@/lib/radioApi";
import { usePlayer, usePlayerTime, type AudioTrack } from "@/providers/playerContext";
import { RadioContext, useRadio, type RadioContextValue, type RadioStatus } from "@/providers/radioContext";

/** Расхождение с эфиром, после которого позиция подтягивается. */
const DRIFT_SEC = 1.5;
const DRIFT_CHECK_EVERY_MS = 5000;
/** Сокет не рвём сразу при уходе с экрана (быстрые переходы между разделами). */
const SOCKET_CLOSE_DELAY_MS = 4000;
/** Запас после расчётного конца трека: сервер обычно присылает новое состояние сам, это страховка. */
const END_CHECK_MARGIN_MS = 2000;

export function radioAudioTrack(track: RadioTrack): AudioTrack {
  return {
    id: `radio:${track.id}`,
    audioUrl: track.audioUrl,
    title: track.title,
    artist: track.artist,
    cover: track.coverUrl ?? undefined,
    live: true,
  };
}

/**
 * «Christ Radio»: держит сокет `/radio`, состояние эфира и «я слушаю». Звук идёт через общий плеер приложения (режим live),
 * поэтому эфир продолжает играть при переходах между разделами и виден в мини-полоске/карточке плеера.
 * Позиция считается по часам сервера: `serverNow` из каждого сообщения даёт сдвиг клиентских часов.
 */
export function RadioProvider({ children }: { children: ReactNode }) {
  const player = usePlayer();
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const [state, setState] = useState<RadioState | null>(null);
  const [listeners, setListeners] = useState(0);
  const [listenerUsers, setListenerUsers] = useState<RadioListener[]>([]);
  const [tunedIn, setTunedInState] = useState(false);
  const [status, setStatus] = useState<RadioStatus>("idle");
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const connectingRef = useRef(false);
  const tunedInRef = useRef(false);
  const stateRef = useRef<RadioState | null>(null);
  const offsetRef = useRef(0);
  const viewersRef = useRef(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTuned = useCallback((value: boolean) => {
    tunedInRef.current = value;
    setTunedInState(value);
  }, []);

  const positionOf = useCallback((s: RadioState | null) => {
    if (!s?.track || s.startedAtMs == null) return 0;
    const nowEstimate = Date.now() + offsetRef.current;
    return Math.min(Math.max(0, (nowEstimate - s.startedAtMs) / 1000), Math.max(0, s.track.durationSec - 0.3));
  }, []);

  const applyLive = useCallback(
    async (s: RadioState) => {
      if (!s.online || !s.track) {
        // эфир закончился (очередь опустела): тихо отключаемся
        setTuned(false);
        setStatus("idle");
        socketRef.current?.emit("radio:leave");
        if (playerRef.current.currentTrack?.live) playerRef.current.close();
        return;
      }
      const result = await playerRef.current.playLive(radioAudioTrack(s.track), positionOf(s));
      if (tunedInRef.current) setStatus(result === "ok" ? "listening" : "blocked");
    },
    [positionOf, setTuned],
  );

  const armEndCheck = useCallback((s: RadioState | null) => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = null;
    if (!s?.online || !s.track || s.startedAtMs == null) return;
    const endsIn = s.startedAtMs + s.track.durationSec * 1000 - (Date.now() + offsetRef.current);
    endTimerRef.current = setTimeout(
      () => {
        const known = stateRef.current;
        // сервер сам не прислал смену трека (обрыв сокета): спрашиваем состояние по REST
        if (known && known.startedAtMs === s.startedAtMs && known.track?.id === s.track?.id) {
          fetchRadioState().then(acceptRef.current).catch(() => undefined);
        }
      },
      Math.max(500, endsIn + END_CHECK_MARGIN_MS),
    );
  }, []);

  const acceptState = useCallback(
    (s: RadioState) => {
      offsetRef.current = s.serverNow - Date.now();
      stateRef.current = s;
      setState(s);
      armEndCheck(s);
      if (tunedInRef.current) void applyLive(s);
    },
    [applyLive, armEndCheck],
  );
  const acceptRef = useRef(acceptState);
  useEffect(() => {
    acceptRef.current = acceptState;
  }, [acceptState]);

  const join = useCallback(() => {
    socketRef.current?.emit("radio:join", (ack?: { ok?: boolean; state?: RadioState; count?: number; users?: RadioListener[] }) => {
      if (ack?.state) acceptRef.current(ack.state);
      if (typeof ack?.count === "number") setListeners(ack.count);
      if (Array.isArray(ack?.users)) setListenerUsers(ack.users);
    });
  }, []);

  const ensureSocket = useCallback(async () => {
    if (socketRef.current || connectingRef.current) return;
    connectingRef.current = true;
    try {
      let token = getAuthToken();
      if (!token) token = await ensureAccessToken();
      if (!token || socketRef.current) return;
      const socket = createSocket(`${getDirectApiOrigin()}/radio`, {
        path: getSocketPath(),
        // свежий токен на каждую попытку подключения
        auth: (cb: (data: object) => void) => cb({ token: getAuthToken() ?? token }),
        transports: ["websocket"],
        reconnection: true,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;
      socket.on("connect", () => {
        setConnected(true);
        if (tunedInRef.current) join();
        else fetchRadioState().then(acceptRef.current).catch(() => undefined);
      });
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", () => {
        setConnected(false);
        if (tunedInRef.current) setStatus("error");
      });
      socket.on("radio:state", (s: RadioState) => acceptRef.current(s));
      socket.on("radio:listeners", (p: { count?: number; users?: RadioListener[] }) => {
        if (typeof p?.count === "number") setListeners(p.count);
        if (Array.isArray(p?.users)) setListenerUsers(p.users);
      });
    } finally {
      connectingRef.current = false;
    }
  }, [join]);

  const closeSocketIfIdle = useCallback(() => {
    if (viewersRef.current > 0 || tunedInRef.current) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      if (viewersRef.current > 0 || tunedInRef.current) return;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    }, SOCKET_CLOSE_DELAY_MS);
  }, []);

  const watch = useCallback(() => {
    viewersRef.current += 1;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    void ensureSocket();
    if (!stateRef.current) fetchRadioState().then(acceptRef.current).catch(() => undefined);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      viewersRef.current = Math.max(0, viewersRef.current - 1);
      closeSocketIfIdle();
    };
  }, [ensureSocket, closeSocketIfIdle]);

  /** Отключиться от эфира, не трогая карточку плеера (пауза кнопкой, звонок, игра). */
  const leaveQuietly = useCallback(() => {
    if (!tunedInRef.current) return;
    setTuned(false);
    setStatus("idle");
    socketRef.current?.emit("radio:leave");
    closeSocketIfIdle();
  }, [setTuned, closeSocketIfIdle]);

  const tuneIn = useCallback(() => {
    setTuned(true);
    setStatus("connecting");
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    void ensureSocket().then(() => {
      if (socketRef.current?.connected) join();
    });
    const known = stateRef.current;
    if (known?.online) {
      // тот же обработчик нажатия: звук стартует сразу, не ждёт сеть
      void applyLive(known);
    } else {
      fetchRadioState()
        .then((s) => acceptRef.current(s))
        .catch(() => setStatus("error"));
    }
  }, [setTuned, ensureSocket, join, applyLive]);

  const leave = useCallback(() => {
    const wasLive = Boolean(playerRef.current.currentTrack?.live);
    leaveQuietly();
    if (wasLive) playerRef.current.close();
  }, [leaveQuietly]);

  const refresh = useCallback(() => {
    fetchRadioState()
      .then(acceptRef.current)
      .catch(() => {
        if (tunedInRef.current) setStatus("error");
      });
  }, []);

  // Плеер зовёт эти обработчики для живого трека вместо обычных play/pause/retry.
  const registerLiveController = player.registerLiveController;
  useEffect(() => {
    registerLiveController({ resume: tuneIn, onPause: leaveQuietly, retry: refresh });
    return () => registerLiveController(null);
  }, [registerLiveController, tuneIn, leaveQuietly, refresh]);

  // Вернулись в приложение / появилась сеть: перечитываем эфир и подтягиваем позицию.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && (tunedInRef.current || viewersRef.current > 0)) refresh();
    };
    const onOnline = () => {
      socketRef.current?.connect();
      if (tunedInRef.current) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  // Выход из аккаунта: отключиться, забыть эфир.
  useEffect(() => {
    const onLogout = () => {
      leaveQuietly();
      socketRef.current?.disconnect();
      socketRef.current = null;
      stateRef.current = null;
      setState(null);
      setConnected(false);
      setListeners(0);
    };
    window.addEventListener("app:logout", onLogout);
    return () => window.removeEventListener("app:logout", onLogout);
  }, [leaveQuietly]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    },
    [],
  );

  const positionSec = useCallback(() => positionOf(stateRef.current), [positionOf]);

  const value = useMemo<RadioContextValue>(
    () => ({ state, listeners, listenerUsers, tunedIn, status, connected, watch, tuneIn, leave, refresh, positionSec }),
    [state, listeners, listenerUsers, tunedIn, status, connected, watch, tuneIn, leave, refresh, positionSec],
  );

  return (
    <RadioContext.Provider value={value}>
      {children}
      <RadioDriftGuard />
    </RadioContext.Provider>
  );
}

/** Раз в несколько секунд сверяет позицию плеера с эфиром и подтягивает её при расхождении больше DRIFT_SEC. */
function RadioDriftGuard() {
  const { currentTrack, isPlaying, playLive } = usePlayer();
  const { currentTime } = usePlayerTime();
  const radio = useRadio();
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (!currentTrack?.live || !isPlaying || !radio.tunedIn) return;
    const now = Date.now();
    if (now - lastCheckRef.current < DRIFT_CHECK_EVERY_MS) return;
    lastCheckRef.current = now;
    const expected = radio.positionSec();
    if (Math.abs(currentTime - expected) > DRIFT_SEC) void playLive(currentTrack, expected);
  }, [currentTime, currentTrack, isPlaying, radio, playLive]);

  return null;
}
