"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import PersonAvatar from "./PersonAvatar";
import type { HallMember } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

type SeatsRowProps = {
  members: HallMember[];
  hostId: string;
  presentIds: Set<string>;
  currentUserId: string | undefined;
  canTransfer: boolean;
  onSeatClick: (member: HallMember) => void;
};

/** Глядачі як ряд крісел: хто в залі — «світиться», хост — з короною. */
export default function SeatsRow({
  members,
  hostId,
  presentIds,
  currentUserId,
  canTransfer,
  onSeatClick,
}: SeatsRowProps) {
  const t = useTranslations("cinema.hall");
  const joined = members
    .filter((m) => m.status === "JOINED")
    .sort((a, b) => Number(presentIds.has(b.id)) - Number(presentIds.has(a.id)));

  return (
    <div className={styles.seats} role="group" aria-label={t("seats")}>
      {joined.map((member, index) => {
        const isHost = member.id === hostId;
        const online = presentIds.has(member.id);
        const clickable = canTransfer && !isHost && online;
        const name = member.nickname || member.username;
        return (
          <motion.button
            type="button"
            key={member.id}
            className={`${styles.seat} ${online ? styles.seatOnline : ""} ${isHost ? styles.seatHost : ""}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.04 }}
            onClick={() => clickable && onSeatClick(member)}
            aria-disabled={!clickable}
            title={
              clickable
                ? t("transferTo", { name })
                : `${name}${member.id === currentUserId ? ` (${t("you")})` : ""} · ${online ? t("online") : t("offline")}`
            }
          >
            <span className={styles.seatBack}>
              {isHost ? (
                <span className={styles.crown} aria-label={t("hostBadge")}>
                  <Crown size={12} fill="currentColor" />
                </span>
              ) : null}
              <PersonAvatar user={member} size={34} />
              <span className={styles.onlineDot} aria-hidden />
            </span>
            <span className={styles.seatArms} aria-hidden />
            <span className={styles.seatName}>{name}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
