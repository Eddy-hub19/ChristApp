"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "@/providers/PlayerProvider.module.scss";

export interface AudioTrack {
  audioUrl: string;
  title: string;
  artist?: string;
  cover?: string;
}

interface PlayerContextValue {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  toggleTrack: (track: AudioTrack) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleTrack = useCallback(
    async (track: AudioTrack) => {
      const audio = audioRef.current;
      if (!audio) return;

      try {
        if (currentTrack?.audioUrl === track.audioUrl) {
          if (audio.paused) {
            await audio.play();
          } else {
            audio.pause();
          }
          return;
        }

        setCurrentTrack(track);
        audio.src = track.audioUrl;
        await audio.play();
      } catch {
        // play() отклоняется при смене трека/автоплее — состояние ведут события <audio>
      }
    },
    [currentTrack],
  );

  const value = useMemo(
    () => ({ currentTrack, isPlaying, toggleTrack }),
    [currentTrack, isPlaying, toggleTrack],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {currentTrack ? (
        <div className={styles.bar} role="region" aria-label="Плеер">
          {currentTrack.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentTrack.cover}
              alt={currentTrack.title}
              className={styles.cover}
            />
          ) : null}
          <div className={styles.info}>
            <p className={styles.title}>{currentTrack.title}</p>
            {currentTrack.artist ? (
              <p className={styles.artist}>{currentTrack.artist}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.button}
            onClick={() => toggleTrack(currentTrack)}
          >
            {isPlaying ? "Пауза" : "Играть"}
          </button>
        </div>
      ) : null}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
