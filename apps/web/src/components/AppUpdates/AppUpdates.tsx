"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { useLocale } from "next-intl";
import { APP_WHATS_NEW, APP_WHATS_NEW_TEXT, latestAppVersion, type AppWhatsNewLang } from "@/components/AppWhatsNew/appWhatsNewData";
import { UPDATES_OPENED_EVENT, getOpenedUpdatesVersion, markUpdatesOpened } from "./appUpdatesState";
import styles from "./AppUpdates.module.scss";

/**
 * Значок «Обновления» в шапке списка чатов (рядом с админкой): список всего, что сделано, одной строкой на пункт, новое сверху.
 * Точка на значке - пока есть записи, которые пользователь ещё не открывал. Новая запись = дописать её в APP_WHATS_NEW.
 */
export default function AppUpdates({ buttonClassName }: { buttonClassName: string }) {
  const locale = useLocale();
  const lang: AppWhatsNewLang = locale === "ru" || locale === "en" ? locale : "ua";
  const text = APP_WHATS_NEW_TEXT[lang];
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    const sync = () => setUnread(getOpenedUpdatesVersion() < latestAppVersion());
    sync();
    window.addEventListener(UPDATES_OPENED_EVENT, sync);
    return () => window.removeEventListener(UPDATES_OPENED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const entries = useMemo(() => [...APP_WHATS_NEW].sort((a, b) => b.version - a.version), []);
  const formatDate = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === "ua" ? "uk" : lang, { day: "numeric", month: "long", year: "numeric" });
    return (iso: string) => fmt.format(new Date(`${iso}T12:00:00`));
  }, [lang]);

  const openSheet = () => {
    setOpen(true);
    markUpdatesOpened();
  };

  return (
    <>
      <button type="button" className={buttonClassName} onClick={openSheet} aria-label={text.open} title={text.open} aria-haspopup="dialog">
        <Sparkles size={19} strokeWidth={2.1} aria-hidden />
        {unread ? <span className={styles.dot} aria-hidden /> : null}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.wrap} onClick={() => setOpen(false)}>
              <div className={styles.card} role="dialog" aria-modal="true" aria-label={text.listTitle} onClick={(event) => event.stopPropagation()}>
                <div className={styles.head}>
                  <h2 className={styles.title}>{text.listTitle}</h2>
                  <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={text.close}>
                    <X size={18} strokeWidth={2.2} aria-hidden />
                  </button>
                </div>
                <div className={styles.body}>
                  {entries.map((entry) => (
                    <section key={entry.version} className={styles.group}>
                      <h3 className={styles.date}>{formatDate(entry.date)}</h3>
                      <ul className={styles.list}>
                        {entry.items.map((item, i) => (
                          <li key={i}>{item[lang]}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
