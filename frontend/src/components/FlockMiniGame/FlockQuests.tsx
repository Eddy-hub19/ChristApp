"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import {
  AlphaIcon,
  CastleIcon,
  EmeraldIcon,
  FlockIcon,
  LavaIcon,
  LeafIcon,
  RocketIcon,
  ShieldIcon,
  TrophyIcon,
  type ColorIconProps,
} from "@/components/icons/game";
import { CalendarCheck, Crown } from "lucide-react";
import { claimFlockAchievement, claimFlockQuest, fetchFlockAchievements, fetchFlockQuests, FlockApiError, type FlockAchievement, type FlockAchievementsView, type FlockQuest, type FlockQuestsView } from "./flockApi";
import FlockSheet from "./FlockSheet";
import styles from "./FlockQuests.module.scss";

/** Иконка по виду задания (все из общей библиотеки иконок игр). */
const KIND_ICON: Record<string, ComponentType<ColorIconProps>> = {
  food: LeafIcon,
  mass: TrophyIcon,
  alive: ShieldIcon,
  sprint: RocketIcon,
  boss: AlphaIcon,
  top1: TrophyIcon,
  castles: CastleIcon,
  survive_map: LavaIcon,
  tiger: FlockIcon,
  buy_skin_regular: RubyIcon,
  buy_skin_special: RubyIcon,
};

type Props = {
  onClose: () => void;
  /** Баланс/количество невзятых изменились (после «Забрати» или загрузки). */
  onChanged: (v: { rubies?: number; emeralds?: number; claimable: number }) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** Окно «Завдання дня»: три задания, прогресс, награда, «Забрати». Всё считает и проверяет сервер. */
export default function FlockQuests({ onClose, onChanged }: Props) {
  const t = useTranslations("flock");
  const [view, setView] = useState<(FlockQuestsView & { at: number }) | null>(null);
  const [ach, setAch] = useState<FlockAchievementsView | null>(null);
  const [achBusy, setAchBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([fetchFlockQuests(), fetchFlockAchievements().catch(() => null)]);
      setView({ ...v, at: Date.now() });
      setAch(a);
      setError(null);
      onChanged({ claimable: v.claimable + (a?.claimable ?? 0) });
    } catch {
      setError("generic");
    }
  }, [onChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = view ? view.resetInMs - (now - view.at) : 0;
  // полночь по Киеву наступила: берём новые задания
  useEffect(() => {
    if (view && left <= 0) void load();
  }, [view, left, load]);

  const claim = async (q: FlockQuest) => {
    setBusy(q.slot);
    setError(null);
    try {
      const r = await claimFlockQuest(q.slot);
      setView({ day: r.day, resetInMs: r.resetInMs, quests: r.quests, claimable: r.claimable, at: Date.now() });
      onChanged({ ...(r.type === "emeralds" ? { emeralds: r.balance } : { rubies: r.balance }), claimable: r.claimable + (ach?.claimable ?? 0) });
    } catch (e) {
      const code = e instanceof FlockApiError ? e.code : null;
      setError(code === "emerald_cap" || code === "quest_claimed" || code === "quest_not_done" ? code : "generic");
      void load();
    } finally {
      setBusy(null);
    }
  };

  const claimAch = async (a: FlockAchievement) => {
    setAchBusy(a.key);
    setError(null);
    try {
      const r = await claimFlockAchievement(a.key);
      setAch({ items: r.items, claimable: r.claimable, emeraldDailyCap: r.emeraldDailyCap });
      onChanged({ emeralds: r.balance, claimable: (view?.claimable ?? 0) + r.claimable });
    } catch (e) {
      const code = e instanceof FlockApiError ? e.code : null;
      setError(code === "emerald_cap" || code === "emerald_daily_cap" || code === "achievement_claimed" || code === "achievement_not_done" ? code : "generic");
      void load();
    } finally {
      setAchBusy(null);
    }
  };

  return (
    <FlockSheet title={t("quests.title")} closeLabel={t("quests.close")} onClose={onClose} testId="flock-quests">
      {() => (
        <div className={styles.body}>
          <div className={styles.head}>
            <strong>{t("quests.today")}</strong>
            {view ? (
              <span className={styles.timer} aria-label={t("quests.resetIn", { time: fmtLeft(left) })}>
                {t("quests.resetIn", { time: fmtLeft(left) })}
              </span>
            ) : null}
          </div>
          {!view && !error ? <p className={styles.note}>{t("quests.loading")}</p> : null}
          {view
            ? view.quests.map((q) => {
                const Icon = KIND_ICON[q.kind] ?? FlockIcon;
                const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                const title = t(`quests.items.${q.id}.title`, { n: q.target, min: Math.round(q.target / 60) });
                const unit = q.kind === "alive" || q.kind === "survive_map" || q.kind === "sprint" ? t("quests.sec", { n: q.progress, of: q.target }) : `${q.progress} / ${q.target}`;
                return (
                  <section key={q.slot} className={`${styles.card} ${q.claimed ? styles.cardDone : ""} ${q.slot === 2 ? styles.cardHard : ""}`}>
                    <span className={styles.icon}>
                      <Icon size={28} />
                    </span>
                    <div className={styles.main}>
                      <strong className={styles.name}>{title}</strong>
                      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.progress}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className={styles.numbers}>{q.kind === "top1" || q.kind === "mass" ? `${q.progress} / ${q.target}` : unit}</span>
                    </div>
                    <div className={styles.side}>
                      <span className={styles.reward}>
                        +{q.reward.amount}
                        {q.reward.type === "emeralds" ? <EmeraldIcon size={16} /> : <RubyIcon size={16} />}
                      </span>
                      {q.claimed ? (
                        <span className={styles.claimed}>{t("quests.claimed")}</span>
                      ) : (
                        <button type="button" className={styles.claimBtn} disabled={!q.done || busy !== null} onClick={() => void claim(q)}>
                          {t("quests.claim")}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })
            : null}
          {ach && ach.items.length > 0 ? (
            <>
              <div className={styles.head}>
                <strong>{t("quests.hardTitle")}</strong>
                <span className={styles.timer}>{t("quests.hardCap", { n: ach.emeraldDailyCap })}</span>
              </div>
              {ach.items.map((a) => {
                const Icon = a.key === "streak" ? CalendarCheck : a.key === "mass" ? TrophyIcon : Crown;
                const pct = a.target > 0 ? Math.min(100, Math.round((a.progress / a.target) * 100)) : 0;
                const title = t(`quests.ach.${a.key}.title`, { n: a.target, min: Math.round((a.needSec ?? 0) / 60) });
                const numbers = a.key === "streak" ? t("quests.ach.streak.numbers", { n: a.progress, of: a.target }) : a.key === "specials" ? t("quests.ach.specials.numbers", { n: a.progress, of: a.target }) : `${a.progress} / ${a.target}`;
                return (
                  <section key={a.key} className={`${styles.card} ${styles.cardHard} ${a.claimed ? styles.cardDone : ""}`}>
                    <span className={styles.icon}>
                      <Icon size={28} />
                    </span>
                    <div className={styles.main}>
                      <strong className={styles.name}>{title}</strong>
                      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={a.target} aria-valuenow={a.progress}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className={styles.numbers}>{numbers}</span>
                      {a.key === "streak" ? <span className={styles.numbers}>{t("quests.ach.streak.today", { m: Math.min(Math.floor((a.todaySec ?? 0) / 60), Math.round((a.needSec ?? 0) / 60)), of: Math.round((a.needSec ?? 0) / 60) })}</span> : null}
                    </div>
                    <div className={styles.side}>
                      <span className={styles.reward}>
                        +{a.reward.amount}
                        <EmeraldIcon size={16} />
                      </span>
                      {a.claimed ? (
                        <span className={styles.claimed}>{t("quests.ach.received")}</span>
                      ) : (
                        <button type="button" className={styles.claimBtn} disabled={!a.done || achBusy !== null} onClick={() => void claimAch(a)}>
                          {t("quests.claim")}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </>
          ) : null}
          {error ? <p className={styles.error}>{t(`quests.errors.${error}`)}</p> : null}
          <p className={styles.note}>{t("quests.hint")}</p>
        </div>
      )}
    </FlockSheet>
  );
}
