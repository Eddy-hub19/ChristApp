import { useTranslations } from "next-intl";
import { buildSkeletonLayout } from "./skeletonLayout";
import styles from "./ChatSkeleton.module.scss";

const ITEMS = buildSkeletonLayout();

type ChatSkeletonProps = {
  /** Скелетон лише займає місце, поки `visible` не стане true, — тоді м'яко проявляється (fade). */
  visible: boolean;
};

/** Скелетон списку повідомлень: прижатий до низу, форма й відступи як у справжніх пузирів. */
export default function ChatSkeleton({ visible }: ChatSkeletonProps) {
  const t = useTranslations("chat");

  return (
    <div
      className={`${styles.skeleton} ${visible ? styles.skeletonVisible : ""}`}
      role="status"
      aria-busy="true"
      aria-label={t("loadingMessages")}
    >
      <div className={styles.list} aria-hidden>
        {ITEMS.map((item, index) => (
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
