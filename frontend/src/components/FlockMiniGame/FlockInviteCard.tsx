"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { flockInvitePath } from "@/lib/flockInviteMessage";
import styles from "./FlockInviteCard.module.scss";

type Props = {
  senderName: string;
  arenaId: number | null;
  isOwn: boolean;
};

/** Карточка-запрошення в чаті: «🐑 Ед кличе в Отару» + «Грати» (відкриває гру на цій арені). */
export default function FlockInviteCard({ senderName, arenaId, isOwn }: Props) {
  const t = useTranslations("flock.card");
  return (
    <div className={styles.card}>
      <span className={styles.sheep} aria-hidden>
        🐑
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{isOwn ? t("titleOwn") : t("title", { name: senderName })}</span>
        <span className={styles.sub}>{t("sub")}</span>
      </span>
      <Link href={flockInvitePath(arenaId)} prefetch={false} className={styles.play}>
        {t("play")}
      </Link>
    </div>
  );
}
