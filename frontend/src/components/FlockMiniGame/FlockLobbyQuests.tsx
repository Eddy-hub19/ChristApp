"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, Check, ChevronDown } from "lucide-react";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import { EmeraldIcon, FlockIcon } from "@/components/icons/game";
import { claimFlockQuest, fetchFlockQuests, FlockApiError, type FlockQuest, type FlockQuestsView } from "./flockApi";
import { KIND_ICON } from "./FlockQuests";
import styles from "./FlockLobby.module.scss";

type Props = {
  /** false, пока открыто окно «Завдання дня»: после закрытия блок перечитывает задания. */
  active: boolean;
  /** Баланс/число невзятых изменились. */
  onChanged: (v: { rubies?: number; emeralds?: number; claimable: number }) => void;
};

/** Блок «Щоденні завдання» в лобби: три задания с полоской и наградой, «Забрати»; когда всё забрано, сворачивается в одну строку. */
export default function FlockLobbyQuests({ active, onChanged }: Props) {
  const t = useTranslations("flock");
  const [view, setView] = useState<(FlockQuestsView & { at: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = await fetchFlockQuests();
      setView({ ...v, at: Date.now() });
      setError(null);
      onChanged({ claimable: v.claimable });
    } catch {
      setError("generic");
    }
  }, [onChanged]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // таймер считаем раз в минуту: показываем целые часы
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const left = view ? view.resetInMs - (now - view.at) : 0;
  useEffect(() => {
    if (view && left <= 0) void load();
  }, [view, left, load]);

  const claim = async (q: FlockQuest) => {
    setBusy(q.slot);
    setError(null);
    try {
      const r = await claimFlockQuest(q.slot);
      setView({ day: r.day, resetInMs: r.resetInMs, quests: r.quests, claimable: r.claimable, at: Date.now() });
      onChanged({ ...(r.type === "emeralds" ? { emeralds: r.balance } : { rubies: r.balance }), claimable: r.claimable });
    } catch (e) {
      const code = e instanceof FlockApiError ? e.code : null;
      setError(code === "emerald_cap" || code === "quest_claimed" || code === "quest_not_done" ? code : "generic");
      void load();
    } finally {
      setBusy(null);
    }
  };

  if (!view) {
    return error ? (
      <p className={styles.error} role="alert">
        {t(`quests.errors.${error}`)}
      </p>
    ) : null;
  }

  const total = view.quests.length;
  const claimedCount = view.quests.filter((q) => q.claimed).length;
  const allClaimed = total > 0 && claimedCount === total;
  const hours = Math.ceil(Math.max(0, left) / 3_600_000);
  const resetText = hours >= 1 ? t("lobby.resetInHours", { n: hours }) : t("lobby.resetInMin", { n: Math.max(1, Math.ceil(Math.max(0, left) / 60_000)) });

  if (allClaimed && !expanded) {
    return (
      <section className={styles.quests} aria-label={t("lobby.questsTitle")}>
        <button type="button" className={styles.questsDone} onClick={() => setExpanded(true)} aria-expanded={false}>
          <span className={styles.questsDoneIcon} aria-hidden>
            <Check size={16} />
          </span>
          <span className={styles.questsDoneText}>{t("lobby.questsAllDone", { n: claimedCount, m: total })}</span>
          <span className={styles.questsTimer}>{resetText}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
      </section>
    );
  }

  return (
    <section className={styles.quests} aria-label={t("lobby.questsTitle")}>
      <div className={styles.questsHead}>
        <CalendarCheck size={20} aria-hidden className={styles.questsHeadIcon} />
        <h3>{t("lobby.questsTitle")}</h3>
        <span className={styles.questsTimer}>{resetText}</span>
        {allClaimed ? (
          <button type="button" className={styles.questsFold} onClick={() => setExpanded(false)} aria-label={t("lobby.questsFold")}>
            <ChevronDown size={16} aria-hidden className={styles.flip} />
          </button>
        ) : null}
      </div>
      <ul className={styles.questList}>
        {view.quests.map((q) => {
          const Icon = KIND_ICON[q.kind] ?? FlockIcon;
          const pct = q.target > 0 ? Math.min(1, q.progress / q.target) : 0;
          const title = t(`quests.items.${q.id}.title`, { n: q.target, min: Math.round(q.target / 60) });
          const numbers = q.kind === "alive" || q.kind === "survive_map" || q.kind === "sprint" ? t("quests.sec", { n: q.progress, of: q.target }) : `${q.progress} / ${q.target}`;
          const emerald = q.reward.type === "emeralds";
          return (
            <li key={q.slot} className={`${styles.quest} ${q.claimed ? styles.questClaimed : ""}`}>
              <span className={styles.questIcon}>
                <Icon size={24} />
              </span>
              <div className={styles.questMain}>
                <span className={styles.questTitle}>{title}</span>
                <div className={styles.questBar} role="progressbar" aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.progress} aria-label={title}>
                  <span style={{ transform: `scaleX(${pct})` }} />
                </div>
                <span className={styles.questNumbers}>{numbers}</span>
              </div>
              {q.claimed ? (
                <span className={styles.questTaken}>
                  <Check size={14} aria-hidden />
                  {t("lobby.claimed")}
                </span>
              ) : q.done ? (
                <button type="button" className={styles.questClaim} disabled={busy !== null} onClick={() => void claim(q)}>
                  {t("lobby.claim")}
                </button>
              ) : (
                <span className={`${styles.reward} ${emerald ? styles.rewardEmerald : styles.rewardRuby}`}>
                  {emerald ? <EmeraldIcon size={16} /> : <RubyIcon size={16} />}+{q.reward.amount}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className={styles.error} role="alert">
          {t(`quests.errors.${error}`)}
        </p>
      ) : null}
    </section>
  );
}
