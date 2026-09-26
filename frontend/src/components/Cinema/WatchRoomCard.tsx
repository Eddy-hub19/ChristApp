"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Crown, FileVideo, Globe, Pause, Play, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  watchUserName,
  type WatchInvitationCard,
  type WatchRoomCard as WatchRoomCardData,
} from "@/lib/queries/watchRoomsQueries";
import { youTubeThumbnailUrl } from "@/lib/youtube";
import styles from "./Cinema.module.scss";

type WatchRoomCardProps = {
  room: WatchRoomCardData | WatchInvitationCard;
  index: number;
  invitation?: {
    onAccept: () => void;
    onDecline: () => void;
    busy: boolean;
  };
};

/** Лише FILE/IFRAME/MANUAL зберігають у videoId повний URL — решта провайдерів лише голий id. */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default function WatchRoomCard({ room, index, invitation }: WatchRoomCardProps) {
  const t = useTranslations("cinema");
  const invitedBy = "invitedBy" in room ? room.invitedBy : null;
  // onError теж зводить до заглушки — окрема, окремо триггерована умова (не showPlaceholder
  // напряму), інакше React перезаходив би в img після кожного ре-рендеру з тим самим "битим" src.
  const [imgFailed, setImgFailed] = useState(false);

  const thumbSrc =
    room.thumbnailUrl ?? (room.provider === "YOUTUBE" ? youTubeThumbnailUrl(room.videoId, "mq") : null);
  const showPlaceholder = !thumbSrc || imgFailed;
  const placeholderLabel = showPlaceholder
    ? hostnameOf(room.videoId) ?? t(`roomCard.provider${capitalize(room.provider)}`)
    : null;
  const PlaceholderIcon = room.provider === "FILE" ? FileVideo : Globe;

  const body = (
    <>
      <div className={styles.cardThumb}>
        {showPlaceholder ? (
          <div className={styles.cardThumbPlaceholder}>
            <PlaceholderIcon size={22} aria-hidden />
            <span>{placeholderLabel}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- прев'ю із зовнішніх джерел (i.ytimg.com, vimeocdn, dailymotion тощо)
          <img src={thumbSrc} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        )}
        <span className={`${styles.cardStatus} ${room.isPlaying ? styles.cardStatusLive : ""}`}>
          {room.isPlaying ? <Play size={11} fill="currentColor" /> : <Pause size={11} fill="currentColor" />}
          {room.isPlaying ? t("statusPlaying") : t("statusPaused")}
        </span>
      </div>
      <div className={styles.cardInfo}>
        <h3 className={styles.cardTitle}>{room.title}</h3>
        {room.videoTitle ? <p className={styles.cardVideo}>{room.videoTitle}</p> : null}
        <p className={styles.cardMeta}>
          <span>
            <Crown size={12} aria-hidden /> {watchUserName(room.host)}
          </span>
          <span>
            <Users size={12} aria-hidden /> {t("members", { count: room.memberCount })}
          </span>
          {room.presentCount > 0 ? (
            <span className={styles.cardPresent}>{t("inHall", { count: room.presentCount })}</span>
          ) : null}
        </p>
        {invitation && invitedBy ? (
          <p className={styles.cardInvitedBy}>{t("invitedBy", { name: watchUserName(invitedBy) })}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <motion.li
      className={styles.card}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.05, duration: 0.3 }}
    >
      {invitation ? (
        <div className={styles.cardInner}>
          {body}
          <div className={styles.cardActions}>
            <button type="button" className={styles.primaryButton} onClick={invitation.onAccept} disabled={invitation.busy}>
              {t("accept")}
            </button>
            <button type="button" className={styles.ghostButton} onClick={invitation.onDecline} disabled={invitation.busy}>
              {t("decline")}
            </button>
          </div>
        </div>
      ) : (
        <Link href={`/cinema/${room.id}`} className={styles.cardInner}>
          {body}
        </Link>
      )}
    </motion.li>
  );
}
