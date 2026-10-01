"use client";

import { useTranslations } from "next-intl";
import styles from "@/components/Movies/Movies.module.scss";

export default function MovieError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("movies");
  return (
    <div className={styles.page} role="alert">
      <p className={styles.errorText}>{t("loadError")}</p>
      <button type="button" className={styles.serverTab} onClick={reset}>
        {t("retry")}
      </button>
    </div>
  );
}
