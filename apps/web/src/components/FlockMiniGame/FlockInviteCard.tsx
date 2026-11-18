"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { flockInvitePath } from "@/lib/flockInviteMessage";
import GameIcon from "@/lib/games/gameIcons";
import styles from "./InviteCard.module.scss";

type Props = {
  senderName: string;
  arenaId: number | null;
  isOwn: boolean;
};

/** Карточка-запрошення в чаті: «Ед кличе в Отару» + «Грати» (відкриває гру на цій арені). */
export default function FlockInviteCard({ senderName, arenaId, isOwn }: Props) {
  const t = useTranslations("flock.card");
  return (
    <div className={`${styles.card} ${styles.flock}`}>
      <div className={styles.inner}>
        <span className={styles.icon} aria-hidden>
          <GameIcon game="flock" size={26} />
        </span>
        <span className={styles.body}>
          <span className={styles.title}>{isOwn ? t("titleOwn") : t("title", { name: senderName })}</span>
          <span className={styles.sub}>{t("sub")}</span>
        </span>
        <Link href={flockInvitePath(arenaId)} prefetch={false} className={styles.play}>
          {t("play")}
        </Link>
      </div>
    </div>
  );
}
