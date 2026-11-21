"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import { useAnnouncementGate } from "@/components/OtaraAnnouncement/announcementGate";
import { APP_WHATS_NEW, APP_WHATS_NEW_TEXT, INTRO_VERSION, MIGRATION_DATE, type AppWhatsNewLang } from "./appWhatsNewData";
import { markUpdatesOpened } from "@/components/AppUpdates/appUpdatesState";
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

/**
 * Стартовое окно «Что изменилось на новом сайте»: один раз показывает всё, что сделано с MIGRATION_DATE (кроме уже виденного),
 * только для вошедших. Новые записи позже INTRO_VERSION окно не открывают: они видны в списке обновлений (значок в шапке чатов).
 */
export default function AppWhatsNew() {
  const locale = useLocale();
  const lang: AppWhatsNewLang = locale === "ru" || locale === "en" ? locale : "ua";
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const gate = useAnnouncementGate();

  useEffect(() => {
    const check = () => setOpen(Boolean(getAuthToken()) && loadSeen() < INTRO_VERSION);
    check();
    window.addEventListener(AUTH_CHANGED_EVENT, check);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, check);
  }, []);

  // не перекрываем экран выбора ника: плашка появится на первой странице приложения
  // объявление «Отари» приоритетнее: пока оно решает/показано, общая плашка ждёт следующего запуска (не больше одного окна за запуск)
  if (!open || pathname === "/choose-nickname" || gate !== "none") return null;

  const seen = loadSeen();
  const entries = APP_WHATS_NEW.filter((e) => e.version > seen && e.version <= INTRO_VERSION && e.date >= MIGRATION_DATE).sort((a, b) => b.version - a.version);
  const text = APP_WHATS_NEW_TEXT[lang];

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, String(INTRO_VERSION));
      markUpdatesOpened();
    } catch {
      /* приватный режим */
    }
    setOpen(false);
  };

  return (
    <div className={styles.wrap} data-testid="app-whats-new">
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={text.introTitle}>
        <h2 className={styles.title}>{text.introTitle}</h2>
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
