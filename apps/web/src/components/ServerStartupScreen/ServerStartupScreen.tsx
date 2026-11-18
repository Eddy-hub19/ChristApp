"use client";

import { useTranslations } from "next-intl";
import type { ServerBootPhase } from "@/hooks/useServerStartupBoot";
import styles from "./ServerStartupScreen.module.scss";

type ServerStartupScreenProps = {
  phase: ServerBootPhase;
  elapsedSeconds: number;
  /** Є збережена сесія — після запуску одразу поведемо в чати. */
  hasStoredSession: boolean;
  canSkip: boolean;
  onSkip: () => void;
};

function formatElapsed(totalSeconds: number, secondsLabel: string): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} ${secondsLabel}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Екран запуску: сервер на безкоштовному хостингу прокидається 1–3 хвилини. */
export default function ServerStartupScreen({
  phase,
  elapsedSeconds,
  hasStoredSession,
  canSkip,
  onSkip,
}: ServerStartupScreenProps) {
  const t = useTranslations("startup");

  const title = phase === "restoring" ? t("restoringTitle") : t("startingTitle");
  const body =
    phase === "restoring"
      ? t("restoringBody")
      : hasStoredSession
        ? t("startingBodyWithSession")
        : t("startingBody");

  return (
    <section
      className={styles.screen}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={styles.card}>
        <svg
          width="88"
          height="88"
          viewBox="0 0 100 100"
          className={styles.mark}
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r="38"
            className={styles.markTrack}
            fill="none"
          />
          <circle
            cx="50"
            cy="50"
            r="38"
            className={styles.markSpinner}
            fill="none"
          />
          <path d="M50 32V68 M38 44H62" className={styles.markCross} />
        </svg>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>

        <p className={styles.timer}>
          {t("waitingFor")}{" "}
          <strong>{formatElapsed(elapsedSeconds, t("secondsShort"))}</strong>
        </p>

        <div className={styles.progressTrack} aria-hidden>
          <span className={styles.progressBar} />
        </div>

        <p className={styles.footer}>{t("autoContinue")}</p>

        {canSkip ? (
          <button type="button" className={styles.skipButton} onClick={onSkip}>
            {t("showLoginAnyway")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
