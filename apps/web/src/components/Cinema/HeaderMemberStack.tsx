"use client";

import PersonAvatar from "./PersonAvatar";
import { orderHallMembers } from "./hallMemberOrder";
import type { HallMember } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

type HeaderMemberStackProps = {
  members: HallMember[];
  presentIds: Set<string>;
  /** userId → lastSeenAt: порядок «хто в залі → хто нещодавно заходив → давно». */
  lastSeenById: Map<string, string>;
  onClick: () => void;
  label: string;
};

const MAX_AVATARS = 2;

/**
 * Компактна стопка аватарок у шапці на мобільному — заміняє кнопку запрошення
 * (для якої там немає місця) і відкриває шторку «Учасники» по тапу.
 */
export default function HeaderMemberStack({ members, presentIds, lastSeenById, onClick, label }: HeaderMemberStackProps) {
  const joined = orderHallMembers(members, presentIds, lastSeenById);
  const shown = joined.slice(0, MAX_AVATARS);
  const extra = joined.length - shown.length;

  return (
    <button type="button" className={styles.memberStack} onClick={onClick} aria-label={label}>
      {shown.map((m) => (
        <span key={m.id} className={styles.memberStackAvatar}>
          <PersonAvatar user={m} size={28} />
        </span>
      ))}
      {extra > 0 ? <span className={styles.memberStackMore}>+{extra}</span> : null}
    </button>
  );
}
