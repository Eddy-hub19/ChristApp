"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { SampleBubble } from "@/components/BubbleStyleSettings/BubbleStyleSettings";
import { ChatBackgroundLayer, useChatBackgroundPrefs } from "@/components/ChatBackground/ChatBackground";
import { normalizeBubbleStyle } from "@/lib/bubbleStyles";
import {
  CHAT_BACKGROUNDS,
  CHAT_BG_DIM_DEFAULT,
  CHAT_BG_DIM_MAX,
  RECOMMENDED_BACKGROUND,
  withDefaultBackground,
  withRoomBackground,
  type ChatBackgroundChoice,
  type ChatBackgroundId,
} from "@/lib/chatBackgrounds";
import { patchMyProfile } from "@/lib/patchProfile";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";
import styles from "./ChatPrefs.module.scss";
import PrefsScreen from "./PrefsScreen";

export type BackgroundScope = { kind: "default" } | { kind: "room"; roomKey: string };

/** Превью чата: фон + пузыри стиля пользователя (в текущей теме приложения). */
export function BackgroundPreview({ id, dim, big = false }: { id: ChatBackgroundId; dim: number; big?: boolean }) {
  const t = useTranslations("bubbleStyles");
  const { user } = useAuth();
  const style = normalizeBubbleStyle(user?.bubbleStyle);
  return (
    <span className={`${styles.preview} ${big ? styles.previewBig : ""}`}>
      <ChatBackgroundLayer id={id} dim={dim} />
      {big ? (
        <>
          <SampleBubble style={style} text={t("exampleOther")} />
          <SampleBubble style={style} own text={t("exampleOwn")} />
        </>
      ) : (
        <>
          <SampleBubble style={style} mini text="Aa" />
          <SampleBubble style={style} own mini text="Aa" />
        </>
      )}
    </span>
  );
}

/** «Фон чату»: сетка карточек с живым превью, ползунок затемнения, «Зберегти» / «Скасувати» / «Назад». */
export default function ChatBackgroundSettings({ scope, onClose }: { scope: BackgroundScope; onClose: () => void }) {
  const t = useTranslations("chatBackground");
  const tBubble = useTranslations("bubbleStyles");
  const { user, patchUser } = useAuth();
  const prefs = useChatBackgroundPrefs();
  const isRoom = scope.kind === "room";
  const roomKey = scope.kind === "room" ? scope.roomKey : null;

  /** null - «Як за замовчуванням» (только в режиме чата). */
  const saved: ChatBackgroundChoice | null = isRoom
    ? (prefs.rooms?.[roomKey ?? ""] ?? null)
    : (prefs.def ?? { id: "default", dim: CHAT_BG_DIM_DEFAULT });
  const [draft, setDraft] = useState<ChatBackgroundChoice | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = draft === undefined ? saved : draft;
  const effective: ChatBackgroundChoice = current ?? prefs.def ?? { id: "default", dim: CHAT_BG_DIM_DEFAULT };
  const dirty = draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved);

  const recommended = RECOMMENDED_BACKGROUND[normalizeBubbleStyle(user?.bubbleStyle)];
  const bubbleName = tBubble(`styles.${normalizeBubbleStyle(user?.bubbleStyle)}`);
  const sliderOn = current !== null && effective.id !== "default";

  const pick = (id: ChatBackgroundId) => setDraft({ id, dim: current?.dim ?? CHAT_BG_DIM_DEFAULT });
  const cards = useMemo(() => CHAT_BACKGROUNDS.map((b) => b.id), []);

  const save = async () => {
    if (!user || draft === undefined || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const next = isRoom && roomKey ? withRoomBackground(prefs, roomKey, draft) : withDefaultBackground(prefs, draft);
      await patchMyProfile({ chatBackgrounds: next }, t("saveFailed"));
      patchUser({ chatBackgrounds: next });
      setDraft(undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrefsScreen title={isRoom ? t("roomTitle") : t("defaultTitle")} backLabel={t("back")} onClose={onClose}>
      <p className={base.hint}>{isRoom ? t("roomHint") : t("hint")}</p>

      {recommended && effective.id !== recommended && current !== null ? (
        <div className={styles.tipRow}>
          <span className={styles.tipText}>{t("recommended", { style: bubbleName, name: t(`items.${recommended}`) })}</span>
          <button type="button" className={styles.tipBtn} onClick={() => pick(recommended)}>
            {t("tryIt")}
          </button>
        </div>
      ) : null}

      <div className={base.grid} role="radiogroup" aria-label={t("defaultTitle")}>
        {isRoom ? (
          <button
            type="button"
            role="radio"
            aria-checked={current === null}
            className={`${base.card} ${current === null ? base.cardActive : ""}`}
            onClick={() => setDraft(null)}
          >
            <BackgroundPreview id={(prefs.def ?? { id: "default" as const }).id} dim={prefs.def?.dim ?? 0} />
            <span className={base.cardName}>{t("asDefault")}</span>
          </button>
        ) : null}
        {cards.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current !== null && effective.id === id}
            className={`${base.card} ${current !== null && effective.id === id ? base.cardActive : ""}`}
            onClick={() => pick(id)}
          >
            <BackgroundPreview id={id} dim={current !== null && effective.id === id ? effective.dim : CHAT_BG_DIM_DEFAULT} />
            <span className={base.cardName}>
              {t(`items.${id}`)}
              {recommended === id ? " ★" : ""}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.sliderBox}>
        <div className={styles.sliderHead}>
          <label htmlFor="chat-bg-dim">{t("dim")}</label>
          <span className={styles.sliderValue}>{sliderOn ? `${effective.dim}%` : "—"}</span>
        </div>
        <input
          id="chat-bg-dim"
          className={styles.range}
          type="range"
          min={0}
          max={CHAT_BG_DIM_MAX}
          step={5}
          value={effective.dim}
          disabled={!sliderOn}
          onChange={(e) => setDraft({ id: effective.id, dim: Number(e.target.value) })}
        />
        <p className={base.hint}>{t("dimHint")}</p>
      </div>

      <div className={base.example} aria-label={t("previewTitle")}>
        <p className={base.exampleTitle}>{t("previewTitle")}</p>
        <BackgroundPreview id={effective.id} dim={effective.dim} big />
      </div>

      <div className={base.actions}>
        <button type="button" className={base.secondary} disabled={!dirty || busy} onClick={() => setDraft(undefined)}>
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
      <p className={base.hint}>{t("privateHint")}</p>
    </PrefsScreen>
  );
}
