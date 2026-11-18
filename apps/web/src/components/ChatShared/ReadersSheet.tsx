"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import Sheet from "@/components/Cinema/Sheet";
import {
  formatReadAt,
  sortReadersByTime,
  type MessageReader,
  type ReaderReaction,
} from "@/lib/chatReaders";
import { getInitials } from "@/lib/utils";
import styles from "./ChatShared.module.scss";

type ReadersSheetProps = {
  open: boolean;
  onClose: () => void;
  readers: readonly MessageReader[];
  reactions: readonly ReaderReaction[];
  /** Тап по людині: профіль або особистий чат (вирішує екран, де відкрито шторку). */
  onSelectUser?: (userId: string) => void;
  tone?: "app" | "hall";
};

type PersonRowProps = {
  userId: string;
  name: string;
  avatarSrc?: string;
  trailing: string;
  onSelect?: (userId: string) => void;
};

function PersonRow({ userId, name, avatarSrc, trailing, onSelect }: PersonRowProps) {
  const body = (
    <>
      <AvatarWithFallback
        src={avatarSrc}
        initials={getInitials(name || "U")}
        colorSeed={userId}
        width={36}
        height={36}
        imageClassName={styles.readersAvatarImg}
        fallbackClassName={styles.readersAvatarFallback}
        fallbackTag="span"
      />
      <span className={styles.readersName}>{name}</span>
      <span className={styles.readersTrailing}>{trailing}</span>
    </>
  );
  return (
    <li>
      {onSelect ? (
        <button type="button" className={styles.readersRow} onClick={() => onSelect(userId)}>
          {body}
        </button>
      ) : (
        <div className={styles.readersRow}>{body}</div>
      )}
    </li>
  );
}

/**
 * Шторка «Переглянули»: хто прочитав повідомлення (з часом) і, якщо є, хто яку реакцію поставив.
 * Телефон — нижній лист, десктоп — діалог по центру (як усі Sheet).
 */
export default function ReadersSheet({
  open,
  onClose,
  readers,
  reactions,
  onSelectUser,
  tone = "app",
}: ReadersSheetProps) {
  const t = useTranslations("chatShared");
  const lang = useLocale();
  const sorted = useMemo(() => sortReadersByTime(readers), [readers]);
  const now = new Date();
  const labels = {
    today: (time: string) => t("readersToday", { time }),
    yesterday: (time: string) => t("readersYesterday", { time }),
    other: (date: string, time: string) => t("readersOther", { date, time }),
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("readersTitle")} tone={tone}>
      {sorted.length === 0 ? (
        <p className={styles.readersEmpty}>{t("readersEmpty")}</p>
      ) : (
        <ul className={styles.readersList}>
          {sorted.map((reader) => (
            <PersonRow
              key={reader.id}
              userId={reader.id}
              name={reader.name}
              avatarSrc={reader.avatarSrc}
              trailing={formatReadAt(new Date(reader.readAt), now, lang, labels)}
              onSelect={onSelectUser}
            />
          ))}
        </ul>
      )}
      {reactions.length > 0 ? (
        <>
          <h3 className={styles.readersSection}>{t("readersReactions")}</h3>
          <ul className={styles.readersList}>
            {reactions.map((reaction) => (
              <PersonRow
                key={`${reaction.userId}:${reaction.emoji}`}
                userId={reaction.userId}
                name={reaction.name}
                avatarSrc={reaction.avatarSrc}
                trailing={reaction.emoji}
                onSelect={onSelectUser}
              />
            ))}
          </ul>
        </>
      ) : null}
    </Sheet>
  );
}
