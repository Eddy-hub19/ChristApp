"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./StreakBadge.module.scss";

const ANIM_SESSION_KEY = "christapp:streak-flame-shown";

type StreakBadgeProps = {
  /** Текущая серия дней (0 - серии нет). */
  streak: number;
  /** Сегодняшний день уже засчитан (человек заходил сегодня). */
  countedToday: boolean;
  className?: string;
};

/**
 * Значок серии дней в углу карточки профиля: огонь + число. Сегодня засчитано - яркий огонь с лёгким свечением
 * (одна мягкая анимация при первом показе за сессию), иначе или при серии 0 - серый приглушённый.
 * По нажатию - короткая подсказка.
 */
export default function StreakBadge({ streak, countedToday, className }: StreakBadgeProps) {
  const t = useTranslations("profile");
  const gradientId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const active = countedToday && streak > 0;

  // Одна анимация за сессию: при первом показе яркого огня.
  useEffect(() => {
    if (!active) return;
    try {
      if (window.sessionStorage.getItem(ANIM_SESSION_KEY)) return;
      window.sessionStorage.setItem(ANIM_SESSION_KEY, "1");
    } catch {
      // приватный режим: просто покажем один раз для этого монтирования
    }
    setAnimate(true);
  }, [active]);

  // Подсказка закрывается по клику вне, Escape и через несколько секунд.
  useEffect(() => {
    if (!tipOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setTipOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTipOpen(false);
    };
    const timer = window.setTimeout(() => setTipOpen(false), 4500);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [tipOpen]);

  const tip = t("streakTip", { count: streak });

  return (
    <div ref={rootRef} className={`${styles.root} ${className ?? ""}`}>
      <button
        type="button"
        className={`${styles.badge} ${active ? styles.active : styles.idle}`}
        onClick={() => setTipOpen((open) => !open)}
        aria-expanded={tipOpen}
        aria-label={tip}
      >
        <svg
          className={`${styles.flame} ${active && animate ? styles.flameIntro : ""}`}
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={active ? "#ffd54a" : "#b3b3b3"} />
              <stop offset="0.55" stopColor={active ? "#ff8a1f" : "#8f8f8f"} />
              <stop offset="1" stopColor={active ? "#e8431a" : "#707070"} />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${gradientId})`}
            d="M12.6 2.2c.5 3.1-1 4.6-2.4 6.2C8.8 10 7.5 11.7 7.5 14.2c0 1.5.6 2.9 1.6 3.8-.2-1.6.5-2.9 1.5-3.9.9-.9 1.6-1.9 1.7-3.4 2.6 1.7 4.2 4.1 4.2 6.8 0 3.2-2.5 5.5-5.5 5.5S5 20.7 5 17.4c0-2.3 1-4.2 2.3-5.8C9.2 9.3 12 7.2 12.6 2.2z"
          />
          {active ? (
            <path
              fill="#fff3c4"
              fillOpacity="0.85"
              d="M12 21.3c-1.7 0-3-1.2-3-2.9 0-1.2.6-2 1.4-2.8.5 1.1 1.4 1.5 2 1.1 1.2.9 2.6 1.6 2.6 2.7 0 1.1-1.2 1.9-3 1.9z"
            />
          ) : null}
        </svg>
        <span className={styles.count}>{streak}</span>
      </button>
      {tipOpen ? (
        <p className={styles.tip} role="status">
          {tip}
        </p>
      ) : null}
    </div>
  );
}
