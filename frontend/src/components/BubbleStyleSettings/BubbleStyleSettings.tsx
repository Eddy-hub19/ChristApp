"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import { getHttpApiBase } from "@/lib/apiBase";
import { getApiErrorMessage } from "@/lib/apiError";
import { useAuth } from "@/hooks/useAuth";
import {
  BUBBLE_STYLES_WITH_CHARACTER,
  BUBBLE_STYLE_IDS,
  normalizeBubbleStyle,
  setShowOthersBubbleStyles,
  setUserBubbleStyle,
  useShowOthersBubbleStyles,
  type BubbleStyleId,
} from "@/lib/bubbleStyles";
import { RECOMMENDED_BACKGROUND } from "@/lib/chatBackgrounds";
import styles from "./BubbleStyleSettings.module.scss";

/** Пример пузыря в выбранном стиле: те же data-атрибуты, что у настоящих пузырей (styles/bubbleStyles.scss). */
export function SampleBubble({
  style,
  own = false,
  text,
  mini = false,
  textStyle,
}: {
  style: BubbleStyleId;
  own?: boolean;
  text: string;
  mini?: boolean;
  /** Шрифт/размер текста примера (экран «Шрифт»). */
  textStyle?: CSSProperties;
}) {
  const styled = style !== "default";
  const character = !mini && styled && BUBBLE_STYLES_WITH_CHARACTER.has(style);
  return (
    <div
      className={`${styles.sample} ${own ? styles.sampleOwn : ""} ${mini ? styles.sampleMini : ""}`}
      data-bubble-style={styled ? style : undefined}
      data-bubble-own={styled && own ? "" : undefined}
      data-bubble-start={character ? "" : undefined}
      style={textStyle}
    >
      {character ? <span data-bs-char aria-hidden /> : null}
      <span className={styles.sampleText}>{text}</span>
    </div>
  );
}

/** Строка раздела «Налаштування» в профиле: всегда видна (flex-shrink: 0 - родитель профиля не должен её схлопывать). */
export function BubbleStyleRow({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("bubbleStyles");
  const { user } = useAuth();
  const saved = normalizeBubbleStyle(user?.bubbleStyle);
  return (
    <button type="button" className={styles.row} onClick={onOpen} aria-haspopup="dialog">
      <span className={styles.rowTitle}>{t("title")}</span>
      <span className={styles.current}>
        <span className={styles.currentName}>{t(`styles.${saved}`)}</span>
        <SampleBubble style={saved} own mini text="Aa" />
      </span>
      <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

/** Экран настроек «Вигляд повідомлень»: сетка стилей, живой пример, «Зберегти» / «Скасувати», чужие стили вкл/выкл. «Назад» и Esc закрывают. */
export default function BubbleStyleSettings({ onClose }: { onClose: () => void }) {
  const t = useTranslations("bubbleStyles");
  const tBg = useTranslations("chatBackground");
  const { user, patchUser } = useAuth();
  const showOthers = useShowOthersBubbleStyles();
  const saved = normalizeBubbleStyle(user?.bubbleStyle);
  const [draft, setDraft] = useState<BubbleStyleId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = draft ?? saved;
  const dirty = draft !== null && draft !== saved;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!user || draft === null || !dirty) return;
    const token = getAuthToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${getHttpApiBase()}/users/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bubbleStyle: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(data, t("saveFailed")));
      }
      patchUser({ bubbleStyle: draft });
      setUserBubbleStyle(user.id, draft);
      setDraft(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={t("title")}>
      <header className={styles.screenHead}>
        <button type="button" className={styles.back} onClick={onClose} aria-label={t("back")} autoFocus>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <h2 className={styles.screenTitle}>{t("title")}</h2>
      </header>
      <div className={styles.screenBody}>
        <div className={styles.body}>
        <p className={styles.hint}>{t("hint")}</p>

        <div
          className={styles.grid}
          role="radiogroup"
          aria-label={t("title")}
        >
          {BUBBLE_STYLE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={current === id}
              className={`${styles.card} ${current === id ? styles.cardActive : ""}`}
              onClick={() => setDraft(id)}
            >
              <span className={styles.cardPreview}>
                <SampleBubble style={id} text="Aa" />
              </span>
              <span className={styles.cardName}>{t(`styles.${id}`)}</span>
            </button>
          ))}
        </div>

        <div className={styles.example} aria-label={t("exampleTitle")}>
          <p className={styles.exampleTitle}>{t("exampleTitle")}</p>
          <SampleBubble style={current} text={t("exampleOther")} />
          <SampleBubble style={current} own text={t("exampleOwn")} />
          {RECOMMENDED_BACKGROUND[current] ? (
            <p className={styles.hint}>{tBg("recommendedBg", { name: tBg(`items.${RECOMMENDED_BACKGROUND[current]}`) })}</p>
          ) : null}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={!dirty || busy}
            onClick={() => setDraft(null)}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            {busy ? t("saving") : t("save")}
          </button>
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showOthers}
            onChange={(e) => setShowOthersBubbleStyles(e.target.checked)}
          />
          <span>
            <strong>{t("showOthers")}</strong>
            <small>{t("showOthersHint")}</small>
          </span>
        </label>
        </div>
      </div>
    </div>,
    document.body,
  );
}
