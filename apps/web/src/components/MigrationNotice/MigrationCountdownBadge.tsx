"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  NEW_SITE_HOST,
  NEW_SITE_ORIGIN,
  SHUTDOWN_MS,
  pad2,
  splitDuration,
} from "@/lib/siteMigration";
import styles from "./MigrationCountdownBadge.module.scss";

const POPOVER_WIDTH = 288;

/**
 * Компактный обратный отсчёт до отключения старого сайта (рядом с названием в шапке).
 * По нажатию открывает пояснение со ссылкой на новый сайт. На новом домене и после дедлайна не показывается.
 */
export default function MigrationCountdownBadge() {
  const t = useTranslations("migration");
  const locale = useLocale();
  const [active, setActive] = useState(false);
  const [left, setLeft] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (window.location.hostname === NEW_SITE_HOST) return;
    setLeft(SHUTDOWN_MS - Date.now());
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setLeft(SHUTDOWN_MS - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!active || left <= 0) return null;

  const { h, m, s } = splitDuration(left);

  const toggle = () => {
    if (!open && btnRef.current) {
      // fixed-позиция по кнопке: поповер не обрезается контейнерами списка чатов
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 24);
      setPos({
        top: r.bottom + 8,
        left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
      });
    }
    setOpen((v) => !v);
  };

  return (
    <span className={styles.root} ref={rootRef}>
      <button
        type="button"
        ref={btnRef}
        className={styles.badge}
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${t("badgeAria")}: ${h}:${pad2(m)}:${pad2(s)}`}
      >
        <Clock size={14} strokeWidth={2.2} aria-hidden />
        <span className={styles.time}>
          {pad2(h)}:{pad2(m)}:{pad2(s)}
        </span>
      </button>

      {open ? (
        <div
          className={styles.popover}
          role="dialog"
          aria-label={t("popTitle")}
          style={{ top: pos.top, left: pos.left, width: `min(${POPOVER_WIDTH}px, calc(100vw - 24px))` }}
        >
          <p className={styles.popTitle}>{t("popTitle")}</p>
          <p className={styles.popText}>{t("popText")}</p>
          <a className={styles.popLink} href={`${NEW_SITE_ORIGIN}/${locale}`}>
            {NEW_SITE_HOST}
          </a>
        </div>
      ) : null}
    </span>
  );
}
