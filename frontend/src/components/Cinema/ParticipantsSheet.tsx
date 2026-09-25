"use client";

import { useTranslations } from "next-intl";
import { Crown } from "lucide-react";
import PersonAvatar from "./PersonAvatar";
import Sheet from "./Sheet";
import { watchUserName } from "@/lib/queries/watchRoomsQueries";
import type { HallMember } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

type ParticipantsSheetProps = {
  open: boolean;
  onClose: () => void;
  members: HallMember[];
  hostId: string;
  presentIds: Set<string>;
  currentUserId: string | undefined;
  isHost: boolean;
  onTransfer: (member: HallMember) => void;
  onInvite: () => void;
};

/**
 * Шторка «Учасники» — заміняє ряд крісел на мобільному: хто в залі, хто хост,
 * і (лише для хоста) кнопка передачі керування біля кожного учасника.
 */
export default function ParticipantsSheet({
  open,
  onClose,
  members,
  hostId,
  presentIds,
  currentUserId,
  isHost,
  onTransfer,
  onInvite,
}: ParticipantsSheetProps) {
  const t = useTranslations("cinema.hall");
  const joined = members
    .filter((m) => m.status === "JOINED")
    .sort((a, b) => Number(presentIds.has(b.id)) - Number(presentIds.has(a.id)));

  return (
    <Sheet
      open={open}
      title={t("participants")}
      tone="hall"
      onClose={onClose}
      footer={
        <div className={styles.sheetActionsHall}>
          <button type="button" className={styles.hallPrimary} onClick={onInvite}>
            {t("inviteShort")}
          </button>
        </div>
      }
    >
      <ul className={styles.participantsList}>
        {joined.map((member) => {
          const online = presentIds.has(member.id);
          const name = watchUserName(member);
          const isMemberHost = member.id === hostId;
          const canTransfer = isHost && !isMemberHost && online;
          return (
            <li key={member.id} className={styles.participantRow}>
              <span className={styles.participantAvatar}>
                <PersonAvatar user={member} size={36} />
                <span
                  className={`${styles.participantDot} ${online ? styles.participantDotOnline : ""}`}
                  aria-hidden
                />
              </span>
              <span className={styles.participantInfo}>
                <span className={styles.participantName}>
                  {isMemberHost ? <Crown size={12} fill="currentColor" aria-hidden /> : null}
                  {name}
                  {member.id === currentUserId ? ` (${t("you")})` : ""}
                </span>
                <span className={styles.participantStatus}>{online ? t("online") : t("offline")}</span>
              </span>
              {canTransfer ? (
                <button
                  type="button"
                  className={styles.participantTransfer}
                  onClick={() => onTransfer(member)}
                >
                  {t("transfer")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
