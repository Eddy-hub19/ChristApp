import styles from "./Movies.module.scss";

export default function MovieCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden>
      <span className={`${styles.poster} ${styles.skeleton}`} />
      <span className={`${styles.skeleton} ${styles.skelLine}`} />
      <span className={`${styles.skeleton} ${styles.skelLine} ${styles.skelShort}`} />
    </div>
  );
}
