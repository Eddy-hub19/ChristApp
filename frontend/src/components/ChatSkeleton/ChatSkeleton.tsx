"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buildSkeletonLayout, skeletonCountForHeight } from "./skeletonLayout";
import styles from "./ChatSkeleton.module.scss";

type ChatSkeletonProps = {
  /** Скелетон лише займає місце, поки `visible` не стане true, — тоді м'яко проявляється (fade). */
  visible: boolean;
};

/** Скелетон списку повідомлень: прижатий до низу, форма й відступи як у справжніх пузирів. */
export default function ChatSkeleton({ visible }: ChatSkeletonProps) {
  const t = useTranslations("chat");
  const rootRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(() => skeletonCountForHeight(0));

  // Кількість елементів — за фактичною висотою контейнера, щоб на високих екранах зверху не лишалось порожнечі.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const update = () => setCount(skeletonCountForHeight(node.clientHeight));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const items = useMemo(() => buildSkeletonLayout(count), [count]);

  return (
    <div
      ref={rootRef}
      className={`${styles.skeleton} ${visible ? styles.skeletonVisible : ""}`}
      role="status"
      aria-busy="true"
      aria-label={t("loadingMessages")}
    >
      <div className={styles.list} aria-hidden>
        {items.map((item, index) => (
          <div
            key={index}
            className={`${styles.row} ${item.side === "in" ? styles.rowIn : styles.rowOut} ${item.grouped ? styles.rowGrouped : ""}`}
          >
            {item.side === "in" ? (
              <span className={`${styles.avatar} ${item.showAvatar ? "" : styles.avatarHidden}`} />
            ) : null}
            <span className={`${styles.bubble} ${item.side === "in" ? styles.bubbleIn : styles.bubbleOut}`}>
              {item.lines.map((width, lineIndex) => (
                <span key={lineIndex} className={styles.line} style={{ width: `${width}%` }} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
