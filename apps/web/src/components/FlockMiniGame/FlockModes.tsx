"use client";

import { useTranslations } from "next-intl";
import { CastleIcon } from "@/components/icons/game";
import FlockSheet from "./FlockSheet";
import { configValue } from "./flockInfoData";
import styles from "./FlockInfo.module.scss";

type Props = {
  game: Record<string, unknown> | undefined;
  canPlay: boolean;
  /** Открыть лобби режима «Замки» (выбор стороны и скина). */
  onPlayCastles: () => void;
  onClose: () => void;
};

/**
 * Окно «Режимы» в лобби: выбор режима. «Замки» открывают выбор стороны, вторая карточка закрыта («Скоро»).
 * Режимы идут на отдельных аренах, обычная арена не меняется.
 */
export default function FlockModes({ game, canPlay, onPlayCastles, onClose }: Props) {
  const t = useTranslations("flock.modes");
  const num = (path: string) => configValue(game, `castles.${path}`);
  const size = num("teamSize");
  const matchMs = num("matchMs");
  const sub = t("castlesSub", {
    size: size === undefined ? "…" : String(size),
    minutes: matchMs === undefined ? "…" : String(Math.round(matchMs / 60_000)),
  });
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
          <div className={`${styles.modeBtn} ${styles.modeBtnSoon}`} aria-disabled="true">
            <span className={styles.modeBtnIcon} aria-hidden="true">
              ⚽
            </span>
            <span className={styles.modeBtnTitle}>{t("footballTitle")}</span>
            <span className={styles.modeBtnSub}>{t("soon")}</span>
          </div>
        </div>
      )}
    </FlockSheet>
  );
}
