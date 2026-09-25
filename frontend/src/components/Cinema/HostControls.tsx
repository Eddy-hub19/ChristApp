"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Crown, Maximize, Minimize, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { formatPlaybackTime } from "@/lib/watchSync";
import type { YouTubeStageHandle } from "./YouTubeStage";
import styles from "./CinemaHall.module.scss";

type HostControlsProps = {
  stageRef: RefObject<YouTubeStageHandle | null>;
  /** Чи цей користувач — хост кімнати. Визначає підпис, корону і доступність кнопок. */
  isHost: boolean;
  /** Чи плеєр уже змонтований (був жест користувача). До цього play/scrubber самі це виправляють. */
  entered: boolean;
  /** Монтує плеєр без відправки play/pause/seek — викликається з першого дотику до scrubber-а. */
  onEnter: () => void;
  hostName: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (sec: number) => void;
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
};

/**
 * Панель під екраном. Хост керує переглядом; глядачі бачать ту саму шкалу, але неактивну,
 * з підписом «Керує: …». Гучність і повноекранний режим — особисті, доступні всім.
 */
export default function HostControls({
  stageRef,
  isHost,
  entered,
  onEnter,
  hostName,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  volume,
  muted,
  onVolume,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
}: HostControlsProps) {
  const t = useTranslations("cinema.hall");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(0);
  /** Під час перетягування показуємо позицію повзунка, а seek надсилаємо лише на відпускання. */
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  /** Торкнулись повзунка до входу в залу: справжню тривалість ще не знаємо, тож запам'ятовуємо
   *  ЧАСТКУ шкали (0..1), а не секунди — і домотуємо, щойно плеєр змонтується й повідомить duration. */
  const pendingSeekFractionRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const stage = stageRef.current;
      if (!stage) return;
      setTime(stage.getCurrentTime());
      setDuration(stage.getDuration());
      setLoaded(stage.getLoadedFraction());
    }, 250);
    return () => clearInterval(id);
  }, [stageRef]);

  useEffect(() => {
    if (pendingSeekFractionRef.current === null || duration <= 0) return;
    const target = pendingSeekFractionRef.current * duration;
    pendingSeekFractionRef.current = null;
    onSeek(target);
  }, [duration, onSeek]);

  const shown = scrub ?? time;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;
  const commitScrub = () => {
    const value = scrubRef.current;
    scrubRef.current = null;
    setScrub(null);
    if (value !== null) onSeek(value);
  };
  /** Перший дотик до ще незмонтованого плеєра: тільки заходимо в залу й запам'ятовуємо,
   *  куди саме торкнулись (часткою довжини шкали) — сам seek піде, щойно відомою стане duration. */
  const handleFirstTouch = (clientX: number, target: HTMLElement) => {
    if (entered) return;
    const rect = target.getBoundingClientRect();
    pendingSeekFractionRef.current =
      rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    onEnter();
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className={styles.controls}>
      <div className={styles.progressRow}>
        <span className={styles.time}>{formatPlaybackTime(shown)}</span>
        <div className={styles.progress}>
          <div className={styles.progressLoaded} style={{ width: `${loaded * 100}%` }} />
          <div className={styles.progressPlayed} style={{ width: `${pct}%` }} />
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={Math.min(shown, Math.max(duration, 1))}
            disabled={!isHost || (entered && duration <= 0)}
            aria-label={t("seek")}
            aria-valuetext={`${formatPlaybackTime(shown)} / ${formatPlaybackTime(duration)}`}
            onPointerDown={(e) => handleFirstTouch(e.clientX, e.currentTarget)}
            onKeyDown={() => {
              if (!entered) onEnter();
            }}
            onChange={(e) => {
              // До входу в залу шкала ще не має реальної тривалості (max=1) — значення з неї
              // нічого не означає; ігноруємо, доки не запрацює ефект вище з реальним duration.
              if (!entered) return;
              const v = Number(e.target.value);
              scrubRef.current = v;
              setScrub(v);
            }}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={() => scrubRef.current !== null && commitScrub()}
          />
        </div>
        <span className={styles.time}>{formatPlaybackTime(duration)}</span>
      </div>

      <div className={styles.buttonsRow}>
        <button
          type="button"
          className={styles.playButton}
          onClick={isPlaying ? onPause : onPlay}
          disabled={!isHost}
          aria-label={isPlaying ? t("pause") : t("play")}
        >
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>

        <span className={`${styles.controlledBy} ${isHost ? styles.controlledByMe : ""}`}>
          <Crown size={14} aria-hidden />
          {isHost ? t("youControl") : t("controlledBy", { name: hostName })}
        </span>

        <div className={styles.volume}>
          <button
            type="button"
            className={styles.hallIconButton}
            onClick={onToggleMute}
            aria-label={muted ? t("unmute") : t("mute")}
          >
            <VolumeIcon size={18} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label={t("volume")}
          />
        </div>

        <button
          type="button"
          className={styles.hallIconButton}
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>
    </div>
  );
}
