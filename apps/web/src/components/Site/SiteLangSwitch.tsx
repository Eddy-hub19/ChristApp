"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import styles from "./SiteHeader.module.scss";

const LABELS = { en: "EN", ru: "RU", ua: "UA" } as const;

/** Перемикач мови публічних сторінок: звичайні посилання (працюють і в HTML без JS). */
export default function SiteLangSwitch({ label }: { label: string }) {
  const current = useLocale();
  const pathname = usePathname();

  return (
    <div className={styles.langs} role="group" aria-label={label}>
      {routing.langs.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          hrefLang={l === "ua" ? "uk" : l}
          aria-current={l === current ? "true" : undefined}
          className={l === current ? styles.langActive : styles.lang}
        >
          {LABELS[l]}
        </Link>
      ))}
    </div>
  );
}
