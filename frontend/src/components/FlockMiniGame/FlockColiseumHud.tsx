"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatCountdown, tigerBarColor, tigerFraction, type ColiseumHud } from "./flockColiseum";
import type { TigerResult } from "./flockClient";
import styles from "./FlockColiseum.module.scss";

/**
 * HUD карти «Арена»: номер хвилі й лічильник вовків, у паузі - «Хвиля N через 0:07», у фазі тигра - полоска влучань, що лишилися.
 * Плашка зверху по центру (на вузьких екранах - під «Топ-10» праворуч), не перекриває джойстик, кнопки, стрічку чату й мінікарту.
 */
export function FlockColiseumHud({ c, nextMs, leftMs, carry, carryMax }: { c: ColiseumHud; nextMs: number; leftMs: number | null; carry: number; carryMax: number }) {
  const t = useTranslations("flock.coliseum");
  if (c.ph === 0) return null;
  const arrows = (
    <div className={styles.arrows} title={t("arrows", { n: carry, max: carryMax })}>
      <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
        <path d="M2 7h17" stroke="#c99a52" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M24 7l-6-4.5v9z" fill="#cfd6de" stroke="#2a1a0e" strokeWidth="1" strokeLinejoin="round" />
        <path d="M2 7l-1-4.5h5L8 7l-2 4.5H1z" fill="#d8433c" stroke="#2a1a0e" strokeWidth="0.8" strokeLinejoin="round" />
      </svg>
      <strong>{carry}/{carryMax}</strong>
    </div>
  );
  const f = tigerFraction(c.tg);
  return (
    <div className={styles.hud} role="status" aria-live="off">
      {leftMs !== null && leftMs <= 60_000 ? <div className={styles.timer}>{t("roundLeft", { time: formatCountdown(leftMs) })}</div> : null}
      {arrows}
      {c.ph === 3 && c.tg ? (
        <div className={styles.tiger}>
          <span className={styles.tigerName}>{t("tiger")}</span>
          <span className={styles.bar} aria-hidden>
            <span className={styles.barFill} style={{ width: `${Math.round(f * 100)}%`, background: tigerBarColor(f) }} />
          </span>
          <span className={styles.hits}>{t("hits", { left: c.tg.m, max: c.tg.M })}</span>
        </div>
      ) : (
        <div className={styles.wave}>
          <strong>{c.ph === 1 ? (c.tgNext ? t("tigerIn", { time: formatCountdown(nextMs) }) : t("waveIn", { n: c.w, time: formatCountdown(nextMs) })) : t("wave", { n: c.w })}</strong>
          {c.ph === 2 ? <span>{t("wolves", { n: c.n, t: c.t })}</span> : null}
        </div>
      )}
    </div>
  );
}

/** Картка підсумку поразки тигра (`tw`): нагорода або причина її відсутності, прогрес до скіна, новий скін. */
export function TigerResultCard({ r, skinName, preview, onClose }: { r: TigerResult; skinName: string | null; preview?: ReactNode; onClose: () => void }) {
  const t = useTranslations("flock.coliseum");
  const reward = r.rubies > 0 || r.emeralds > 0;
  const reasonText =
    r.reason === "noHits"
      ? t("noHits", { required: r.required ?? 0, hits: r.hits ?? 0 })
      : r.reason === "short"
        ? t("short")
        : r.reason === "afk"
          ? t("afk")
          : r.reason === "daily"
            ? t("daily")
            : t("noReward");
  const emeraldFromDrop = r.emeralds - (r.fallback?.emeralds ?? 0);
  return (
    <div className={styles.result} role="alertdialog" aria-label={t("tiger")}>
      <strong className={styles.resultTitle}>{reward ? t("won", { rubies: r.rubies }) : reasonText}</strong>
      {reward && emeraldFromDrop > 0 ? <span className={styles.resultLine}>{t("emerald", { n: emeraldFromDrop })}</span> : null}
      {r.skinId !== undefined && skinName ? <span className={styles.resultSkin}>{t("skin", { name: skinName })}</span> : null}
      {r.skinId !== undefined ? preview : null}
      {r.fallback?.emeralds ? <span className={styles.resultLine}>{t("fbEmeralds", { n: r.fallback.emeralds })}</span> : null}
      {r.fallback?.rubies ? <span className={styles.resultLine}>{t("fbRubies", { n: r.fallback.rubies })}</span> : null}
      <span className={styles.resultLine}>{t("toSkin", { n: r.toSkin, per: r.perSkin })}</span>
      <button type="button" className={styles.resultClose} onClick={onClose}>
        {t("close")}
      </button>
    </div>
  );
}
