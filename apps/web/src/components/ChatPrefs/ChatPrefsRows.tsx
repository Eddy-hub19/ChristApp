"use client";

import { useTranslations } from "next-intl";
import { ChatBackgroundLayer, useChatBackgroundPrefs } from "@/components/ChatBackground/ChatBackground";
import { RowChevron } from "./PrefsScreen";
import { normalizeFontPrefs } from "@/lib/chatFonts";
import { useAuth } from "@/hooks/useAuth";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";
import styles from "./ChatPrefs.module.scss";

/** Строка «Фон чату» в «Налаштування»: справа текущий фон по умолчанию с миниатюрой. */
export function ChatBackgroundRow({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("chatBackground");
  const prefs = useChatBackgroundPrefs();
  const def = prefs.def ?? { id: "default" as const, dim: 0 };
  return (
    <button type="button" className={base.row} data-prefs-row="background" onClick={onOpen} aria-haspopup="dialog">
      <span className={base.rowTitle}>{t("title")}</span>
      <span className={base.current}>
        <span className={base.currentName}>{t(`items.${def.id}`)}</span>
        <span className={styles.thumb}>
          <ChatBackgroundLayer id={def.id} dim={def.dim} />
        </span>
      </span>
      <RowChevron />
    </button>
  );
}

/** Строка «Розмір тексту»: справа текущий размер и мини-«Aa». */
export function FontRow({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("fontSettings");
  const { user } = useAuth();
  const p = normalizeFontPrefs(user?.fontPrefs);
  const summary = t(`sizes.${p.size}`);
  return (
    <button type="button" className={base.row} onClick={onOpen} aria-haspopup="dialog">
      <span className={base.rowIcon} aria-hidden>
        <span style={{ fontWeight: 600, fontSize: 19, letterSpacing: "-0.02em" }}>Aa</span>
      </span>
      <span className={base.rowTitle}>{t("title")}</span>
      <span className={base.current}>
        <span className={base.currentName}>{summary}</span>
        <span aria-hidden style={{ fontWeight: 700, fontSize: 16, color: "var(--foreground)" }}>
          Aa
        </span>
      </span>
      <RowChevron />
    </button>
  );
}
