"use client";

import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { NEW_SITE_HOST, NEW_SITE_ORIGIN, pad2 } from "@/lib/siteMigration";
import { useMigrationCountdown } from "@/lib/useMigrationCountdown";
import styles from "./MigrationComposerBanner.module.scss";

/** Плашка над полем ввода сообщения: переехали на новый сайт + сколько осталось до отключения этого. */
export default function MigrationComposerBanner() {
  const t = useTranslations("migration");
  const locale = useLocale();
  const left = useMigrationCountdown();

  if (!left) return null;

  return (
    <div className={styles.banner} role="note">
      <Clock size={16} strokeWidth={2.2} className={styles.icon} aria-hidden />
      <p className={styles.text}>
        {t("composerText")}{" "}
        <a href={`${NEW_SITE_ORIGIN}/${locale}`} className={styles.link}>
          {NEW_SITE_HOST}
        </a>
      </p>
      <span className={styles.time} aria-label={t("badgeAria")}>
        {pad2(left.h)}:{pad2(left.m)}:{pad2(left.s)}
      </span>
    </div>
  );
}
