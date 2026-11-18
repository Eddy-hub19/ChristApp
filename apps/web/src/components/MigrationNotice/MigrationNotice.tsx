"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  NEW_SITE_HOST,
  NEW_SITE_ORIGIN,
  SHUTDOWN_MS as DEADLINE_MS,
  pad2 as pad,
  splitDuration as split,
} from "@/lib/siteMigration";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import styles from "./MigrationNotice.module.scss";

/**
 * Полноэкранное объявление о переезде на новый сайт с обратным отсчётом до отключения старого.
 * Показывается на любом домене, кроме нового, при каждом открытии приложения и входе; можно закрыть до следующего раза.
 */
export default function MigrationNotice() {
  const t = useTranslations("migration");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(() => DEADLINE_MS - Date.now());
  const goRef = useRef<HTMLAnchorElement | null>(null);

  // Показываем при каждом открытии приложения и при каждом входе в аккаунт (появление токена после его отсутствия).
  // «Пока остаться здесь» закрывает окно только до следующего открытия или входа.
  useEffect(() => {
    if (window.location.hostname === NEW_SITE_HOST) return;
    let hadToken = Boolean(getAuthToken());
    const show = () => {
      setLeft(DEADLINE_MS - Date.now());
      setOpen(true);
    };
    show();
    const onAuthChanged = () => {
      const hasToken = Boolean(getAuthToken());
      if (hasToken && !hadToken) show();
      hadToken = hasToken;
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setLeft(DEADLINE_MS - Date.now()), 1000);
    goRef.current?.focus();
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  const ended = left <= 0;
  const { h, m, s } = split(left);
  const href = `${NEW_SITE_ORIGIN}/${locale}`;

  const dismiss = () => {
    setOpen(false);
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-title"
      data-app-overlay
    >
      <div className={styles.inner}>
        <p className={styles.badge}>{t("badge")}</p>
        <h1 id="migration-title" className={styles.title}>
          {t("title")}
        </h1>
        <p className={styles.text}>{ended ? t("endedText") : t("text")}</p>

        <a className={styles.site} href={href} ref={goRef}>
          {NEW_SITE_HOST}
        </a>

        {!ended ? (
          <div className={styles.timerBlock} role="timer" aria-live="off">
            <p className={styles.timerLabel}>{t("timerLabel")}</p>
            <p className={styles.timer}>
              <span>
                <b>{pad(h)}</b>
                <i>{t("hours")}</i>
              </span>
              <span className={styles.sep}>:</span>
              <span>
                <b>{pad(m)}</b>
                <i>{t("minutes")}</i>
              </span>
              <span className={styles.sep}>:</span>
              <span>
                <b>{pad(s)}</b>
                <i>{t("seconds")}</i>
              </span>
            </p>
          </div>
        ) : null}

        <div className={styles.actions}>
          <a className={styles.primary} href={href}>
            {t("go")}
          </a>
          {!ended ? (
            <button type="button" className={styles.ghost} onClick={dismiss}>
              {t("stay")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
