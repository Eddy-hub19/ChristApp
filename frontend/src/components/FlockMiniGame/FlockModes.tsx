"use client";

import { useTranslations } from "next-intl";
import FlockSheet from "./FlockSheet";
import { configValue } from "./flockInfoData";
import styles from "./FlockInfo.module.scss";

type Props = {
  game: Record<string, unknown> | undefined;
  canPlay: boolean;
  onPlay: () => void;
  /** Відкрити лобі режиму «Замки» (вибір сторони й скіна). */
  onPlayCastles: () => void;
  onClose: () => void;
};

const fmt = (n: number | undefined, f: (v: number) => string, fallback = "…") => (n === undefined ? fallback : f(n));

/**
 * Окно «Режими» в лобби: карточка режима «Звужуване коло» с правилами (числа из config.game) и кнопкой входа.
 * Обычная арена не меняется: режим идёт на отдельной арене.
 */
export default function FlockModes({ game, canPlay, onPlay, onPlayCastles, onClose }: Props) {
  const t = useTranslations("flock.modes");
  const num = (path: string) => configValue(game, `circle.${path}`);
  const params = {
    warm: fmt(num("warmupMs"), (v) => String(Math.round(v / 1000))),
    loss: fmt(num("outsideLossPerSec"), (v) => String(Math.round(v * 100))),
    reward: fmt(num("winReward"), (v) => String(v)),
    minutes: fmt(num("totalMs"), (v) => String(Math.round((v / 60_000) * 10) / 10)),
    stages: fmt(num("stages"), (v) => String(v)),
    next: fmt(num("endHoldMs"), (v) => String(Math.round(v / 1000))),
  };
  const cn = (path: string) => configValue(game, `castles.${path}`);
  const cp = {
    size: fmt(cn("teamSize"), String),
    max: fmt(cn("maxTeamSize"), String),
    minutes: fmt(cn("matchMs"), (v) => String(Math.round(v / 60_000))),
    hp: fmt(cn("hp"), String),
    damage: fmt(cn("damage"), String),
    win: fmt(cn("deliverToWin"), String),
    hold: fmt(cn("stealHoldMs"), (v) => String(Math.round(v / 100) / 10)),
    carry: fmt(cn("carrySlowPct"), String),
    water: fmt(cn("waterSlowPct"), String),
    respawn: fmt(cn("respawnMs"), (v) => String(Math.round(v / 1000))),
    shield: fmt(cn("respawnShieldMs"), (v) => String(Math.round(v / 1000))),
    ret: fmt(cn("lyingReturnMs"), (v) => String(Math.round(v / 1000))),
    reward: fmt(cn("reward"), String),
    wait: fmt(cn("countdownMs"), (v) => String(Math.round(v / 1000))),
  };
  return (
    <FlockSheet title={t("title")} closeLabel={t("close")} onClose={onClose} testId="flock-modes">
      {() => (
        <>
          <section className={styles.modeCard} aria-label={t("circleTitle")}>
            <h3 className={styles.modeTitle}>{t("circleTitle")}</h3>
            <p className={styles.modeText}>{t("circleIntro", params)}</p>
            <ul className={styles.modeRules}>
              <li>{t("rule1", params)}</li>
              <li>{t("rule2", params)}</li>
              <li>{t("rule3", params)}</li>
              <li>{t("rule4", params)}</li>
            </ul>
            <p className={styles.modeHint}>{t("hint")}</p>
          </section>
          <section className={styles.modeCard} aria-label={t("castlesTitle")}>
            <h3 className={styles.modeTitle}>{t("castlesTitle")}</h3>
            <p className={styles.modeText}>{t("castlesIntro", cp)}</p>
            <ul className={styles.modeRules}>
              <li>{t("castlesRule1", cp)}</li>
              <li>{t("castlesRule2", cp)}</li>
              <li>{t("castlesRule3", cp)}</li>
              <li>{t("castlesRule4", cp)}</li>
              <li>{t("castlesRule5", cp)}</li>
            </ul>
            <p className={styles.modeHint}>{t("castlesHint", cp)}</p>
            <button type="button" className={styles.modePlay} onClick={onPlayCastles} disabled={!canPlay}>
              {canPlay ? t("castlesPlay") : t("connecting")}
            </button>
          </section>
          <div className={styles.modeFooter}>
            <button type="button" className={styles.modePlay} onClick={onPlay} disabled={!canPlay}>
              {canPlay ? t("play") : t("connecting")}
            </button>
          </div>
        </>
      )}
    </FlockSheet>
  );
}
