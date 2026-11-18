"use client";

import { useTranslations } from "next-intl";
import { BoltIcon, CastleIcon, TrophyIcon } from "@/components/icons/game";
import FlockSheet from "./FlockSheet";
import { configValue } from "./flockInfoData";
import styles from "./FlockInfo.module.scss";

type Props = {
  game: Record<string, unknown> | undefined;
  canPlay: boolean;
  /** Відкрити лобі режиму «Замки» (вибір сторони й скіна). */
  onPlayCastles: () => void;
  onClose: () => void;
};

const fmt = (
  n: number | undefined,
  f: (v: number) => string,
  fallback = "…",
) => (n === undefined ? fallback : f(n));

/**
 * Окно «Режими» в лобби: две крупные карточки-кнопки; тап открывает правила режима (тот же FlockSheet, кнопка «Назад»)
 * с большой кнопкой «Грати: <режим>». Числа из config.game; обычная арена не меняется: режимы идут на отдельных аренах.
 */
export default function FlockModes({
  game,
  canPlay,
  onPlayCastles,
  onClose,
}: Props) {
  const t = useTranslations("flock.modes");
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
  const title = t("castlesTitle");
  return (
    <FlockSheet
      title={title}
      closeLabel={t("close")}
      onClose={onClose}
      testId="flock-modes"
    >
      {() => (
        <>
          <section
            className={`${styles.modeCard} ${styles.modeCardCastles}`}
            aria-label={t("castlesTitle")}
          >
            <div className={styles.modeKeys}>
              <span className={styles.modeKey}>
                <CastleIcon size={26} />
                {t("keyCastles1", cp)}
              </span>
              <span className={styles.modeKey}>
                <BoltIcon size={26} />
                {t("keyCastles2", cp)}
              </span>
              <span className={styles.modeKey}>
                <TrophyIcon size={26} />
                {t("keyCastles3", cp)}
              </span>
            </div>
            <p className={styles.modeText}>{t("castlesIntro", cp)}</p>
            <ul className={styles.modeRules}>
              <li>{t("castlesRule1", cp)}</li>
              <li>{t("castlesRule2", cp)}</li>
              <li>{t("castlesRule3", cp)}</li>
              <li>{t("castlesRule4", cp)}</li>
              <li>{t("castlesRule5", cp)}</li>
            </ul>
            <p className={styles.modeHint}>{t("castlesHint", cp)}</p>
          </section>
          <div className={styles.modeFooter}>
            <button
              type="button"
              className={styles.modePlay}
              onClick={onPlayCastles}
              disabled={!canPlay}
            >
              {canPlay ? t("playCastles") : t("connecting")}
            </button>
          </div>
        </>
      )}
    </FlockSheet>
  );
}
