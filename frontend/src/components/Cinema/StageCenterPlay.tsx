"use client";

import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import styles from "./CinemaHall.module.scss";

type StageCenterPlayProps = {
  isHost: boolean;
  onPlay: () => void;
};

/**
 * Наш великий Play по центру, коли відео на паузі. Суцільне затемнення лежить поверх плеєра, тож стандартні
 * елементи провайдера (великий Play YouTube, підказки «ще відео» на паузі) під ним не видно
 * й не клікаються — інакше глядач міг би запустити відео мимо синхронізації.
 * Хост запускає відео для всіх; глядач бачить паузу без дії («Хост поставив на паузу»).
 * Поки відео грає, шару немає зовсім — тап/клік іде у звичайні контролі.
 */
export default function StageCenterPlay({ isHost, onPlay }: StageCenterPlayProps) {
  const t = useTranslations("cinema.hall");

  return (
    <>
      {/* Затемнення лежить під мобільним оверлеєм керування (.mobileStage), щоб на паузі лишались перемотка, звук і fullscreen */}
      <div className={styles.centerPlay} aria-hidden />
      <div className={styles.centerPlayAnchor}>
        {isHost ? (
          <button type="button" className={styles.centerPlayButton} onClick={onPlay} aria-label={t("play")}>
            <Play size={34} fill="currentColor" />
          </button>
        ) : (
          <span className={styles.centerPlayIdle} role="status">
            <Pause size={26} fill="currentColor" aria-hidden />
            <span>{t("pausedByHost")}</span>
          </span>
        )}
      </div>
    </>
  );
}
