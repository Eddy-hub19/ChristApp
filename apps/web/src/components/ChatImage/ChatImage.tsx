"use client";

import { memo, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { imageBlurUrl, imageThumbUrl } from "@/lib/chatMedia";
import styles from "./ChatImage.module.scss";

type Props = {
  src: string;
  width?: number;
  height?: number;
  caption?: string;
  onOpen?: () => void;
  /** "tile" — квадратна плитка для альбому. */
  variant?: "single" | "tile";
};

const MIN_RATIO = 0.6;
const MAX_RATIO = 1.8;

/** Фото в пузирі: місце резервується за відомими розмірами, до завантаження — розмита заглушка. */
function ChatImage({ src, width, height, caption, onOpen, variant = "single" }: Props) {
  const t = useTranslations("chat");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const ratio =
    variant === "tile"
      ? 1
      : width && height
      ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height))
      : 4 / 3;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (onOpen) {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div className={styles.wrap}>
      <a
        className={`${styles.box} ${variant === "tile" ? styles.tile : ""}`}
        style={{
          aspectRatio: String(ratio),
          backgroundImage: loaded ? undefined : `url("${imageBlurUrl(src)}")`,
        }}
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        aria-label={t("viewerOpenAria")}
      >
        {!failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- зовнішній Cloudinary URL
          <img
            src={imageThumbUrl(src)}
            alt=""
            className={`${styles.img} ${loaded ? styles.imgLoaded : ""}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className={styles.broken} aria-hidden>
            🖼
          </span>
        )}
      </a>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
    </div>
  );
}

export default memo(ChatImage);
