"use client";

import { useState } from "react";
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
import styles from "./BubbleStyleSettings.module.scss";

/** Пример пузыря в выбранном стиле: те же data-атрибуты, что у настоящих пузырей (styles/bubbleStyles.scss). */
function SampleBubble({ style, own = false, text }: { style: BubbleStyleId; own?: boolean; text: string }) {
  const styled = style !== "default";
  const character = styled && BUBBLE_STYLES_WITH_CHARACTER.has(style);
  return (
    <div
      className={`${styles.sample} ${own ? styles.sampleOwn : ""}`}
      data-bubble-style={styled ? style : undefined}
      data-bubble-own={styled && own ? "" : undefined}
      data-bubble-start={character ? "" : undefined}
    >
      {character ? <span data-bs-char aria-hidden /> : null}
      <span className={styles.sampleText}>{text}</span>
    </div>
  );
}

/** Раздел профиля «Вигляд повідомлень»: сетка стилей, живой пример, «Зберегти» / «Скасувати», чужие стили вкл/выкл. */
export default function BubbleStyleSettings() {
  const t = useTranslations("bubbleStyles");
  const { user, patchUser } = useAuth();
  const showOthers = useShowOthersBubbleStyles();
  const saved = normalizeBubbleStyle(user?.bubbleStyle);
  const [draft, setDraft] = useState<BubbleStyleId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const current = draft ?? saved;
  const dirty = draft !== null && draft !== saved;

  const save = async () => {
    if (!user || draft === null || !dirty) return;
    const token = getAuthToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${getHttpApiBase()}/users/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bubbleStyle: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(data, t("saveFailed")));
      }
      patchUser({ bubbleStyle: draft });
      setUserBubbleStyle(user.id, draft);
      setDraft(null);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="bubble-styles-title">
      <h2 id="bubble-styles-title" className={styles.title}>
        {t("title")}
      </h2>
      <p className={styles.hint}>{t("hint")}</p>

      <div className={styles.grid} role="radiogroup" aria-label={t("title")}>
        {BUBBLE_STYLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            className={`${styles.card} ${current === id ? styles.cardActive : ""}`}
            onClick={() => {
              setDraft(id);
              setJustSaved(false);
            }}
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
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} disabled={!dirty || busy} onClick={() => setDraft(null)}>
          {t("cancel")}
        </button>
        <button type="button" className={styles.primary} disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? t("saving") : t("save")}
        </button>
      </div>
      {justSaved ? (
        <p className={styles.ok} role="status">
          {t("saved")}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <label className={styles.toggle}>
        <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthersBubbleStyles(e.target.checked)} />
        <span>
          <strong>{t("showOthers")}</strong>
          <small>{t("showOthersHint")}</small>
        </span>
      </label>
    </section>
  );
}
