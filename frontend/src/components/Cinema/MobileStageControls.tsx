"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { formatPlaybackTime } from "@/lib/watchSync";
import type { YouTubeStageHandle } from "./YouTubeStage";
import styles from "./CinemaHall.module.scss";

const AUTO_HIDE_MS = 3000;

type MobileStageControlsProps = {
  stageRef: RefObject<YouTubeStageHandle | null>;
  isHost: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (sec: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
};

/**
 * Мобільний оверлей поверх відео, як у YouTube: play/pause, звук і повний екран
 * з'являються по тапу і ховаються за ~3с; тонка шкала прогресу лишається завжди
 * видимою внизу відео. У глядача немає play/scrubber — лише звук і повний екран.
 * Рендериться завжди (і на десктопі теж), видимість перемикає лише CSS-медіазапит —
 * так немає ризику розсинхрону з десктопною HostControls через окремий JS-прапорець.
 */
export default function MobileStageControls({
  stageRef,
  isHost,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  muted,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
}: MobileStageControlsProps) {
  const t = useTranslations("cinema.hall");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(0);
  /** Під час перетягування показуємо позицію повзунка, а seek надсилаємо лише на відпускання. */
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  };

  const show = () => {
    setVisible(true);
    scheduleHide();
  };

  const shown = scrub ?? time;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;
  const commitScrub = () => {
    const value = scrubRef.current;
    scrubRef.current = null;
    setScrub(null);
    if (value !== null) onSeek(value);
  };

  return (
    <div
      className={styles.mobileStage}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (visible) {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          setVisible(false);
        } else {
          show();
        }
      }}
    >
      <div className={`${styles.mobileOverlay} ${visible ? styles.mobileOverlayVisible : ""}`}>
        {isHost ? (
          <button
            type="button"
            className={styles.mobilePlayButton}
            onClick={(e) => {
              e.stopPropagation();
              show();
              if (isPlaying) onPause();
              else onPlay();
            }}
            aria-label={isPlaying ? t("pause") : t("play")}
          >
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
        ) : null}

        <span className={styles.mobileTime}>
          {formatPlaybackTime(shown)} / {formatPlaybackTime(duration)}
        </span>

        <div className={styles.mobileSpacer} />

        <button
          type="button"
          className={styles.mobileIconButton}
          onClick={(e) => {
            e.stopPropagation();
            show();
            onToggleMute();
          }}
          aria-label={muted ? t("unmute") : t("mute")}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        <button
          type="button"
          className={styles.mobileIconButton}
          onClick={(e) => {
            e.stopPropagation();
            show();
            onToggleFullscreen();
          }}
          aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>

      <div className={styles.mobileProgress}>
        <div className={styles.mobileProgressLoaded} style={{ width: `${loaded * 100}%` }} />
        <div className={styles.mobileProgressPlayed} style={{ width: `${pct}%` }} />
        {isHost ? (
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={Math.min(shown, Math.max(duration, 1))}
            disabled={duration <= 0}
            aria-label={t("seek")}
            aria-valuetext={`${formatPlaybackTime(shown)} / ${formatPlaybackTime(duration)}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              show();
            }}
            onChange={(e) => {
              const v = Number(e.target.value);
              scrubRef.current = v;
              setScrub(v);
              show();
            }}
            onPointerUp={commitScrub}
            onBlur={() => scrubRef.current !== null && commitScrub()}
          />
        ) : null}
      </div>
    </div>
  );
}
