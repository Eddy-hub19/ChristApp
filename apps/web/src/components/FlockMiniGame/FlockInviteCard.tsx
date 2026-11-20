"use client";

import Image from "next/image";
import { Gamepad2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { flockInvitePath } from "@/lib/flockInviteMessage";
import styles from "./FlockInviteCard.module.scss";

type Props = {
  senderName: string;
  arenaId: number | null;
  isOwn: boolean;
};

/** Карточка-приглашение в чате: овечка с геймпадом на зелёной панели, «Ед зовёт в Отару» и «Играть» (открывает игру на этой арене). */
export default function FlockInviteCard({ senderName, arenaId, isOwn }: Props) {
  const t = useTranslations("flock.card");
  // Язык нужен браузеру для переноса слов с дефисом («дру-зей»); у нас код украинского «ua», а в HTML он «uk».
  const locale = useLocale();
  const lang = locale === "ua" ? "uk" : locale;
  return (
    <div className={styles.card}>
      <div className={styles.panel}>
        <Image
          className={styles.grass}
          src="/flock/invite-grass.png"
          alt=""
          width={368}
          height={34}
          unoptimized
          aria-hidden
        />
        <Image
          className={styles.art}
          src="/flock/invite-sheep.png"
          alt=""
          width={244}
          height={200}
          unoptimized
          aria-hidden
        />
        <span className={styles.body}>
          <span className={styles.title} lang={lang}>{isOwn ? t("titleOwn") : t("title", { name: senderName })}</span>
          <span className={styles.sub}>{t("sub")}</span>
        </span>
        <Link href={flockInvitePath(arenaId)} prefetch={false} className={styles.play}>
          <Gamepad2 size={24} strokeWidth={2} aria-hidden />
          <span>{t("play")}</span>
        </Link>
      </div>
    </div>
  );
}
