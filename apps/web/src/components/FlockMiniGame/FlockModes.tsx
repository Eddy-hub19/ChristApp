"use client";

import { useTranslations } from "next-intl";
import { CastleIcon, MazeIcon } from "@/components/icons/game";
import FlockSheet from "./FlockSheet";
import { configValue } from "./flockInfoData";
import { MAZE_UI } from "./flockMaze";
import styles from "./FlockInfo.module.scss";

type Props = {
  game: Record<string, unknown> | undefined;
  canPlay: boolean;
  /** Открыть лобби режима «Замки» (выбор стороны и скина). */
  onPlayCastles: () => void;
  /** Открыть шторку режима «Лабіринт»; без пропса (режим не подключён к серверу) карточка не показывается. */
  onPlayMaze?: () => void;
  onClose: () => void;
};

/**
 * Окно «Режимы» в лобби: выбор режима. «Замки» открывают выбор стороны, вторая карточка закрыта («Скоро»).
 * Режимы идут на отдельных аренах, обычная арена не меняется.
 */
export default function FlockModes({ game, canPlay, onPlayCastles, onPlayMaze, onClose }: Props) {
  const t = useTranslations("flock.modes");
  const num = (path: string) => configValue(game, `castles.${path}`);
  const size = num("teamSize");
  const matchMs = num("matchMs");
  const sub = t("castlesSub", {
    size: size === undefined ? "…" : String(size),
    minutes: matchMs === undefined ? "…" : String(Math.round(matchMs / 60_000)),
  });
  const mazeMax = configValue(game, "race.maxParticipants") ?? MAZE_UI.maxPlayers;
  const mazeSec = configValue(game, "maze.maxDurationMs") === undefined ? MAZE_UI.roundMaxSec : Math.round((configValue(game, "maze.maxDurationMs") as number) / 1000);
  return (
    <FlockSheet title={t("title")} closeLabel={t("close")} onClose={onClose} testId="flock-modes">
      {() => (
        <div className={styles.modeGrid}>
          <button
            type="button"
            className={`${styles.modeBtn} ${styles.modeBtnCastles}`}
            onClick={onPlayCastles}
            disabled={!canPlay}
          >
            <span className={styles.modeBtnIcon}>
              <CastleIcon size={34} />
            </span>
            <span className={styles.modeBtnTitle}>{t("castlesTitle")}</span>
            <span className={styles.modeBtnSub}>{canPlay ? sub : t("connecting")}</span>
          </button>
          {onPlayMaze ? (
            <button type="button" className={`${styles.modeBtn} ${styles.modeBtnCastles}`} onClick={onPlayMaze} disabled={!canPlay}>
              <span className={styles.modeBtnIcon}>
                <MazeIcon size={34} />
              </span>
              <span className={styles.modeBtnTitle}>{t("mazeTitle")}</span>
              <span className={styles.modeBtnSub}>{canPlay ? t("mazeSub", { max: String(mazeMax), sec: String(mazeSec) }) : t("connecting")}</span>
            </button>
          ) : null}
        </div>
      )}
    </FlockSheet>
  );
}
