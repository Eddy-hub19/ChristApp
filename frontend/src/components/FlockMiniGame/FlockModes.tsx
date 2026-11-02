"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { BoltIcon, CastleIcon, CircleZoneIcon, ShieldIcon, TrophyIcon } from "@/components/icons/game";
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
 * Окно «Режими» в лобби: две крупные карточки-кнопки; тап открывает правила режима (тот же FlockSheet, кнопка «Назад»)
 * с большой кнопкой «Грати: <режим>». Числа из config.game; обычная арена не меняется: режимы идут на отдельных аренах.
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
  const [view, setView] = useState<"circle" | "castles" | null>(null);
  const cardIcon = { circle: <CircleZoneIcon size={34} />, castles: <CastleIcon size={34} /> };
  const title = view === "circle" ? t("circleTitle") : view === "castles" ? t("castlesTitle") : t("title");
  const back = view ? (
    <button type="button" className={styles.modeBack} onClick={() => setView(null)} aria-label={t("back")}>
      <ChevronLeft size={18} aria-hidden />
      <span>{t("back")}</span>
    </button>
  ) : null;
  return (
    <FlockSheet title={title} closeLabel={t("close")} onClose={onClose} headExtra={back} testId="flock-modes">
      {() =>
        view === null ? (
          <div className={styles.modeGrid}>
            <button type="button" className={`${styles.modeBtn} ${styles.modeBtnCircle}`} onClick={() => setView("circle")}>
              <span className={styles.modeBtnIcon}>{cardIcon.circle}</span>
              <span className={styles.modeBtnTitle}>{t("circleTitle")}</span>
              <span className={styles.modeBtnSub}>{t("circleSub")}</span>
            </button>
            <button type="button" className={`${styles.modeBtn} ${styles.modeBtnCastles}`} onClick={() => setView("castles")}>
              <span className={styles.modeBtnIcon}>{cardIcon.castles}</span>
              <span className={styles.modeBtnTitle}>{t("castlesTitle")}</span>
              <span className={styles.modeBtnSub}>{t("castlesSub", cp)}</span>
            </button>
          </div>
        ) : view === "circle" ? (
          <>
            <section className={`${styles.modeCard} ${styles.modeCardCircle}`} aria-label={t("circleTitle")}>
              <div className={styles.modeKeys}>
                <span className={styles.modeKey}><CircleZoneIcon size={26} />{t("keyCircle1")}</span>
                <span className={styles.modeKey}><ShieldIcon size={26} />{t("keyCircle2")}</span>
                <span className={styles.modeKey}><TrophyIcon size={26} />{t("keyCircle3", params)}</span>
              </div>
              <p className={styles.modeText}>{t("circleIntro", params)}</p>
              <ul className={styles.modeRules}>
                <li>{t("rule1", params)}</li>
                <li>{t("rule2", params)}</li>
                <li>{t("rule3", params)}</li>
                <li>{t("rule4", params)}</li>
              </ul>
              <p className={styles.modeHint}>{t("hint")}</p>
            </section>
            <div className={styles.modeFooter}>
              <button type="button" className={styles.modePlay} onClick={onPlay} disabled={!canPlay}>
                {canPlay ? t("play") : t("connecting")}
              </button>
            </div>
          </>
        ) : (
          <>
            <section className={`${styles.modeCard} ${styles.modeCardCastles}`} aria-label={t("castlesTitle")}>
              <div className={styles.modeKeys}>
                <span className={styles.modeKey}><CastleIcon size={26} />{t("keyCastles1", cp)}</span>
                <span className={styles.modeKey}><BoltIcon size={26} />{t("keyCastles2", cp)}</span>
                <span className={styles.modeKey}><TrophyIcon size={26} />{t("keyCastles3", cp)}</span>
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
              <button type="button" className={styles.modePlay} onClick={onPlayCastles} disabled={!canPlay}>
                {canPlay ? t("playCastles") : t("connecting")}
              </button>
            </div>
          </>
        )
      }
    </FlockSheet>
  );
}
