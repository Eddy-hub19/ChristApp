"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Image as ImageIcon } from "lucide-react";
import {
  DESIGN_BACKGROUNDS,
  getDesignBackground,
  setDesignBackground,
  type DesignBackgroundId,
} from "@/lib/designBackground";
import PrefsScreen, { RowChevron } from "./PrefsScreen";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";
import styles from "./DesignBackgroundSettings.module.scss";

/** Текущий выбор (читаем с <html> после монтирования: на сервере его нет). */
function useDesignBackground() {
  const [id, setId] = useState<DesignBackgroundId>("plum");
  useEffect(() => setId(getDesignBackground()), []);
  const choose = (next: DesignBackgroundId) => {
    setDesignBackground(next);
    setId(next);
  };
  return [id, choose] as const;
}

/** Строка «Фон приложения» в «Налаштування». Видна только в новом дизайне (стили: styles/designV2.scss). */
export function DesignBackgroundRow({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("designBackground");
  const [id] = useDesignBackground();
  return (
    <button type="button" className={base.row} data-v2-only onClick={onOpen} aria-haspopup="dialog">
      <span className={base.rowIcon} aria-hidden>
        <ImageIcon size={22} strokeWidth={1.8} />
      </span>
      <span className={base.rowTitle}>{t("title")}</span>
      <span className={base.current}>
        <span className={base.currentName}>{t(`items.${id}`)}</span>
        <span className={styles.thumb} data-design-thumb={id} aria-hidden />
      </span>
      <RowChevron />
    </button>
  );
}

/** Экран выбора фона приложения: две карточки с превью. */
export default function DesignBackgroundSettings({ onClose }: { onClose: () => void }) {
  const t = useTranslations("designBackground");
  const tBg = useTranslations("chatBackground");
  const [current, choose] = useDesignBackground();
  return (
    <PrefsScreen title={t("title")} backLabel={tBg("back")} onClose={onClose}>
      <p className={styles.hint}>{t("hint")}</p>
      <div className={styles.grid} role="radiogroup" aria-label={t("title")}>
        {DESIGN_BACKGROUNDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            className={`${styles.card} ${current === id ? styles.cardActive : ""}`}
            onClick={() => choose(id)}
          >
            <span className={styles.preview} data-design-thumb={id} aria-hidden />
            <span className={styles.name}>{t(`items.${id}`)}</span>
          </button>
        ))}
      </div>
    </PrefsScreen>
  );
}
