"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clapperboard, X } from "lucide-react";
import {
  formatPlaybackTime,
  manualElapsedSec,
  type ManualSyncState,
  type ServerClock,
} from "@/lib/watchSync";
import { miniBottomClearance, useMiniViewport } from "./miniLayout";
import styles from "./CinemaMini.module.scss";

type ManualMiniBadgeProps = {
  roomTitle: string;
  manual: ManualSyncState;
  clock: ServerClock;
  unread: number;
  pathname: string;
  onOpen: () => void;
  onClose: () => void;
};

/**
 * Ручний режим (IFRAME/MANUAL): вбудований плеєр не синхронізується програмно, тож мініплеєр не потрібен —
 * при виході з кімнати лишається лише плашка «Показ іде · 12:34» з переходом назад.
 */
export default function ManualMiniBadge({
  roomTitle,
  manual,
  clock,
  unread,
  pathname,
  onOpen,
  onClose,
}: ManualMiniBadgeProps) {
  const t = useTranslations("cinema.mini");
  const vp = useMiniViewport();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (vp.w === 0 || vp.keyboardOpen) return null;

  const time = formatPlaybackTime(manualElapsedSec(manual, clock.now()));
  const label =
    manual.phase === "running"
      ? t("manualRunning", { time })
      : manual.phase === "paused"
        ? t("manualPaused", { time })
        : t("manualCountdown");

  return (
    <div
      className={styles.manualBadge}
      style={{
        bottom: miniBottomClearance(pathname, vp.safe.bottom),
        right: Math.max(8, vp.safe.right),
      }}
    >
      <button
        type="button"
        className={styles.manualOpen}
        onClick={onOpen}
        aria-label={t("expand")}
      >
        <Clapperboard size={16} aria-hidden />
        <span className={styles.manualText}>
          <span className={styles.manualTitle}>{roomTitle}</span>
          <span>{label}</span>
        </span>
        {unread > 0 ? (
          <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>
      <button
        type="button"
        className={styles.iconButton}
        onClick={onClose}
        aria-label={t("close")}
      >
        <X size={16} />
      </button>
    </div>
  );
}
