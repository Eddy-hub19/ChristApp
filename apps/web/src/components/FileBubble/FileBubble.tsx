"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import {
  downloadUrl,
  fileExtension,
  fileIconEmoji,
  formatBytes,
  truncateMiddle,
} from "@/lib/chatMedia";
import styles from "./FileBubble.module.scss";

type Props = {
  href: string;
  fileName: string;
  fileSize?: number;
};

/** Файл у пузирі: іконка за типом, ім'я з багатокрапкою посередині (розширення видно), розмір; тап — завантаження. */
function FileBubble({ href, fileName, fileSize }: Props) {
  const t = useTranslations("chat");
  const ext = fileExtension(fileName).toUpperCase();
  const meta = [ext, formatBytes(fileSize)].filter(Boolean).join(" · ");
  return (
    <a
      className={styles.file}
      href={downloadUrl(href, fileName)}
      download={fileName}
      rel="noopener noreferrer"
      title={fileName}
      aria-label={t("fileDownloadAria", { name: fileName })}
      onClick={(event) => event.stopPropagation()}
      data-bubble-control
    >
      <span className={styles.icon} aria-hidden>
        {fileIconEmoji(fileName)}
      </span>
      <span className={styles.info}>
        <span className={styles.name}>{truncateMiddle(fileName)}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
    </a>
  );
}

export default memo(FileBubble);
