"use client";

import { useTranslations } from "next-intl";
import { MessagesSquare } from "lucide-react";
import { setChatLayoutPref, useChatLayoutPref, type ChatLayoutPref } from "@/lib/chatLayoutPref";
import PrefsScreen, { RowChevron } from "./PrefsScreen";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";
import styles from "./ChatLayoutSettings.module.scss";

const OPTIONS: ChatLayoutPref[] = ["split", "single"];

/** Строка «Окно чата на ПК» в «Налаштування». Видна только на ПК в новом дизайне (стили: styles/designV2.scss). */
export function ChatLayoutRow({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("chatLayout");
  const pref = useChatLayoutPref();
  return (
    <button type="button" className={base.row} data-v2-only data-desktop-only onClick={onOpen} aria-haspopup="dialog">
      <span className={base.rowIcon} aria-hidden>
        <MessagesSquare size={22} strokeWidth={1.8} />
      </span>
      <span className={base.rowTitle}>{t("title")}</span>
      <span className={base.current}>
        <span className={base.currentName}>{t(`short.${pref}`)}</span>
      </span>
      <RowChevron />
    </button>
  );
}

/** Экран выбора: две карточки со схемой раскладки. */
export default function ChatLayoutSettings({ onClose }: { onClose: () => void }) {
  const t = useTranslations("chatLayout");
  const tBg = useTranslations("chatBackground");
  const pref = useChatLayoutPref();
  return (
    <PrefsScreen title={t("title")} backLabel={tBg("back")} onClose={onClose}>
      <p className={styles.hint}>{t("hint")}</p>
      <div className={styles.grid} role="radiogroup" aria-label={t("title")}>
        {OPTIONS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={pref === id}
            className={`${styles.card} ${pref === id ? styles.cardActive : ""}`}
            onClick={() => setChatLayoutPref(id)}
          >
            <span className={styles.scheme} data-layout={id} aria-hidden>
              <i />
              <i />
            </span>
            <span className={styles.name}>{t(`items.${id}`)}</span>
            <span className={styles.desc}>{t(`descriptions.${id}`)}</span>
          </button>
        ))}
      </div>
    </PrefsScreen>
  );
}
