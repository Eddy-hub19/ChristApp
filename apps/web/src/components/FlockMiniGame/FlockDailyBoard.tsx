"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { fetchFlockDaily, type FlockDailyBoard as Board } from "./flockApi";
import styles from "./FlockDailyBoard.module.scss";

const REFRESH_MS = 30_000;
const MEDALS = ["gold", "silver", "bronze"] as const;

interface Props {
  /** Данные из /flock/me; дальше таблица сама обновляется раз в ~30 с, пока лобби открыто. */
  initial: Board | null | undefined;
}

export default function FlockDailyBoard({ initial }: Props) {
  const t = useTranslations("flock.daily");
  const [board, setBoard] = useState<Board | null>(initial ?? null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [, setTick] = useState(0);

  useEffect(() => {
    if (initial) {
      setBoard(initial);
      setFetchedAt(Date.now());
    }
  }, [initial]);

  useEffect(() => {
    const id = setInterval(() => {
      void fetchFlockDaily()
        .then((b) => {
          setBoard(b);
          setFetchedAt(Date.now());
        })
        .catch(() => undefined)
        .finally(() => setTick((n) => n + 1));
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (!board) return null;

  const leftMs = Math.max(0, board.resetsInMs - (Date.now() - fetchedAt));
  const hours = Math.floor(leftMs / 3_600_000);
  const time = hours >= 1 ? t("hours", { count: hours }) : t("minutes", { count: Math.max(1, Math.ceil(leftMs / 60_000)) });
  const { streakRewards, streakDays, minMass } = board.config;
  const outside = board.me && !board.top.some((r) => r.me) ? board.me : null;

  return (
    <section className={styles.board} aria-label={t("title")}>
      <header className={styles.head}>
        <h3 className={styles.title}>{t("title")}</h3>
        <span className={styles.resets}>{t("resets", { time })}</span>
      </header>

      {board.top.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden>
            🏆
          </span>
          <strong>{t("empty")}</strong>
          <span>{t("emptyHint")}</span>
        </div>
      ) : (
        <ol className={styles.rows}>
          {board.top.map((r) => (
            <li key={r.rank} className={r.me ? `${styles.row} ${styles.me}` : styles.row}>
              <span className={`${styles.place} ${styles[MEDALS[r.rank - 1]]}`}>{r.rank}</span>
              <AvatarWithFallback src={r.avatarUrl} initials={(r.name[0] ?? "?").toUpperCase()} colorSeed={r.name} width={28} height={28} imageClassName={styles.avatar} fallbackClassName={styles.avatar} />
              <span className={styles.name}>
                {r.name}
                {r.rank === 1 && r.streakDays ? <span className={styles.streakBadge}>{t("streakShort", { days: r.streakDays })}</span> : null}
              </span>
              <span className={styles.mass}>{r.mass}</span>
            </li>
          ))}
          {outside ? (
            <li className={`${styles.row} ${styles.me} ${styles.outside}`}>
              <span className={styles.place}>{outside.rank}</span>
              <span className={styles.name}>{t("yourBest")}</span>
              <span className={styles.mass}>{outside.mass}</span>
            </li>
          ) : null}
        </ol>
      )}

      {board.streak ? <p className={styles.streak}>{t("streak", { days: board.streak.days, total: streakDays, reward: board.streak.reward })}</p> : null}
      <p className={styles.hint}>{t("hint", { list: streakRewards.map((r, i) => t("hintItem", { day: i + 1, reward: r })).join(", "), mass: minMass })}</p>
    </section>
  );
}
