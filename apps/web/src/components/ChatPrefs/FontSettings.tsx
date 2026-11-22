"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { SampleBubble } from "@/components/BubbleStyleSettings/BubbleStyleSettings";
import { ChatBackgroundLayer, useResolvedChatBackground } from "@/components/ChatBackground/ChatBackground";
import { normalizeBubbleStyle } from "@/lib/bubbleStyles";
import {
  DEFAULT_FONT_PREFS,
  TEXT_SIZES,
  TEXT_SIZE_SCALE,
  isDefaultFontPrefs,
  normalizeFontPrefs,
  type FontPrefs,
  type TextSize,
} from "@/lib/chatFonts";
import { patchMyProfile } from "@/lib/patchProfile";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";
import styles from "./ChatPrefs.module.scss";
import PrefsScreen from "./PrefsScreen";
import { track } from "@/lib/analytics";

/** «Розмір тексту»: размер текста сообщений; живое превью, «Зберегти» / «Скасувати» / «Назад». Шрифт у всех по умолчанию. */
export default function FontSettings({ onClose }: { onClose: () => void }) {
  const t = useTranslations("fontSettings");
  const tBubble = useTranslations("bubbleStyles");
  const { user, patchUser } = useAuth();
  const saved = normalizeFontPrefs(user?.fontPrefs);
  const [draft, setDraft] = useState<FontPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const bubbleStyle = normalizeBubbleStyle(user?.bubbleStyle);
  const bg = useResolvedChatBackground(null);

  const set = (patch: Partial<FontPrefs>) => setDraft({ ...current, ...patch });
  const sampleStyle: CSSProperties = {
    fontSize: 14 * TEXT_SIZE_SCALE[current.size],
  };

  const save = async () => {
    if (!user || !dirty || !draft) return;
    setBusy(true);
    setError(null);
    try {
      await patchMyProfile({ fontPrefs: isDefaultFontPrefs(draft) ? null : draft }, t("saveFailed"));
      patchUser({ fontPrefs: isDefaultFontPrefs(draft) ? null : draft });
      track("chat_font_change", { id: draft.size });
      setDraft(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrefsScreen title={t("title")} backLabel={t("back")} onClose={onClose}>
      <p className={base.hint}>{t("hint")}</p>

      <div className={base.example} aria-label={t("previewTitle")}>
        <p className={base.exampleTitle}>{t("previewTitle")}</p>
        <span className={`${styles.preview} ${styles.previewBig}`} style={{ minHeight: 150 }}>
          <ChatBackgroundLayer id={bg.id} dim={bg.dim} />
          <SampleBubble style={bubbleStyle} text={tBubble("exampleOther")} textStyle={sampleStyle} />
          <SampleBubble style={bubbleStyle} own text={tBubble("exampleOwn")} textStyle={sampleStyle} />
        </span>
      </div>

      <h3 className={styles.sectionTitle}>{t("size")}</h3>
      <div className={styles.sizeRow} role="radiogroup" aria-label={t("size")}>
        {TEXT_SIZES.map((s: TextSize) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={current.size === s}
            className={`${styles.sizeBtn} ${current.size === s ? styles.sizeBtnActive : ""}`}
            onClick={() => set({ size: s })}
          >
            {t(`sizes.${s}`)}
          </button>
        ))}
      </div>

      <button type="button" className={styles.resetLink} disabled={isDefaultFontPrefs(current)} onClick={() => setDraft({ ...DEFAULT_FONT_PREFS })}>
        {t("reset")}
      </button>

      <div className={base.actions}>
        <button type="button" className={base.secondary} disabled={!dirty || busy} onClick={() => setDraft(null)}>
          {t("cancel")}
        </button>
        <button type="button" className={base.primary} disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? t("saving") : t("save")}
        </button>
      </div>
      {error ? (
        <p className={base.error} role="alert">
          {error}
        </p>
      ) : null}
    </PrefsScreen>
  );
}
