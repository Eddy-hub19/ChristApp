import styles from "./Movies.module.scss";

export default function MovieDetailsSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <div className={`${styles.playerFrame} ${styles.skeleton}`} />
      <div className={styles.details}>
        <span className={`${styles.poster} ${styles.skeleton} ${styles.detailsPoster}`} />
        <div className={styles.detailsText}>
          <span className={`${styles.skeleton} ${styles.skelTitle}`} />
          <span className={`${styles.skeleton} ${styles.skelLine}`} />
          <span className={`${styles.skeleton} ${styles.skelLine}`} />
          <span className={`${styles.skeleton} ${styles.skelLine} ${styles.skelShort}`} />
        </div>
      </div>
    </div>
  );
}
