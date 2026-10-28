"use client";

import { useTranslations } from "next-intl";
import FlockSheet from "./FlockSheet";
import { configValue } from "./flockInfoData";
import styles from "./FlockInfo.module.scss";
import game_ from "./FlockMiniGame.module.scss";

type Props = {
  game: Record<string, unknown> | undefined;
  canPlay: boolean;
  onPlay: () => void;
  onClose: () => void;
};

const fmt = (n: number | undefined, f: (v: number) => string, fallback = "…") => (n === undefined ? fallback : f(n));

/**
 * Окно «Режими» в лобби: карточка режима «Звужуване коло» с правилами (числа из config.game) и кнопкой входа.
 * Обычная арена не меняется: режим идёт на отдельной арене.
 */
export default function FlockModes({ game, canPlay, onPlay, onClose }: Props) {
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
  return (
    <FlockSheet title={t("title")} closeLabel={t("close")} onClose={onClose} testId="flock-modes">
      {() => (
        <section className={styles.entry} aria-label={t("circleTitle")}>
          <h3 className={styles.sectionTitle}>{t("circleTitle")}</h3>
          <p>{t("circleIntro", params)}</p>
          <ul>
            <li>{t("rule1", params)}</li>
            <li>{t("rule2", params)}</li>
            <li>{t("rule3", params)}</li>
            <li>{t("rule4", params)}</li>
          </ul>
          <p>{t("hint")}</p>
          <button type="button" className={game_.primary} onClick={onPlay} disabled={!canPlay}>
            {canPlay ? t("play") : t("connecting")}
          </button>
        </section>
      )}
    </FlockSheet>
  );
}
