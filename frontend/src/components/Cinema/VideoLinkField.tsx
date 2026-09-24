"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import { checkWatchVideo } from "@/lib/queries/watchRoomsQueries";
import { parseYouTubeLink, youTubeThumbnailUrl } from "@/lib/youtube";
import { formatPlaybackTime } from "@/lib/watchSync";
import styles from "./Cinema.module.scss";

export type PickedVideo = { videoId: string; startSec: number; title: string | null };

type VideoLinkFieldProps = {
  onChange: (video: PickedVideo | null) => void;
  autoFocus?: boolean;
  tone?: "app" | "hall";
};

type CheckState =
  | { kind: "idle" }
  | { kind: "invalid"; error: string }
  | { kind: "checking"; videoId: string; startSec: number }
  | { kind: "ok"; video: PickedVideo }
  | { kind: "rejected"; videoId: string; error: string };

/**
 * Поле посилання на YouTube: миттєво розбирає будь-який формат і показує прев'ю,
 * а сервер (oEmbed) підтверджує, що відео існує й дозволене для вбудовування.
 */
export default function VideoLinkField({ onChange, autoFocus, tone = "app" }: VideoLinkFieldProps) {
  const t = useTranslations("cinema");
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });

  useEffect(() => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setCheck({ kind: "idle" });
      onChange(null);
      return;
    }
    const parsed = parseYouTubeLink(trimmed);
    if (!parsed.ok) {
      setCheck({ kind: "invalid", error: t(`errors.${parsed.error}`) });
      onChange(null);
      return;
    }

    const { videoId, startSec } = parsed.value;
    setCheck({ kind: "checking", videoId, startSec });
    onChange(null);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      checkWatchVideo(videoId)
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            const video = { videoId, startSec, title: result.title };
            setCheck({ kind: "ok", video });
            onChange(video);
          } else {
            setCheck({ kind: "rejected", videoId, error: t(`errors.${result.code}`) });
          }
        })
        .catch(() => {
          if (cancelled) return;
          // Перевірка недоступна (мережа) — не блокуємо: плеєр сам покаже помилку, якщо що.
          const video = { videoId, startSec, title: null };
          setCheck({ kind: "ok", video });
          onChange(video);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // onChange навмисно не в залежностях: батьки передають інлайн-функції.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, t]);

  const previewId =
    check.kind === "checking" || check.kind === "rejected"
      ? check.videoId
      : check.kind === "ok"
        ? check.video.videoId
        : null;
  const startSec =
    check.kind === "checking" ? check.startSec : check.kind === "ok" ? check.video.startSec : 0;
  const error = check.kind === "invalid" || check.kind === "rejected" ? check.error : null;

  return (
    <div className={`${styles.field} ${tone === "hall" ? styles.fieldHall : ""}`}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {t("create.linkLabel")}
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="url"
        inputMode="url"
        autoComplete="off"
        autoFocus={autoFocus}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={t("create.linkPlaceholder")}
        aria-invalid={Boolean(error)}
        aria-describedby={`${inputId}-hint`}
      />
      <p id={`${inputId}-hint`} className={error ? styles.fieldError : styles.fieldHint} role={error ? "alert" : undefined}>
        {error ? (
          <>
            <AlertCircle size={14} aria-hidden /> {error}
          </>
        ) : (
          t("create.linkHint")
        )}
      </p>

      {previewId ? (
        <div className={`${styles.videoPreview} ${check.kind === "rejected" ? styles.videoPreviewRejected : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- прев'ю з i.ytimg.com, next/image тут зайвий */}
          <img src={youTubeThumbnailUrl(previewId, "mq")} alt="" loading="lazy" />
          <div className={styles.videoPreviewText}>
            {check.kind === "checking" ? (
              <span className={styles.muted}>
                <Loader2 size={14} className={styles.spin} aria-hidden /> {t("create.checking")}
              </span>
            ) : check.kind === "ok" ? (
              <span className={styles.videoPreviewTitle}>{check.video.title ?? previewId}</span>
            ) : null}
            {startSec > 0 && check.kind !== "rejected" ? (
              <span className={styles.muted}>
                {t("create.startsAt", { time: formatPlaybackTime(startSec) })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
