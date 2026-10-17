"use client";

import { useTranslations } from "next-intl";
import type { PairGameId } from "@/lib/gameInviteMessage";
import styles from "./InviteCard.module.scss";

const GAME_EMOJI: Record<PairGameId, string> = {
  snake: "🐍",
  doodle: "🦘",
  guess: "🕵️",
  puzzle: "🧩",
};

type Props = {
  game: PairGameId;
  senderName: string;
  isOwn: boolean;
  /** Відкрити цю гру в поточному особистому чаті (той самий механізм, що «Приєднатися» зі статусу «грає…»). */
  onPlay?: (game: PairGameId) => void;
};

/** Карточка-запрошення в парну гру в особистому чаті: «🐍 Ед кличе грати: Snake» + «Грати». */
export default function GameInviteCard({ game, senderName, isOwn, onPlay }: Props) {
  const t = useTranslations("chatShared.gameInvite");
  const gameName = t(`games.${game}`);
  return (
    <div className={`${styles.card} ${styles.game}`}>
      <div className={styles.inner}>
        <span className={styles.icon} aria-hidden>
          {GAME_EMOJI[game]}
        </span>
        <span className={styles.body}>
          <span className={styles.title}>
            {isOwn ? t("titleOwn", { game: gameName }) : t("title", { name: senderName, game: gameName })}
          </span>
        </span>
        {onPlay ? (
          <button type="button" className={styles.play} onClick={() => onPlay(game)} data-bubble-control>
            {t("play")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
