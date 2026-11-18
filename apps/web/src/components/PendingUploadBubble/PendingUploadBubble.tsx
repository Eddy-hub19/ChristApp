"use client";

import { memo } from "react";
import { Mic, RotateCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PendingUpload } from "@/hooks/useChatUploads";
import { fileIconEmoji, formatBytes, truncateMiddle } from "@/lib/chatMedia";
import bubbleStyles from "@/components/MessageBubble/MessageBubble.module.scss";
import styles from "./PendingUploadBubble.module.scss";

type Props = {
  item: PendingUpload;
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
};

function formatDuration(seconds: number | undefined): string {
  const safe = seconds && seconds > 0 ? Math.round(seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function PendingUploadBubble({ item, onCancel, onRetry }: Props) {
  const t = useTranslations("chat");
  const isError = item.status === "error";
  const percent = Math.round(item.progress * 100);

  const isVoice = item.kind === "voice";
  const errorLabel = (() => {
    // Для голосових відхилення сервера (400) — не «непідтримуваний тип», а загальний збій.
    if (isVoice && (item.errorCode === "unsupported" || item.errorCode === "server")) {
      return t("uploadErrVoice");
    }
    switch (item.errorCode) {
      case "offline":
        return t("uploadErrOffline");
      case "timeout":
        return t("uploadErrTimeout");
      case "tooLarge":
        return t("uploadErrTooLarge");
      case "unsupported":
        return t("uploadErrUnsupported");
      case "auth":
        return t("uploadErrAuth");
      default:
        return t("uploadErrServer");
    }
  })();
  // Повтор не допоможе, якщо файл відхилено: лишаємо лише "прибрати".
  const canRetry =
    item.errorCode !== "tooLarge" && (isVoice || item.errorCode !== "unsupported");

  return (
    <article
      className={`${bubbleStyles.bubble} ${bubbleStyles.myBubble} ${styles.pending} ${isError ? styles.pendingError : ""}`}
      aria-live="polite"
    >
      {item.kind === "image" && item.previewUrl ? (
        <div
          className={styles.imageBox}
          style={
            item.width && item.height
              ? { aspectRatio: `${item.width} / ${item.height}` }
              : { aspectRatio: "4 / 3" }
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.previewUrl} alt="" className={styles.imagePreview} />
          {!isError ? <div className={styles.imageShade} /> : null}
        </div>
      ) : item.kind === "voice" ? (
        <div className={styles.rowInfo}>
          <span className={styles.icon} aria-hidden>
            <Mic size={18} />
          </span>
          <span className={styles.name}>
            {t("voiceLabel")} {formatDuration(item.voiceDuration)}
          </span>
        </div>
      ) : (
        <div className={styles.rowInfo}>
          <span className={styles.icon} aria-hidden>
            {fileIconEmoji(item.fileName)}
          </span>
          <span className={styles.nameBlock}>
            <span className={styles.name}>{truncateMiddle(item.fileName)}</span>
            <span className={styles.size}>{formatBytes(item.fileSize)}</span>
          </span>
        </div>
      )}

      {isError ? (
        <div className={styles.errorRow}>
          <span className={styles.errorText}>{errorLabel}</span>
          <span className={styles.actions}>
            {canRetry ? (
              <button type="button" className={styles.retry} onClick={() => onRetry(item.localId)}>
                <RotateCw size={14} aria-hidden /> {t("uploadRetry")}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => onCancel(item.localId)}
              aria-label={t("uploadDismiss")}
              title={t("uploadDismiss")}
            >
              <X size={16} />
            </button>
          </span>
        </div>
      ) : (
        <div className={styles.progressRow}>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className={`${styles.progressFill} ${item.status === "preparing" ? styles.progressIndeterminate : ""}`}
              style={item.status === "uploading" ? { width: `${percent}%` } : undefined}
            />
          </div>
          <span className={styles.percent}>
            {item.status === "preparing" ? t("uploadPreparing") : `${percent}%`}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onCancel(item.localId)}
            aria-label={t("uploadCancel")}
            title={t("uploadCancel")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </article>
  );
}

export default memo(PendingUploadBubble);
