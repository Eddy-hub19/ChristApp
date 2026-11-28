"use client";

import { useTranslations } from "next-intl";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import { dashReady, raceClock, raceTime, type RaceHudData, type RaceResults, type RaceToast } from "./flockRace";
import styles from "./FlockRaceHud.module.scss";

/**
 * HUD гонки: верх по центру (таймер, місце, прогрес по чекпоінтах), підказки «Гоу!» / «Чекпоінт!», тости про поїдання
 * і кнопка «Ривок» з кільцем перезарядки. Лише відмальовка за пропсами; джойстик, кнопки гри й мінікарта не перекриваються.
 */
export default function FlockRaceHud({ hud, toasts, onDash }: { hud: RaceHudData; toasts: RaceToast[]; onDash: () => void }) {
  const t = useTranslations("flock.race");
  const racing = hud.phase === "racing";
  const ready = dashReady(hud.dashLeftMs, hud.dashCdMs);
  const canDash = racing && ready >= 1;
  return (
    <>
      <div className={styles.top} role="status" aria-live="off">
        <div className={styles.capsule}>
          {hud.phase === "racing" ? (
            <>
              <span className={styles.clock}>{raceClock(hud.leftMs)}</span>
              {hud.place > 0 ? (
                <span className={styles.place} aria-label={t("placeAria", { place: hud.place, total: hud.total })}>
                  {hud.place}/{hud.total}
                </span>
              ) : null}
              <span className={styles.pips} aria-label={t("checkpointsAria", { done: hud.cpDone, total: hud.cpTotal })}>
                {Array.from({ length: hud.cpTotal }, (_, i) => (
                  <i key={i} className={i < hud.cpDone ? styles.pipOn : styles.pip} />
                ))}
              </span>
            </>
          ) : hud.phase === "lobby" ? (
            <span className={styles.state}>{t("lobby", { s: Math.ceil(hud.leftMs / 1000) })}</span>
          ) : hud.phase === "countdown" ? (
            <span className={styles.state}>{t("countdown")}</span>
          ) : hud.phase === "spectating" ? (
            <span className={styles.state}>{t("spectating")}</span>
          ) : (
            <span className={styles.state}>{t("results")}</span>
          )}
        </div>
      </div>

      {hud.phase === "countdown" ? (
        <div className={styles.center} aria-live="assertive">
          <span className={styles.count} key={Math.ceil(hud.leftMs / 1000)}>
            {Math.max(1, Math.ceil(hud.leftMs / 1000))}
          </span>
        </div>
      ) : null}
      {hud.hint ? (
        <div className={styles.center} aria-live="polite">
          <span className={`${styles.hint} ${hud.hint === "checkpoint" ? styles.hintCp : ""}`} key={`${hud.hint}-${hud.cpDone}`}>
            {hud.hint === "go" ? t("go") : t("checkpoint")}
          </span>
        </div>
      ) : null}

      {toasts.length > 0 ? (
        <ul className={styles.toasts} aria-live="polite">
          {toasts.map((x) => (
            <li key={x.id} className={x.kind === "ate" ? styles.toastAte : styles.toastEaten}>
              {x.kind === "ate" ? t("toastAte", { name: x.name }) : t("toastEatenBy", { name: x.name })}
            </li>
          ))}
        </ul>
      ) : null}

      {racing ? (
        <button
          type="button"
          className={`${styles.dash} ${canDash ? styles.dashReady : ""}`}
          style={{ ["--ready" as string]: `${Math.round(ready * 360)}deg` }}
          onClick={onDash}
          disabled={!canDash}
          aria-label={t("dash")}
          aria-keyshortcuts="Space"
          data-testid="race-dash"
        >
          <span className={styles.dashLabel}>{t("dash")}</span>
        </button>
      ) : null}
    </>
  );
}

/** Підсумок раунду: місця, час (секунди з десятими), «Зʼїв» / «Зʼїдений», нагорода або причина її відсутності. */
export function RaceResultsCard({ results, onClose }: { results: RaceResults; onClose: () => void }) {
  const t = useTranslations("flock.race");
  const rows = [...results.rows].sort((a, b) => (a.place || 99) - (b.place || 99) || b.ate - a.ate);
  return (
    <div className={styles.endWrap}>
      <div className={styles.end} role="alertdialog" aria-label={t("endTitle")}>
        <h2>{t("endTitle")}</h2>
        <ul className={styles.rows}>
          <li className={styles.rowsHead}>
            <span />
            <span>{t("colTime")}</span>
            <span>{t("colAte")}</span>
            <span>{t("colEaten")}</span>
          </li>
          {rows.map((r) => (
            <li key={r.pid} className={r.me ? styles.rowMe : undefined}>
              <span className={styles.rowName}>
                <b className={styles.rowPlace}>{r.place > 0 ? r.place : "–"}</b>
                {r.bot ? `🤖 ${r.name}` : r.name}
              </span>
              <span>{r.timeMs === null ? t("dnf") : t("seconds", { s: raceTime(r.timeMs) })}</span>
              <span>{r.ate}</span>
              <span>{r.eaten}</span>
            </li>
          ))}
        </ul>
        <div className={styles.reward} aria-live="polite">
          {results.rewardRubies > 0 ? (
            <strong className={styles.rewardOk}>
              <RubyIcon size={22} /> {t("rewardPlus", { n: results.rewardRubies })}
            </strong>
          ) : (
            <span className={styles.rewardNo}>{t(`noReward.${results.noRewardReason}`)}</span>
          )}
        </div>
        <button type="button" className={styles.endBtn} onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}
