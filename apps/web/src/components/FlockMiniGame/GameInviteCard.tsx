"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PairGameId } from "@/lib/gameInviteMessage";
import GameIcon from "@/lib/games/gameIcons";
import styles from "./InviteCard.module.scss";

type Props = {
  game: PairGameId;
  senderName: string;
  isOwn: boolean;
  /** Коли надіслано запрошення: старші за годину вважаємо протермінованими (партії вже нема). */
  createdAt?: string | number | Date;
  /** Відкрити цю гру в поточному особистому чаті (той самий механізм, що «Приєднатися» зі статусу «грає…»). */
  onPlay?: (game: PairGameId) => void;
};

const INVITE_TTL_MS = 60 * 60 * 1000;

/** Карточка-запрошення в парну гру в особистому чаті: «Ед кличе грати: Snake» + «Грати». */
export default function GameInviteCard({ game, senderName, isOwn, createdAt, onPlay }: Props) {
  const t = useTranslations("chatShared.gameInvite");
  const gameName = t(`games.${game}`);
  const [nowMs] = useState(() => Date.now());
  const createdMs = createdAt === undefined ? NaN : new Date(createdAt).getTime();
  const expired = Number.isFinite(createdMs) && nowMs - createdMs > INVITE_TTL_MS;
  return (
    <div className={`${styles.card} ${styles.game}`}>
      <div className={styles.inner}>
        <span className={styles.icon} aria-hidden>
          <GameIcon game={game} size={26} />
        </span>
        <span className={styles.body}>
          <span className={styles.title}>
            {isOwn ? t("titleOwn", { game: gameName }) : t("title", { name: senderName, game: gameName })}
          </span>
        </span>
        {expired ? (
          <span className={styles.expired}>{t("expired")}</span>
        ) : onPlay ? (
          <button
            type="button"
            className={isOwn ? `${styles.play} ${styles.playSecondary}` : styles.play}
            onClick={() => onPlay(game)}
            data-bubble-control
          >
            {t("play")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
