"use client";

import { useTranslations } from "next-intl";
import styles from "./SheepLoader.module.scss";

interface SheepLoaderProps {
  className?: string;
  /** На весь экран с тёмным фоном (по умолчанию - просто блок по центру родителя). */
  fullscreen?: boolean;
}

/**
 * Заставка загрузки: овечка и название по центру. Название собирается один раз: слова выезжают с краёв, между ними рисуется крест; дальше анимировано только сообщение - три точки «печатаются», пока идёт загрузка.
 * Чистый SVG + CSS-анимация, без JS и зависимостей.
 */
export default function SheepLoader({ className = "", fullscreen = false }: SheepLoaderProps) {
  const t = useTranslations("startup");
  return (
    <div className={`${styles.loader} ${fullscreen ? styles.fullscreen : ""} ${className}`} role="status">
      <svg className={styles.illustration} viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">

        {/* Овечка: объёмная овечка-облако (public/sheep-bubble.webp, 440x394) */}
        <g>
          <image href="/sheep-bubble.webp" x="106" y="44" width="188" height="168" preserveAspectRatio="xMidYMid meet" />
        </g>

        {/* Печатающееся сообщение */}
        <g>
          <rect x="274" y="51" width="80" height="57" rx="19" fill="#f8e8c9" />
          <path d="M290 103L281 117L305 106Z" fill="#f8e8c9" />
          <g fill="#35745a">
            <circle className={styles.dot} cx="295" cy="79" r="4.2" />
            <circle className={styles.dot} cx="314" cy="79" r="4.2" />
            <circle className={styles.dot} cx="333" cy="79" r="4.2" />
          </g>
        </g>
      </svg>

      {/* Слова «Christ» и «App» выезжают с краёв навстречу друг другу, а между ними рисуется крест. */}
      <div className={styles.brand} aria-hidden="true">
        <span className={styles.wordLeft}>Christ</span>
        <svg className={styles.cross} viewBox="0 0 24 32" fill="none">
          <path className={`${styles.stroke} ${styles.strokeV}`} pathLength={1} d="M12 2V30" />
          <path className={`${styles.stroke} ${styles.strokeH}`} pathLength={1} d="M4 11H20" />
        </svg>
        <span className={styles.wordRight}>App</span>
      </div>
      <span className={styles.srOnly}>{t("loading")}</span>
    </div>
  );
}
