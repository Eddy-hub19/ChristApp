"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Maximize2, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import styles from "./CinemaMini.module.scss";

type Pos = { left: number; top: number };

type MiniOverlayProps = {
  title: string;
  isHost: boolean;
  isPlaying: boolean;
  muted: boolean;
  unread: number;
  /** Де вікно стоїть прямо зараз — від цієї точки рахуємо перетягування. */
  origin: Pos;
  onPlay: () => void;
  onPause: () => void;
  onToggleMute: () => void;
  onExpand: () => void;
  onClose: () => void;
  onDrag: (pos: Pos) => void;
  onDrop: (pos: Pos) => void;
};

const DRAG_THRESHOLD_PX = 6;

/**
 * Шар керування поверх мініплеєра. Перекриває iframe повністю — інакше плеєр з'їдав би
 * pointer-події і вікно не можна було б ні перетягнути, ні тапнути.
 * Тап без руху = «повернутись у кімнату»; рух далі за поріг = перетягування до найближчого кута.
 */
export default function MiniOverlay({
  title,
  isHost,
  isPlaying,
  muted,
  unread,
  origin,
  onPlay,
  onPause,
  onToggleMute,
  onExpand,
  onClose,
  onDrag,
  onDrop,
}: MiniOverlayProps) {
  const t = useTranslations("cinema.mini");
  const dragRef = useRef<{
    sx: number;
    sy: number;
    start: Pos;
    last: Pos;
    moved: boolean;
  } | null>(null);

  return (
    <div
      className={styles.overlay}
      role="group"
      aria-label={title}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          sx: e.clientX,
          sy: e.clientY,
          start: origin,
          last: origin,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        d.moved = true;
        d.last = { left: d.start.left + dx, top: d.start.top + dy };
        onDrag(d.last);
      }}
      onPointerUp={() => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        if (d.moved) onDrop(d.last);
        else onExpand();
      }}
      onPointerCancel={() => {
        const d = dragRef.current;
        dragRef.current = null;
        if (d?.moved) onDrop(d.last);
      }}
    >
      <div className={styles.topRow}>
        <span className={styles.title}>{title}</span>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label={t("close")}
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.bottomRow}>
        {isHost ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={isPlaying ? onPause : onPlay}
            aria-label={isPlaying ? t("pause") : t("play")}
          >
            {isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggleMute}
          aria-label={muted ? t("unmute") : t("mute")}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.iconButton}
          onClick={onExpand}
          aria-label={t("expand")}
        >
          <Maximize2 size={16} />
          {unread > 0 ? (
            <span
              className={styles.badge}
              aria-label={t("newMessages", { count: unread })}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
