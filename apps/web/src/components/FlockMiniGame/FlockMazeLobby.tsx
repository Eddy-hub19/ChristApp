"use client";

import { useTranslations } from "next-intl";
import FlockSheet from "./FlockSheet";
import { MAZE_DEFAULTS, MAZE_UI } from "./flockMaze";
import styles from "./FlockInfo.module.scss";

type Props = {
  canPlay: boolean;
  /** Числа з конфіга сервера (welcome/me), якщо вже є; інакше типові з flockMaze.MAZE_DEFAULTS. */
  nums?: { max?: number; roundSec?: number; reward?: number; limit?: number };
  onPlay: () => void;
  onClose: () => void;
};

/** Шторка режиму «Лабіринт»: правила й кнопка «Грати». Скін береться той, що вибрано в лобі (скіни будь-які, лише вигляд). */
export default function FlockMazeLobby({ canPlay, nums, onPlay, onClose }: Props) {
  const t = useTranslations("flock.maze");
  const params = {
    max: nums?.max ?? MAZE_UI.maxPlayers,
    sec: nums?.roundSec ?? MAZE_UI.roundMaxSec,
    reward: nums?.reward ?? MAZE_UI.rewardRubies,
    limit: nums?.limit ?? MAZE_UI.winsPerDay,
  };
  void MAZE_DEFAULTS;
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
          <div className={styles.modeFooter}>
            <button type="button" className={styles.modePlay} disabled={!canPlay} onClick={onPlay}>
              {canPlay ? t("play") : t("connecting")}
            </button>
          </div>
        </>
      )}
    </FlockSheet>
  );
}
