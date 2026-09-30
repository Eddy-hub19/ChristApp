"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./ChatShared.module.scss";

type ReplyBannerProps = {
  username: string;
  text: string;
  onCancel: () => void;
};

/** Плашка над полем вводу: кому й на що відповідаємо, з хрестиком скасування. */
export default function ReplyBanner({ username, text, onCancel }: ReplyBannerProps) {
  const t = useTranslations("chatShared");
  return (
    <div className={styles.banner} role="status">
      <div className={styles.bannerMeta}>
        <span className={styles.bannerLabel}>{t("replyingTo", { name: username })}</span>
        <span className={styles.bannerText}>{text}</span>
      </div>
      <button type="button" className={styles.bannerClose} onClick={onCancel} aria-label={t("cancelReply")}>
        <X size={16} />
      </button>
    </div>
  );
}
