"use client";

import { memo, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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

/** Сколько разных реакций показываем сразу; остальные сворачиваются в «+N». */
const MAX_VISIBLE_GROUPS = 4;

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

/**
 * Реакции под сообщением, компактно: эмодзи и число; свои подсвечены, тап по своей снимает её.
 * Больше MAX_VISIBLE_GROUPS разных реакций - остальные в «+N» (тап раскрывает). Аватарок нет: ширина сообщения не растёт.
 */
function ReactionPills({ reactions, currentUserId, resolveUser, onToggle, align = "start" }: ReactionPillsProps) {
  const t = useTranslations("chatShared");
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => groupReactions(reactions), [reactions]);
  if (groups.length === 0) return null;

  const folded = !expanded && groups.length > MAX_VISIBLE_GROUPS;
  const shown = folded ? groups.slice(0, MAX_VISIBLE_GROUPS) : groups;
  const hiddenCount = groups.length - MAX_VISIBLE_GROUPS;

  return (
    <div className={`${styles.pills} ${align === "end" ? styles.pillsEnd : ""}`} data-bubble-control>
      {shown.map((group) => {
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
            <span className={styles.pillCount}>{group.userIds.length}</span>
          </button>
        );
      })}
      {folded ? (
        <button
          type="button"
          className={`${styles.pill} ${styles.pillMore}`}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(true);
          }}
          aria-label={t("reactionShowMore", { count: hiddenCount })}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

export default memo(ReactionPills);
