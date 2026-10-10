"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { waitingSession } from "./flockSession";
import styles from "./FlockResumeBanner.module.scss";

/**
 * «Овечка чекає на тебе · 14 с — Повернутися»: показуємо, поки сервер тримає овечку в паузі
 * (токен свіжий, а гра зараз не відкрита). Зникає по закінченню часу або коли гравець повернувся.
 */
export default function FlockResumeBanner() {
  const t = useTranslations("flock.resume");
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const w = waitingSession();
      setLeft(w ? Math.ceil(w.remainingMs / 1000) : null);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  if (left === null) return null;
  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        <span aria-hidden>🐑</span> {t("text", { seconds: left })}
      </span>
      <Link href="/games/flock" className={styles.btn} prefetch={false}>
        {t("button")}
      </Link>
    </div>
  );
}
