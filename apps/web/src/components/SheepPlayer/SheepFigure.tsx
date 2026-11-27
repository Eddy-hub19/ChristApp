import styles from "./SheepPlayer.module.scss";

export type SheepState = "playing" | "paused" | "loading";

/**
 * Овечка-плеер. Цвета берутся из переменных темы (через SheepPlayer.module.scss), анимации только transform/opacity
 * и только пока играет или грузится; на паузе овечка спит с «z».
 */
export default function SheepFigure({ state, size = 40 }: { state: SheepState; size?: number }) {
  const awake = state !== "paused";
  return (
    <svg className={styles.figure} data-state={state} width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <g className={styles.notes}>
        <g className={styles.note}>
          <circle cx="38" cy="14" r="2.2" />
          <path d="M40 14V6.5l3 1.2" fill="none" strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <g className={`${styles.note} ${styles.noteLate}`}>
          <circle cx="5" cy="20" r="1.8" />
          <path d="M6.8 20v-6l2.4 1" fill="none" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      </g>
      <g className={styles.body}>
        <path className={styles.legs} d="M17 38v5M30 38v5" strokeWidth="3" strokeLinecap="round" fill="none" />
        <g className={styles.wool}>
          <circle cx="14" cy="26" r="7" />
          <circle cx="21" cy="19" r="8" />
          <circle cx="31" cy="20" r="7.5" />
          <circle cx="34" cy="29" r="7" />
          <circle cx="24" cy="31" r="9" />
          <circle cx="14" cy="34" r="5.5" />
        </g>
        <ellipse className={styles.face} cx="30" cy="29" rx="9.5" ry="8.5" />
        {awake ? (
          <>
            <circle className={styles.eye} cx="27" cy="27" r="1.7" />
            <circle className={styles.eye} cx="34" cy="27" r="1.7" />
            <ellipse className={styles.mouth} cx="30.5" cy="32.6" rx="1.8" ry={state === "playing" ? 1.6 : 0.9} />
          </>
        ) : (
          <>
            <path className={styles.lid} d="M25.4 27.4q1.7 1.6 3.4 0M32.2 27.4q1.7 1.6 3.4 0" fill="none" strokeWidth="1.3" strokeLinecap="round" />
            <path className={styles.lid} d="M28.6 32.6q1.8 1 3.6 0" fill="none" strokeWidth="1.1" strokeLinecap="round" />
          </>
        )}
      </g>
      {awake ? null : (
        <text className={styles.zzz} x="36" y="12" fontSize="9" fontWeight="700">
          z
        </text>
      )}
    </svg>
  );
}
