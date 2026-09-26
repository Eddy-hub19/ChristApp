"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { resolveWatchVideoLink } from "@/lib/queries/watchRoomsQueries";
import { parseYouTubeLink, youTubeThumbnailUrl } from "@/lib/youtube";
import { formatPlaybackTime } from "@/lib/watchSync";
import type { WatchProvider } from "@/lib/watchSync";
import YouTubePicker from "./YouTubePicker";
import styles from "./Cinema.module.scss";

export type PickedVideo = {
  provider: WatchProvider;
  /** YOUTUBE/VIMEO/DAILYMOTION — id відео. FILE/IFRAME/MANUAL — повний URL. */
  videoId: string;
  startSec: number;
  title: string | null;
  thumbnailUrl: string | null;
  mixedContent: boolean;
};

type VideoLinkFieldProps = {
  onChange: (video: PickedVideo | null) => void;
  autoFocus?: boolean;
  tone?: "app" | "hall";
};

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; video: PickedVideo }
  | { kind: "rejected"; error: string };

const RESOLVE_DEBOUNCE_MS = 450;
const KNOWN_ERROR_CODES = new Set([
  "NOT_EMBEDDABLE",
  "NOT_FOUND",
  "INVALID_VIDEO",
  "UNSAFE_URL",
  "YOUTUBE_NOT_CONFIGURED",
  "YOUTUBE_UNAVAILABLE",
  "YOUTUBE_QUOTA_EXCEEDED",
]);

/**
 * Поле посилання на відео: сервер сам визначає провайдера (YouTube/Vimeo/Dailymotion/файл/
 * інший сайт — GET /watch-rooms/resolve-video, єдине SSRF-захищене місце мережевого виклику за
 * довільним URL від користувача) і повертає готове прев'ю. Таймкод (`?t=90`) підтримуємо лише
 * для YouTube — інші провайдери не мають єдиного стандарту глибокого посилання на позицію.
 */
export default function VideoLinkField({ onChange, autoFocus, tone = "app" }: VideoLinkFieldProps) {
  const t = useTranslations("cinema");
  const tErr = useTranslations("cinema.errors");
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setCheck({ kind: "idle" });
      onChange(null);
      return;
    }
    setCheck({ kind: "checking" });
    onChange(null);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      resolveWatchVideoLink(trimmed)
        .then((result) => {
          if (cancelled) return;
          if (!result.ok) {
            const message = KNOWN_ERROR_CODES.has(result.code)
              ? tErr(result.code as Parameters<typeof tErr>[0])
              : t("errors.generic");
            setCheck({ kind: "rejected", error: message });
            return;
          }
          const startSec =
            result.provider === "YOUTUBE" ? parseYoutubeStartSec(trimmed) : 0;
          const video: PickedVideo = {
            provider: result.provider,
            videoId: result.videoId,
            startSec,
            title: result.title,
            thumbnailUrl: result.thumbnailUrl,
            mixedContent: result.mixedContent,
          };
          setCheck({ kind: "ok", video });
          onChange(video);
        })
        .catch(() => {
          if (cancelled) return;
          setCheck({ kind: "rejected", error: t("errors.generic") });
        });
    }, RESOLVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // onChange навмисно не в залежностях: батьки передають інлайн-функції.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, t, tErr]);

  const error = check.kind === "rejected" ? check.error : null;
  const previewThumb =
    check.kind === "ok"
      ? check.video.thumbnailUrl ??
        (check.video.provider === "YOUTUBE" ? youTubeThumbnailUrl(check.video.videoId, "mq") : null)
      : null;

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

      <button
        type="button"
        className={styles.browseYoutubeButton}
        onClick={() => setPickerOpen(true)}
      >
        <Search size={14} aria-hidden /> {t("create.browseYoutube")}
      </button>

      <YouTubePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="select"
        tone={tone}
        onPick={(video) => {
          // Ведемо через той самий raw-пайплайн: сервер уже кешував цей videoId під час пошуку,
          // тож повторний виклик resolve-video тут практично безкоштовний.
          setRaw(`https://www.youtube.com/watch?v=${video.videoId}`);
        }}
      />

      {check.kind === "checking" ? (
        <div className={styles.videoPreview}>
          <span className={styles.muted}>
            <Loader2 size={14} className={styles.spin} aria-hidden /> {t("create.checking")}
          </span>
        </div>
      ) : check.kind === "ok" ? (
        <div className={styles.videoPreview}>
          {previewThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- прев'ю із зовнішнього хоста
            <img src={previewThumb} alt="" loading="lazy" />
          ) : (
            <span className={styles.videoPreviewNoThumb} aria-hidden>
              {check.video.provider}
            </span>
          )}
          <div className={styles.videoPreviewText}>
            <span className={styles.videoPreviewTitle}>{check.video.title ?? check.video.videoId}</span>
            {check.video.provider !== "YOUTUBE" && check.video.provider !== "VIMEO" && check.video.provider !== "DAILYMOTION" ? (
              <span className={styles.muted}>{t(`create.provider${capitalize(check.video.provider)}`)}</span>
            ) : null}
            {check.video.startSec > 0 ? (
              <span className={styles.muted}>
                {t("create.startsAt", { time: formatPlaybackTime(check.video.startSec) })}
              </span>
            ) : null}
            {check.video.mixedContent ? (
              <span className={styles.fieldWarning}>
                <AlertCircle size={13} aria-hidden /> {t("create.mixedContentWarning")}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseYoutubeStartSec(raw: string): number {
  const parsed = parseYouTubeLink(raw);
  return parsed.ok ? parsed.value.startSec : 0;
}

function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
