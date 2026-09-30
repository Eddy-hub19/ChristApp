"use client";

import { useTranslations } from "next-intl";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { getInitials } from "@/lib/utils";
import styles from "./ChatShared.module.scss";

export type ReactionUser = { avatarSrc?: string; label: string };

export type ReactionInput = { userId: string; type: string };

type ReactionPillsProps = {
  reactions: readonly ReactionInput[];
  currentUserId?: string;
  resolveUser: (userId: string) => ReactionUser;
  onToggle: (emoji: string) => void;
  align?: "start" | "end";
};

const MAX_AVATARS = 3;

type Group = { emoji: string; userIds: string[] };

function groupReactions(reactions: readonly ReactionInput[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of reactions) {
    const group = map.get(r.type);
    if (group) group.userIds.push(r.userId);
    else map.set(r.type, { emoji: r.type, userIds: [r.userId] });
  }
  return [...map.values()];
}

/** Реакції під повідомленням: емодзі, лічильник і маленькі аватарки; тап по своїй знімає її. */
export default function ReactionPills({
  reactions,
  currentUserId,
  resolveUser,
  onToggle,
  align = "start",
}: ReactionPillsProps) {
  const t = useTranslations("chatShared");
  const groups = groupReactions(reactions);
  if (groups.length === 0) return null;

  return (
    <div className={`${styles.pills} ${align === "end" ? styles.pillsEnd : ""}`} data-bubble-control>
      {groups.map((group) => {
        const mine = Boolean(currentUserId && group.userIds.includes(currentUserId));
        const names = group.userIds.map((id) => resolveUser(id).label).join(", ");
        return (
          <button
            key={group.emoji}
            type="button"
            className={`${styles.pill} ${mine ? styles.pillActive : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(group.emoji);
            }}
            title={names}
            aria-pressed={mine}
            aria-label={t("reactionAria", { emoji: group.emoji, count: group.userIds.length })}
          >
            <span className={styles.pillEmoji}>{group.emoji}</span>
            <span className={styles.pillAvatars}>
              {group.userIds.slice(-MAX_AVATARS).map((userId) => {
                const user = resolveUser(userId);
                return (
                  <AvatarWithFallback
                    key={userId}
                    src={user.avatarSrc}
                    initials={getInitials(user.label || "U")}
                    colorSeed={userId}
                    width={14}
                    height={14}
                    imageClassName={styles.pillAvatarImg}
                    fallbackClassName={styles.pillAvatarFallback}
                    fallbackTag="span"
                    fallbackTint="onError"
                  />
                );
              })}
            </span>
            <span className={styles.pillCount}>{group.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}
