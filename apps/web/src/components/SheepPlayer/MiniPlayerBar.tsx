"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext";
import { usePathname } from "@/i18n/navigation";
import { isFullscreenPath } from "@/lib/fullscreenRoutes";
import { usePlayer } from "@/providers/playerContext";
import SheepFigure from "./SheepFigure";
import SheepPlayerSheet, { sheepStateOf } from "./SheepPlayerSheet";
import styles from "./SheepPlayer.module.scss";

/** Внутри чата управление живёт в карточке SheepPlayer рядом с закрепами: там мини-полоска не нужна. */
function isChatRoomPath(pathname: string): boolean {
  return /^\/chat\/[^/]+/.test(pathname);
}

/** Компактная полоска над навбаром вне чата: овечка, название и play/pause, чтобы управление не пропадало. */
export default function MiniPlayerBar() {
  const t = useTranslations("player");
  const p = usePlayer();
  const pathname = (usePathname() ?? "").replace(/\/+$/, "");
  const overlay = useTabBarOverlayOptional();
  const [sheetOpen, setSheetOpen] = useState(false);

  const track = p.currentTrack;
  if (!track) return null;
  // Нет навбара (игра на весь экран) или мы в чате - полоска не нужна.
  if (isChatRoomPath(pathname) || isFullscreenPath(pathname) || overlay?.fullscreenActive) return null;

  return (
    <>
      <div className={styles.mini} role="region" aria-label={t("miniRegion")}>
        <button type="button" className={styles.miniMain} onClick={() => setSheetOpen(true)} aria-label={`${t("open")}: ${track.title}`}>
          <SheepFigure state={sheepStateOf(p.isPlaying, p.isLoading)} size={28} />
          <span className={styles.miniTitle}>{track.title}</span>
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.playBtn}`}
          onClick={() => (p.isPlaying ? p.pause() : p.resume())}
          aria-label={p.isPlaying ? t("pause") : t("play")}
        >
          {p.isPlaying ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
      </div>
      <SheepPlayerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
