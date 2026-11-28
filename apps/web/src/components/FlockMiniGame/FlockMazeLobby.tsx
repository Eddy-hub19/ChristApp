"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchMazeLobby, type MazeLobbyInfo } from "./flockApi";
import FlockSheet from "./FlockSheet";
import { MAZE_UI } from "./flockMaze";
import styles from "./FlockInfo.module.scss";

type Props = {
  canPlay: boolean;
  /** Помилка входу (режим вимкнено). */
  error?: string;
  /** Числа з конфіга сервера (welcome/me), якщо вже є; інакше типові з flockMaze.MAZE_DEFAULTS. */
  nums?: { max?: number; roundSec?: number; reward?: number; limit?: number };
  onPlay: () => void;
  onClose: () => void;
};

/** Шторка режиму «Лабіринт»: правила й кнопка «Грати». Скін береться той, що вибрано в лобі (скіни будь-які, лише вигляд). */
export default function FlockMazeLobby({ canPlay, error, nums, onPlay, onClose }: Props) {
  const t = useTranslations("flock.maze");
  const [live, setLive] = useState<MazeLobbyInfo | null>(null);
  // скільки людей у раунді зараз (оновлюємо раз на ~4 с, поки відкрита шторка)
  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetchMazeLobby()
        .then((l) => alive && setLive(l))
        .catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const params = {
    max: nums?.max ?? MAZE_UI.maxPlayers,
    sec: nums?.roundSec ?? MAZE_UI.roundMaxSec,
    reward: nums?.reward ?? MAZE_UI.rewardRubies,
    limit: nums?.limit ?? MAZE_UI.winsPerDay,
  };
  return (
    <FlockSheet title={t("title")} closeLabel={t("play")} onClose={onClose} testId="flock-maze-lobby">
      {() => (
        <>
          <p className={styles.modeText}>{t("rule1")}</p>
          <p className={styles.modeText}>{t("rule2")}</p>
          <p className={styles.modeText}>{t("rule3")}</p>
          <p className={styles.modeText}>{t("rule4")}</p>
          <p className={styles.modeText}>{t("rule5", params)}</p>
          <p className={styles.modeText}>{t("rule6", params)}</p>
          <p className={styles.modeHint}>{t("hint")}</p>
          {live ? (
            <p className={styles.modeText} role="status">
              {live.enabled ? t("live", { n: live.humans, max: live.max }) : t("off")}
            </p>
          ) : null}
          {error ? <p className={styles.modeText} role="alert">{error}</p> : null}
          <div className={styles.modeFooter}>
            <button type="button" className={styles.modePlay} disabled={!canPlay || live?.enabled === false} onClick={onPlay}>
              {canPlay ? t("play") : t("connecting")}
            </button>
          </div>
        </>
      )}
    </FlockSheet>
  );
}
