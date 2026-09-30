"use client";

import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import styles from "./ChatShared.module.scss";

type ReplyQuoteProps = {
  /** Автор оригіналу; для видаленого оригіналу не потрібен. */
  username?: string;
  /** Уже готовий короткий підпис (див. replyPreviewText). */
  text?: string;
  deleted?: boolean;
  onClick?: () => void;
};

/** Цитата оригіналу над текстом відповіді; тап гортає чат до оригіналу. */
export default function ReplyQuote({ username, text, deleted, onClick }: ReplyQuoteProps) {
  const t = useTranslations("chatShared");
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick?.();
  };

  return (
    <button
      type="button"
      className={`${styles.quote} ${deleted ? styles.quoteDeleted : ""}`}
      data-bubble-control
      onClick={handleClick}
      disabled={deleted || !onClick}
    >
      {deleted ? null : <span className={styles.quoteAuthor}>{username}</span>}
      <span className={styles.quoteText}>{deleted ? t("messageDeleted") : text}</span>
    </button>
  );
}
