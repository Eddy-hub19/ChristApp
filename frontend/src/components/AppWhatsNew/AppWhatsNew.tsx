"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import { APP_WHATS_NEW, APP_WHATS_NEW_TEXT, latestAppVersion, type AppWhatsNewLang } from "./appWhatsNewData";
import styles from "./AppWhatsNew.module.scss";

const SEEN_KEY = "christapp:appWhatsNew:seen";

function loadSeen(): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** Общая плашка «Що нового» приложения: один раз на версию, только для вошедших пользователей. */
export default function AppWhatsNew() {
  const locale = useLocale();
  const lang: AppWhatsNewLang = locale === "ru" || locale === "en" ? locale : "ua";
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setOpen(Boolean(getAuthToken()) && loadSeen() < latestAppVersion());
    check();
    window.addEventListener(AUTH_CHANGED_EVENT, check);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, check);
  }, []);

  // не перекрываем экран выбора ника: плашка появится на первой странице приложения
  if (!open || pathname === "/choose-nickname") return null;

  const seen = loadSeen();
  const entries = APP_WHATS_NEW.filter((e) => e.version > seen).sort((a, b) => b.version - a.version);
  const text = APP_WHATS_NEW_TEXT[lang];

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, String(latestAppVersion()));
    } catch {
      /* приватный режим */
    }
    setOpen(false);
  };

  return (
    <div className={styles.wrap} data-testid="app-whats-new">
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={text.title}>
        <h2 className={styles.title}>{text.title}</h2>
        <ul className={styles.list}>
          {entries.flatMap((e) => e.items.map((item, i) => <li key={`${e.version}-${i}`}>{item[lang]}</li>))}
        </ul>
        <button type="button" className={styles.ok} onClick={close} autoFocus>
          {text.ok}
        </button>
      </div>
    </div>
  );
}
