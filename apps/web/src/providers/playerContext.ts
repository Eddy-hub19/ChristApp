"use client";

import { createContext, useContext } from "react";

export interface AudioTrack {
  /** Стабильный id (id сообщения с файлом): по нему трек узнаётся в очереди и в пузыре. */
  id: string;
  audioUrl: string;
  title: string;
  artist?: string;
  cover?: string;
  /** Комната, из которой трек: её аудиофайлы складываются в очередь. */
  roomId?: string;
}

export interface PlayerContextValue {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  /** Трек грузится или буферизуется. */
  isLoading: boolean;
  error: boolean;
  queue: AudioTrack[];
  volume: number;
  /** false на iPhone: Safari игнорирует audio.volume (громкость - кнопками устройства). */
  canSetVolume: boolean;
  toggleTrack: (track: AudioTrack) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  close: () => void;
  retry: () => void;
  /** Чат регистрирует свои аудиофайлы как очередь; `null` снимает очередь этой комнаты. */
  setRoomQueue: (roomId: string, tracks: AudioTrack[] | null) => void;
}

export interface PlayerTimeValue {
  currentTime: number;
  duration: number;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
export const PlayerTimeContext = createContext<PlayerTimeValue>({ currentTime: 0, duration: 0 });

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}

/** Время и длительность - отдельно, чтобы тики timeupdate не перерисовывали все пузыри чата. */
export function usePlayerTime() {
  return useContext(PlayerTimeContext);
}
