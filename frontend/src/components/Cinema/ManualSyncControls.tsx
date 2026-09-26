"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Link2, Maximize, Minimize, Play } from "lucide-react";
import {
  formatPlaybackTime,
  manualElapsedSec,
  manualSecondsLeft,
  type ManualSyncState,
  type ServerClock,
} from "@/lib/watchSync";
import styles from "./CinemaHall.module.scss";

type ManualSyncControlsProps = {
  manual: ManualSyncState;
  clock: ServerClock;
  isHost: boolean;
  isReady: boolean;
  readyCount: number;
  totalCount: number;
  onToggleReady: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Мобільний оверлей поверх відео — компактніше й без рамки-панелі. */
  compact?: boolean;
};

/**
 * Панель для IFRAME/MANUAL: немає програмного керування чужим плеєром, тож синхронізуємо
 * МОМЕНТ, а не позицію — спільний відлік 3-2-1 за серверним годинником (той самий, що й у
 * автосинхронізованих провайдерів), готовність учасників і пауза/резюм для всіх одразу.
 * Рендериться і на десктопі (в потоці під екраном), і на мобільному (оверлей на відео,
 * завжди видимий — на відміну від MobileStageControls тут немає play/scrubber, ховати нічого).
 */
export default function ManualSyncControls({
  manual,
  clock,
  isHost,
  isReady,
  readyCount,
  totalCount,
  onToggleReady,
  onStart,
  onPause,
  onResume,
  isFullscreen,
  onToggleFullscreen,
  compact,
}: ManualSyncControlsProps) {
  const t = useTranslations("cinema.hall");
  // Відлік читаємо з годинника (clock.now()), тож для живого "3…2…1" потрібен власний тік.
  const [, tick] = useState(0);

  useEffect(() => {
    if (manual.phase !== "countdown" && manual.phase !== "running") return;
    // countdown: 200мс для плавного "3…2…1"; running: раз на секунду досить для лічильника.
    const id = setInterval(() => tick((n) => n + 1), manual.phase === "countdown" ? 200 : 1000);
    return () => clearInterval(id);
  }, [manual.phase]);

  const secondsLeft =
    manual.phase === "countdown" && manual.countdownEndsAt !== null
      ? manualSecondsLeft(manual.countdownEndsAt, clock.now())
      : null;
  const elapsedText =
    manual.phase === "running" ? formatPlaybackTime(manualElapsedSec(manual, clock.now())) : null;

  return (
    <div className={`${styles.manualControls} ${compact ? styles.manualControlsCompact : ""}`}>
      <span className={styles.manualBadge}>
        <Link2 size={12} aria-hidden /> {t("manualSync")}
      </span>

      <div className={styles.manualMain}>
        {secondsLeft !== null ? (
          <span className={styles.manualCountdown} aria-live="assertive">
            {secondsLeft > 0 ? secondsLeft : "▶"}
          </span>
        ) : manual.phase === "idle" ? (
          <>
            <button
              type="button"
              className={`${styles.manualReadyButton} ${isReady ? styles.manualReadyActive : ""}`}
              onClick={onToggleReady}
              aria-pressed={isReady}
            >
              {isReady ? <Check size={14} aria-hidden /> : null} {t("manualReady")}
            </button>
            <span className={styles.manualReadyCount}>
              {t("manualReadyCount", { ready: readyCount, total: totalCount })}
            </span>
            {isHost ? (
              <button type="button" className={styles.manualPrimaryButton} onClick={onStart}>
                <Play size={14} fill="currentColor" aria-hidden /> {t("manualStart")}
              </button>
            ) : null}
          </>
        ) : manual.phase === "running" ? (
          isHost ? (
            <>
              <span className={styles.manualStatusText}>
                {t("manualRunningElapsed", { time: elapsedText ?? "" })}
              </span>
              <button type="button" className={styles.manualPrimaryButton} onClick={onPause}>
                {t("manualPauseForAll")}
              </button>
            </>
          ) : (
            <span className={styles.manualStatusText}>
              {t("manualRunningElapsed", { time: elapsedText ?? "" })}
            </span>
          )
        ) : (
          <>
            <span className={styles.manualStatusText}>{t("manualPaused")}</span>
            {isHost ? (
              <button type="button" className={styles.manualPrimaryButton} onClick={onResume}>
                {t("manualResume")}
              </button>
            ) : null}
          </>
        )}
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
  );
}
