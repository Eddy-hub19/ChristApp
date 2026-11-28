"use client";

import { useTranslations } from "next-intl";
import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import Sheet from "@/components/Cinema/Sheet";
import { usePlayer, usePlayerTime } from "@/providers/playerContext";
import SheepFigure, { type SheepState } from "./SheepFigure";
import styles from "./SheepPlayer.module.scss";

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function sheepStateOf(isPlaying: boolean, isLoading: boolean): SheepState {
  if (isLoading) return "loading";
  return isPlaying ? "playing" : "paused";
}

function SeekBar() {
  const t = useTranslations("player");
  const { seek } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const text = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  return (
    <div className={styles.seekRow}>
      <span className={styles.time}>{formatTime(currentTime)}</span>
      <input
        type="range"
        className={styles.range}
        min={0}
        max={duration || 0}
        step={0.5}
        value={Math.min(currentTime, duration || 0)}
        disabled={!duration}
        onChange={(e) => seek(parseFloat(e.target.value))}
        aria-label={t("progress")}
        aria-valuetext={text}
      />
      <span className={styles.time}>{formatTime(duration)}</span>
    </div>
  );
}

/** Шторка плеера: перемотка, управление, громкость (где платформа позволяет) и очередь аудио чата. */
export default function SheepPlayerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("player");
  const p = usePlayer();
  const track = p.currentTrack;
  if (!track) return null;

  return (
    <Sheet open={open} onClose={onClose} title={t("sheetTitle")}>
      <div className={styles.sheetBody}>
        <div className={styles.sheetHero}>
          <SheepFigure state={sheepStateOf(p.isPlaying, p.isLoading)} size={88} />
          <p className={styles.sheetTitle}>{track.title}</p>
          <p className={styles.sheetArtist}>{track.live ? `${t("live")} · ${track.artist || t("liveSubtitle")}` : (track.artist ?? t("unknownArtist"))}</p>
          {p.isLoading ? <p className={styles.status}>{t("loading")}</p> : null}
          {p.error ? (
            <p className={styles.statusError} role="alert">
              {t("error")}{" "}
              <button type="button" className={styles.linkButton} onClick={p.retry}>
                {t("retry")}
              </button>
            </p>
          ) : null}
        </div>

        {track.live ? null : <SeekBar />}

        <div className={styles.sheetControls}>
          {track.live ? null : (
            <button type="button" className={styles.iconBtn} onClick={p.prev} aria-label={t("prev")}>
              <SkipBack size={20} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.playBig}`}
            onClick={() => (p.isPlaying ? p.pause() : p.resume())}
            aria-label={p.isPlaying ? t("pause") : t("play")}
          >
            {p.isPlaying ? <Pause size={24} aria-hidden /> : <Play size={24} aria-hidden />}
          </button>
          {track.live ? null : (
            <button type="button" className={styles.iconBtn} onClick={p.next} aria-label={t("next")}>
              <SkipForward size={20} aria-hidden />
            </button>
          )}
        </div>

        {p.canSetVolume ? (
          <label className={styles.volumeRow}>
            <Volume2 size={18} aria-hidden />
            <input
              type="range"
              className={styles.range}
              min={0}
              max={1}
              step={0.05}
              value={p.volume}
              onChange={(e) => p.setVolume(parseFloat(e.target.value))}
              aria-label={t("volume")}
              aria-valuetext={`${Math.round(p.volume * 100)}%`}
            />
          </label>
        ) : null}

        {!track.live && p.queue.length > 1 ? (
          <section className={styles.queue} aria-label={t("queue")}>
            <h3 className={styles.queueTitle}>{t("queue")}</h3>
            <ul className={styles.queueList}>
              {p.queue.map((item) => {
                const current = item.id === track.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`${styles.queueItem} ${current ? styles.queueItemActive : ""}`}
                      onClick={() => p.toggleTrack(item)}
                      aria-label={t("queueItem", { title: item.title })}
                      aria-current={current ? "true" : undefined}
                    >
                      <span className={styles.queueName}>{item.title}</span>
                      {item.artist ? <span className={styles.queueArtist}>{item.artist}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
