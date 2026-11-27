"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { requestAudioFocus, subscribeAudioFocus } from "@/lib/audioFocus";
import MiniPlayerBar from "@/components/SheepPlayer/MiniPlayerBar";
import {
  PlayerContext,
  PlayerTimeContext,
  type AudioTrack,
  type PlayerContextValue,
} from "@/providers/playerContext";

type RoomQueue = { roomId: string; tracks: AudioTrack[] };

const ARTWORK = [
  { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
];
const POSITION_STATE_EVERY_MS = 1000;
const SEEK_STEP_SEC = 10;

const finite = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

function sameIds(a: AudioTrack[], b: AudioTrack[]) {
  return a.length === b.length && a.every((track, i) => track.id === b[i].id && track.audioUrl === b[i].audioUrl);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<AudioTrack | null>(null);
  const lastPositionStateRef = useRef(0);

  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [canSetVolume, setCanSetVolume] = useState(false);
  const [roomQueue, setRoomQueueState] = useState<RoomQueue | null>(null);

  const queue = useMemo(() => {
    if (!currentTrack) return [];
    if (roomQueue && currentTrack.roomId && roomQueue.roomId === currentTrack.roomId) return roomQueue.tracks;
    return [currentTrack];
  }, [currentTrack, roomQueue]);
  const queueRef = useRef<AudioTrack[]>(queue);
  const roomQueueRef = useRef<RoomQueue | null>(null);
  useEffect(() => {
    queueRef.current = queue;
    roomQueueRef.current = roomQueue;
  }, [queue, roomQueue]);

  const clearMediaSession = useCallback(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    } catch {
      // не всі браузери дають скинути
    }
  }, []);

  const playTrack = useCallback((track: AudioTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    requestAudioFocus("player");
    setError(false);
    if (trackRef.current?.id !== track.id || trackRef.current.audioUrl !== track.audioUrl) {
      trackRef.current = track;
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(0);
      setIsLoading(true);
      audio.src = track.audioUrl;
    }
    void audio.play().catch((e: unknown) => {
      // AbortError: трек змінили до старту; NotAllowedError: потрібен жест - стан ведуть події <audio>
      if ((e as { name?: string })?.name === "AbortError") return;
      setIsLoading(false);
    });
  }, []);

  const stopPlayer = useCallback(() => {
    const audio = audioRef.current;
    trackRef.current = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setCurrentTrack(null);
    setIsPlaying(false);
    setIsLoading(false);
    setError(false);
    setCurrentTime(0);
    setDuration(0);
    clearMediaSession();
  }, [clearMediaSession]);

  const step = useCallback(
    (delta: number) => {
      const current = trackRef.current;
      if (!current) return false;
      const list = queueRef.current;
      const index = list.findIndex((track) => track.id === current.id);
      const target = list[index + delta];
      if (index < 0 || !target) return false;
      playTrack(target);
      return true;
    },
    [playTrack],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const retry = useCallback(() => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track) return;
    requestAudioFocus("player");
    const resumeAt = audio.currentTime;
    setError(false);
    setIsLoading(true);
    audio.src = track.audioUrl;
    if (resumeAt > 0) audio.currentTime = resumeAt;
    void audio.play().catch(() => setIsLoading(false));
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    if (!audio.getAttribute("src") || audio.error) {
      retry();
      return;
    }
    requestAudioFocus("player");
    void audio.play().catch(() => setIsLoading(false));
  }, [retry]);

  const toggleTrack = useCallback(
    (clicked: AudioTrack) => {
      const audio = audioRef.current;
      if (!audio) return;
      // Бульбашка не знает комнату: берём тот же трек из зарегистрированной очереди (с roomId), чтобы работали «дальше/назад».
      const track = roomQueueRef.current?.tracks.find((item) => item.id === clicked.id) ?? clicked;
      if (trackRef.current?.id === track.id && trackRef.current.audioUrl === track.audioUrl) {
        if (audio.paused) resume();
        else audio.pause();
        return;
      }
      playTrack(track);
    },
    [playTrack, resume],
  );

  const next = useCallback(() => {
    step(1);
  }, [step]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Как в обычных плеерах: через 3 с вернуться к началу, иначе - к предыдущему.
    if (audio.currentTime > 3 || !step(-1)) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }, [step]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const max = finite(audio.duration) || seconds;
    audio.currentTime = Math.min(Math.max(0, seconds), max);
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    if (audioRef.current) audioRef.current.volume = next;
    setVolumeState(next);
  }, []);

  const setRoomQueue = useCallback((roomId: string, tracks: AudioTrack[] | null) => {
    setRoomQueueState((prev) => {
      if (!tracks) return prev?.roomId === roomId ? null : prev;
      if (prev && prev.roomId === roomId && sameIds(prev.tracks, tracks)) return prev;
      return { roomId, tracks };
    });
  }, []);

  // Единственный <audio> приложения для треков: создаётся один раз, слушатели снимаются при размонтировании.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.setAttribute("playsinline", "");
    audioRef.current = audio;

    // iOS игнорирует audio.volume: проверяем, держится ли значение.
    const probe = new Audio();
    probe.volume = 0.5;
    setCanSetVolume(probe.volume === 0.5);

    const onLoading = () => {
      if (trackRef.current) setIsLoading(true);
    };
    const onReady = () => setIsLoading(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      const now = Date.now();
      if (now - lastPositionStateRef.current < POSITION_STATE_EVERY_MS) return;
      lastPositionStateRef.current = now;
      const total = finite(audio.duration);
      if (!total || !("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: total,
          position: Math.min(audio.currentTime, total),
          playbackRate: audio.playbackRate || 1,
        });
      } catch {
        // позиция вне диапазона на смене трека - пропускаем тик
      }
    };
    const onDuration = () => setDuration(finite(audio.duration));
    const onEnded = () => {
      setIsPlaying(false);
      const current = trackRef.current;
      const list = queueRef.current;
      const index = current ? list.findIndex((track) => track.id === current.id) : -1;
      const following = index >= 0 ? list[index + 1] : undefined;
      if (following) playTrack(following);
      else setCurrentTime(0);
    };
    const onError = () => {
      // Пустой src после close() тоже даёт error: без трека это не сбой.
      if (!trackRef.current) return;
      setIsPlaying(false);
      setIsLoading(false);
      setError(true);
    };

    const events: [string, () => void][] = [
      ["loadstart", onLoading],
      ["waiting", onLoading],
      ["stalled", onLoading],
      ["canplay", onReady],
      ["playing", onReady],
      ["play", onPlay],
      ["pause", onPause],
      ["timeupdate", onTime],
      ["durationchange", onDuration],
      ["loadedmetadata", onDuration],
      ["ended", onEnded],
      ["error", onError],
    ];
    events.forEach(([name, handler]) => audio.addEventListener(name, handler));

    return () => {
      events.forEach(([name, handler]) => audio.removeEventListener(name, handler));
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, [playTrack]);

  // Голосовое сообщение (или другой источник) просит звук: трек замолкает.
  useEffect(
    () =>
      subscribeAudioFocus((owner) => {
        if (owner !== "player") audioRef.current?.pause();
      }),
    [],
  );

  // Выход из аккаунта: остановить и забыть трек, очередь и Media Session.
  useEffect(() => {
    const onLogout = () => {
      setRoomQueueState(null);
      stopPlayer();
    };
    window.addEventListener("app:logout", onLogout);
    return () => window.removeEventListener("app:logout", onLogout);
  }, [stopPlayer]);

  // Связь вернулась после сбоя - пробуем ещё раз с того же места.
  useEffect(() => {
    const onOnline = () => {
      if (trackRef.current && audioRef.current?.error) retry();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);

  // Media Session: метаданные и кнопки экрана блокировки.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentTrack) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist ?? "Christ App",
        artwork: currentTrack.cover ? [{ src: currentTrack.cover }] : ARTWORK,
      });
    } catch {
      // MediaMetadata недоступен
    }
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !currentTrack) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    } catch {
      // не критично
    }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => resume()],
      ["pause", () => pause()],
      ["previoustrack", () => prev()],
      ["nexttrack", () => next()],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") seek(details.seekTime);
        },
      ],
      ["seekbackward", () => seek((audioRef.current?.currentTime ?? 0) - SEEK_STEP_SEC)],
      ["seekforward", () => seek((audioRef.current?.currentTime ?? 0) + SEEK_STEP_SEC)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // действие не поддерживается платформой
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ничего
        }
      }
    };
  }, [resume, pause, prev, next, seek]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrack,
      isPlaying,
      isLoading,
      error,
      queue,
      volume,
      canSetVolume,
      toggleTrack,
      pause,
      resume,
      next,
      prev,
      seek,
      setVolume,
      close: stopPlayer,
      retry,
      setRoomQueue,
    }),
    [currentTrack, isPlaying, isLoading, error, queue, volume, canSetVolume, toggleTrack, pause, resume, next, prev, seek, setVolume, stopPlayer, retry, setRoomQueue],
  );
  const timeValue = useMemo(() => ({ currentTime, duration }), [currentTime, duration]);

  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={timeValue}>
        {children}

        <MiniPlayerBar />
      </PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  );
}

export { usePlayer, usePlayerTime, type AudioTrack, type PlayerContextValue } from "@/providers/playerContext";
