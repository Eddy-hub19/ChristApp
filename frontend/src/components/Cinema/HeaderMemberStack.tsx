"use client";

import PersonAvatar from "./PersonAvatar";
import type { HallMember } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

type HeaderMemberStackProps = {
  members: HallMember[];
  presentIds: Set<string>;
  onClick: () => void;
  label: string;
};

const MAX_AVATARS = 2;

/**
 * Компактна стопка аватарок у шапці на мобільному — заміняє кнопку запрошення
 * (для якої там немає місця) і відкриває шторку «Учасники» по тапу.
 */
export default function HeaderMemberStack({ members, presentIds, onClick, label }: HeaderMemberStackProps) {
  const joined = members
    .filter((m) => m.status === "JOINED")
    .sort((a, b) => Number(presentIds.has(b.id)) - Number(presentIds.has(a.id)));
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
