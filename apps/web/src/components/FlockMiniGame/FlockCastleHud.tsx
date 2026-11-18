"use client";

import { useTranslations } from "next-intl";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import type { CastleEndInfo, CastleRewardInfo, Team } from "./flockCastles";
import styles from "./FlockCastles.module.scss";

/** Дані шапки режиму «Замки» (оновлюються ~4 Гц з моделі). */
export interface CastleHudData {
  ph: 0 | 1 | 2 | 3;
  leftMs: number;
  sc: [number, number];
  hp: [number, number];
  hpMax: number;
  st: [number, number];
  hu: [number, number];
  team: Team;
  carrying: boolean;
  sp: number;
  rsMs: number;
  nums: { damage?: number; stealHoldMs?: number; carrySlowPct?: number; waterSlowPct?: number; respawnMs?: number; deliverToWin?: number; lyingReturnMs?: number; hp?: number };
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Значок команди (круглий, з кольором сторони). */
function TeamBadge({ team, size = 26 }: { team: Team; size?: number }) {
  return (
    <span className={`${styles.badge} ${team === 1 ? styles.badgeSheep : styles.badgeWolf}`} style={{ width: size, height: size }} aria-hidden>
      {team === 1 ? "🐑" : "🐺"}
    </span>
  );
}

/** Шапка «12 03:24 8», здоров'я замків, правила перед стартом, індикатори крадіжки / відродження. */
export default function FlockCastleHud({ c }: { c: CastleHudData }) {
  const t = useTranslations("flock.castles");
  const mine = c.team;
  const hpPct = (h: number) => `${Math.max(0, Math.min(100, (h / Math.max(1, c.hpMax)) * 100))}%`;
  const params = {
    damage: c.nums.damage ?? "…",
    win: c.nums.deliverToWin ?? "…",
    hold: c.nums.stealHoldMs ? Math.round(c.nums.stealHoldMs / 100) / 10 : "…",
    carry: c.nums.carrySlowPct ?? "…",
    water: c.nums.waterSlowPct ?? "…",
    respawn: c.nums.respawnMs ? Math.round(c.nums.respawnMs / 1000) : "…",
    ret: c.nums.lyingReturnMs ? Math.round(c.nums.lyingReturnMs / 1000) : "…",
  };
  return (
    <>
      <div className={styles.top} role="status" aria-live="off">
        <div className={styles.capsule}>
          <TeamBadge team={1} />
          <span className={`${styles.score} ${mine === 1 ? styles.scoreMine : ""}`}>{c.sc[0]}</span>
          <span className={styles.clock}>{c.ph === 2 ? clock(c.leftMs) : c.ph === 1 ? clock(c.leftMs) : "--:--"}</span>
          <span className={`${styles.score} ${mine === 2 ? styles.scoreMine : ""}`}>{c.sc[1]}</span>
          <TeamBadge team={2} />
        </div>
        <div className={styles.hpRow}>
          {([1, 2] as Team[]).map((tm) => (
            <div key={tm} className={`${styles.hp} ${tm === 1 ? styles.hpSheep : styles.hpWolf}`} title={t("hpTitle", { hp: Math.max(0, Math.round(c.hp[tm - 1])) })}>
              <span style={{ width: hpPct(c.hp[tm - 1]) }} />
            </div>
          ))}
        </div>
      </div>

      {c.ph < 2 ? (
        <div className={styles.rules} role="status">
          <strong className={styles.rulesTitle}>{c.ph === 0 ? t("waiting") : t("startsIn", { s: Math.ceil(c.leftMs / 1000) })}</strong>
          <span className={styles.teams}>
            <span className={styles.teamSheep}>{t("sheep")}: {c.hu[0]}</span>
            <span className={styles.teamWolf}>{t("wolves")}: {c.hu[1]}</span>
          </span>
          <ul>
            <li>{t("hint1", params)}</li>
            <li>{t("hint2", params)}</li>
            <li>{t("hint3", params)}</li>
            <li>{t("hint4", params)}</li>
          </ul>
        </div>
      ) : null}

      {c.carrying ? <div className={styles.carry}>{t("carrying")}</div> : null}
      {c.sp > 0 && c.sp < 1 ? (
        <div className={styles.steal} role="progressbar" aria-valuenow={Math.round(c.sp * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t("stealing")}>
          <span style={{ width: `${Math.round(c.sp * 100)}%` }} />
          <em>{t("stealing")}</em>
        </div>
      ) : null}
      {c.rsMs > 0 ? (
        <div className={styles.respawn} role="status">
          {t("respawning", { s: Math.ceil(c.rsMs / 1000) })}
        </div>
      ) : null}
    </>
  );
}

/** Підсумкова картка матчу: переможець, рахунок, гравці й нагорода (або причина, чому її нема). */
export function CastleEndCard({ info, reward, onClose, onAgain }: { info: CastleEndInfo; reward: CastleRewardInfo | null; onClose: () => void; onAgain: () => void }) {
  const t = useTranslations("flock.castles");
  const mine = info.you.team;
  const title = info.win === 0 ? t("endDraw") : info.win === mine ? t("endWin") : t("endLose");
  const winnerName = info.win === 0 ? null : t(info.win === 1 ? "sheep" : "wolves");
  const rows = [...info.rows].sort((a, b) => b.d - a.d || b.c - a.c);
  return (
    <div className={styles.endWrap}>
      <div className={styles.end} role="alertdialog" aria-label={t("endTitle")}>
        <h2>{title}</h2>
        <p className={styles.endSub}>{winnerName ? t("winner", { team: winnerName }) : t("noWinner")}</p>
        <div className={styles.endScore}>
          <TeamBadge team={1} size={30} />
          <span>{info.sc[0]}</span>
          <i>:</i>
          <span>{info.sc[1]}</span>
          <TeamBadge team={2} size={30} />
        </div>
        <ul className={styles.rows}>
          <li className={styles.rowsHead}>
            <span />
            <span>{t("colDelivered")}</span>
            <span>{t("colCaught")}</span>
            <span>{t("colStolen")}</span>
          </li>
          {rows.map((r, i) => (
            <li key={`${r.n}-${i}`} className={r.t === 1 ? styles.rowSheep : styles.rowWolf}>
              <span className={styles.rowName}>{r.b ? `🤖 ${r.n}` : r.n}</span>
              <span>{r.d}</span>
              <span>{r.c}</span>
              <span>{r.s}</span>
            </li>
          ))}
        </ul>
        <div className={styles.reward} aria-live="polite">
          {reward ? (
            reward.rubies > 0 ? (
              <strong className={styles.rewardOk}>
                <RubyIcon size={22} /> {t("rewardPlus", { n: reward.rubies })}
              </strong>
            ) : (
              <strong className={styles.rewardNo}>{t(`noReward.${reward.reason ?? "lose"}`)}</strong>
            )
          ) : (
            <span className={styles.endSub}>{t("rewardWait")}</span>
          )}
          {reward?.botOnly ? <span className={styles.endSub}>{t("botLeft", { left: reward.botLeft, limit: reward.botLimit })}</span> : null}
        </div>
        <p className={styles.endSub}>{t("nextMatch")}</p>
        <div className={styles.endButtons}>
          <button type="button" className={styles.endPrimary} onClick={onAgain} autoFocus>
            {t("continue")}
          </button>
          <button type="button" className={styles.endSecondary} onClick={onClose}>
            {t("leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
