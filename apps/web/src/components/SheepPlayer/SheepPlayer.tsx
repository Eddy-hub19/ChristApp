"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { usePlayer, usePlayerTime } from "@/providers/playerContext";
import SheepFigure from "./SheepFigure";
import SheepPlayerSheet, { formatTime, sheepStateOf } from "./SheepPlayerSheet";
import styles from "./SheepPlayer.module.scss";

const COLLAPSED_KEY = "christapp:sheep-player:collapsed";

function ThinProgress() {
  const t = useTranslations("player");
  const { currentTime, duration } = usePlayerTime();
  return (
    <div
      className={styles.thin}
      role="progressbar"
      aria-label={t("progress")}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(Math.min(currentTime, duration || 0))}
      aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
    >
      <span className={styles.thinFill} style={{ transform: `scaleX(${duration ? Math.min(1, currentTime / duration) : 0})` }} />
    </div>
  );
}

/**
 * Плеер-овечка в зоне закрепов чата: карточка (~56 px) или свёрнутая пилюля. Закреп, если он есть, лежит ниже;
 * без трека компонент ничего не рисует, и закрепы выглядят как раньше.
 */
export default function SheepPlayer() {
  const t = useTranslations("player");
  const p = usePlayer();
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // приватный режим: просто не запоминаем
    }
  }, []);

  const track = p.currentTrack;
  if (!track) return null;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // не критично
      }
      return next;
    });
  };
  const state = sheepStateOf(p.isPlaying, p.isLoading);
  const playLabel = p.isPlaying ? t("pause") : t("play");
  const playButton = (
    <button type="button" className={`${styles.iconBtn} ${styles.playBtn}`} onClick={() => (p.isPlaying ? p.pause() : p.resume())} aria-label={playLabel}>
      {p.isPlaying ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
    </button>
  );

  if (collapsed) {
    return (
      <div className={`${styles.card} ${styles.cardCollapsed}`} role="region" aria-label={t("region")}>
        <button type="button" className={styles.figureBtn} onClick={() => setSheetOpen(true)} aria-label={t("open")}>
          <SheepFigure state={state} size={28} />
        </button>
        {playButton}
        <button type="button" className={styles.iconBtn} onClick={toggleCollapsed} aria-label={t("expand")} aria-expanded={false}>
          <ChevronDown size={16} aria-hidden />
        </button>
        <SheepPlayerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </div>
    );
  }

  return (
    <div className={styles.card} role="region" aria-label={t("region")} data-state={state}>
      <button type="button" className={styles.main} onClick={() => setSheetOpen(true)} aria-label={`${t("open")}: ${track.title}`}>
        <SheepFigure state={state} size={36} />
        <span className={styles.text}>
          <span className={styles.title}>{track.title}</span>
          <span className={styles.artist}>{p.error ? t("error") : track.artist ?? t("unknownArtist")}</span>
        </span>
      </button>
      <span className={styles.controls}>
        <button type="button" className={`${styles.iconBtn} ${styles.skipBtn}`} onClick={p.prev} aria-label={t("prev")}>
          <SkipBack size={16} aria-hidden />
        </button>
        {playButton}
        <button type="button" className={`${styles.iconBtn} ${styles.skipBtn}`} onClick={p.next} aria-label={t("next")}>
          <SkipForward size={16} aria-hidden />
        </button>
        <button type="button" className={styles.iconBtn} onClick={toggleCollapsed} aria-label={t("collapse")} aria-expanded>
          <ChevronUp size={16} aria-hidden />
        </button>
        <button type="button" className={styles.iconBtn} onClick={p.close} aria-label={t("close")}>
          <X size={16} aria-hidden />
        </button>
      </span>
      <ThinProgress />
      <SheepPlayerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
