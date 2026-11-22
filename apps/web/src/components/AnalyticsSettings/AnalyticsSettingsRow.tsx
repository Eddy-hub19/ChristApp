"use client";

import { useSyncExternalStore } from "react";
import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";
import { GTM_ID } from "@/lib/analytics";
import {
  readAnalyticsConsent,
  subscribeAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analyticsConsent";
import styles from "./AnalyticsSettingsRow.module.scss";

/** Строка «Аналітика» в «Налаштування»: переключатель согласия на анонимную аналитику (по умолчанию выключен). */
export default function AnalyticsSettingsRow() {
  const t = useTranslations("analytics");
  const consent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    () => null,
  );

  // Без NEXT_PUBLIC_GTM_ID аналитики нет вообще — и выбирать нечего.
  if (!GTM_ID) return null;

  const on = consent === "granted";

  return (
    <div className={base.row} style={{ cursor: "default" }}>
      <span className={base.rowIcon} aria-hidden>
        <BarChart3 size={22} strokeWidth={1.8} />
      </span>
      <span className={base.rowTitle}>{t("settingsTitle")}</span>
      <span className={base.current}>
        <span className={base.currentName}>
          {on ? t("settingsOn") : t("settingsOff")}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t("settingsAria")}
        className={`${styles.switch} ${on ? styles.on : ""}`}
        onClick={() => writeAnalyticsConsent(on ? "denied" : "granted")}
      >
        <span className={styles.thumb} aria-hidden />
      </button>
    </div>
  );
}
