"use client";

import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { chatMessagePreview } from "@/lib/chatMessagePreview";
import type { AppMessageType } from "@/types/message";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { getInitials } from "@/lib/utils";
import type { RoomPin } from "@/types/pin";
import styles from "./ChatShared.module.scss";

type PinnedBarProps = {
  pins: readonly RoomPin[];
  /** Прокрутить чат к сообщению и коротко подсветить его. */
  onOpen: (messageId: string) => void;
};

/**
 * Узкая полоска над списком сообщений: автор и начало закреплённого. Нажатие переходит к сообщению; если закрепов
 * несколько (до 3) - стрелки и счётчик «1 из 3», каждое следующее нажатие листает по кругу.
 */
function PinnedBar({ pins, onOpen }: PinnedBarProps) {
  const t = useTranslations("chatShared");
  const [index, setIndex] = useState(0);

  // Закреп сняли или чат сменился: индекс не должен выходить за список.
  useEffect(() => {
    setIndex((prev) => (prev >= pins.length ? Math.max(0, pins.length - 1) : prev));
  }, [pins.length]);

  const pin = pins[Math.min(index, pins.length - 1)];
  if (!pin) return null;

  const total = pins.length;
  const preview =
    chatMessagePreview({ content: pin.message.content, type: pin.message.type as AppMessageType }, t).trim() ||
    t("pinnedMessage");
  const step = (delta: number) => setIndex((prev) => (prev + delta + total) % total);

  return (
    <div className={styles.pinnedBar} role="region" aria-label={t("pinnedMessage")}>
      <button
        type="button"
        className={styles.pinnedMain}
        onClick={() => {
          onOpen(pin.messageId);
          if (total > 1) step(1);
        }}
      >
        {pin.message.senderAvatarUrl ? (
          <AvatarWithFallback
            src={resolvePublicAvatarUrl(pin.message.senderAvatarUrl)}
            initials={getInitials(pin.message.senderName || "U")}
            colorSeed={pin.message.senderId}
            width={28}
            height={28}
            imageClassName={styles.pinnedAvatarImg}
            fallbackClassName={styles.pinnedAvatarFallback}
            fallbackTag="span"
            fallbackTint="onError"
          />
        ) : (
          <span className={styles.pinnedIcon} aria-hidden>
            <Pin size={15} />
          </span>
        )}
        <span className={styles.pinnedText}>
          <span className={styles.pinnedAuthor}>{pin.message.senderName}</span>
          <span className={styles.pinnedPreview}>{preview}</span>
        </span>
      </button>
      {total > 1 ? (
        <span className={styles.pinnedNav}>
          <button type="button" className={styles.pinnedArrow} onClick={() => step(-1)} aria-label={t("pinPrev")}>
            <ChevronLeft size={16} />
          </button>
          <span className={styles.pinnedCounter}>{t("pinCounter", { index: index + 1, total })}</span>
          <button type="button" className={styles.pinnedArrow} onClick={() => step(1)} aria-label={t("pinNext")}>
            <ChevronRight size={16} />
          </button>
        </span>
      ) : null}
    </div>
  );
}

export default memo(PinnedBar);
