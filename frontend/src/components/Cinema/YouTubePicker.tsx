"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, X } from "lucide-react";
import {
  WatchApiError,
  fetchPopularWatchVideos,
  searchWatchVideos,
  type VideoSearchItem,
} from "@/lib/queries/watchRoomsQueries";
import { formatPlaybackTime } from "@/lib/watchSync";
import Sheet from "./Sheet";
import styles from "./Cinema.module.scss";

const SEARCH_DEBOUNCE_MS = 450;

export type YouTubePickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (video: { videoId: string; title: string }) => void;
  /** Хост одразу вмикає відео всім; учасник лише пропонує його хосту. */
  mode: "select" | "suggest";
  tone?: "app" | "hall";
};

/**
 * Міні-YouTube: пошук і популярні відео замість вставки посилання вручну.
 * Ключ YouTube Data API лишається на сервері (backend/src/watch-party/youtube-search.service.ts) —
 * цей компонент лише звертається до GET /watch-rooms/video-search і /video-popular.
 */
export default function YouTubePicker({ open, onClose, onPick, mode, tone = "app" }: YouTubePickerProps) {
  const t = useTranslations("cinema.picker");
  const tErr = useTranslations("cinema.errors");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VideoSearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VideoSearchItem | null>(null);

  // Шторку закрили — наступного відкриття починаємо чисто (знову покажемо популярні).
  useEffect(() => {
    if (!open) {
      setQuery("");
      setItems(null);
      setError(null);
      setSelected(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    let cancelled = false;

    const handleError = (err: unknown) => {
      if (cancelled) return;
      const code = err instanceof WatchApiError ? err.code : undefined;
      setError(
        code === "YOUTUBE_NOT_CONFIGURED" ||
          code === "YOUTUBE_UNAVAILABLE" ||
          code === "YOUTUBE_QUOTA_EXCEEDED"
          ? tErr(code)
          : t("error"),
      );
    };

    setError(null);
    setLoading(true);

    // Порожній запит — популярні відео, без затримки. Непорожній — пошук, з debounce:
    // він дорогий по квоті YouTube API, тож не шукаємо на кожну літеру.
    if (!trimmed) {
      fetchPopularWatchVideos()
        .then((res) => !cancelled && setItems(res))
        .catch(handleError)
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      searchWatchVideos(trimmed)
        .then((res) => !cancelled && setItems(res))
        .catch(handleError)
        .finally(() => !cancelled && setLoading(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, t, tErr]);

  const confirm = () => {
    if (!selected) return;
    onPick({ videoId: selected.videoId, title: selected.title || selected.videoId });
    onClose();
  };

  return (
    <Sheet
      open={open}
      title={t("title")}
      onClose={onClose}
      tone={tone}
      footer={
        selected ? (
          <div className={styles.sheetActions}>
            <button type="button" className={styles.ghostButton} onClick={() => setSelected(null)}>
              {t("back")}
            </button>
            <button type="button" className={styles.primaryButton} onClick={confirm}>
              {mode === "select" ? t("watchTogether") : t("suggest")}
            </button>
          </div>
        ) : undefined
      }
    >
      {selected ? (
        <div className={styles.pickerPreview}>
          {selected.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- прев'ю з i.ytimg.com
            <img src={selected.thumbnailUrl} alt="" className={styles.pickerPreviewImg} />
          ) : null}
          <h3 className={styles.pickerPreviewTitle}>{selected.title}</h3>
          <p className={styles.muted}>{selected.channelTitle}</p>
        </div>
      ) : (
        <>
          <div className={styles.pickerSearchRow}>
            <Search size={16} aria-hidden className={styles.pickerSearchIcon} />
            <input
              className={styles.pickerSearchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className={styles.pickerClearButton}
                onClick={() => setQuery("")}
                aria-label={t("clear")}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {!query.trim() && !loading && !error ? (
            <p className={styles.pickerSectionLabel}>{t("popular")}</p>
          ) : null}

          {loading ? (
            <div className={styles.pickerLoading}>
              <Loader2 size={22} className={styles.spin} aria-hidden />
            </div>
          ) : error ? (
            <p className={styles.fieldError}>{error}</p>
          ) : items && items.length === 0 ? (
            <p className={styles.muted}>{t("empty")}</p>
          ) : (
            <div className={styles.pickerGrid}>
              {(items ?? []).map((item) => (
                <button
                  key={item.videoId}
                  type="button"
                  className={styles.pickerCard}
                  onClick={() => setSelected(item)}
                >
                  <span className={styles.pickerThumbWrap}>
                    {item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- прев'ю з i.ytimg.com
                      <img src={item.thumbnailUrl} alt="" loading="lazy" />
                    ) : null}
                    {item.isShort ? (
                      <span className={styles.pickerBadge}>Shorts</span>
                    ) : item.durationSec ? (
                      <span className={styles.pickerBadge}>{formatPlaybackTime(item.durationSec)}</span>
                    ) : null}
                  </span>
                  <span className={styles.pickerCardTitle}>{item.title}</span>
                  <span className={styles.pickerCardChannel}>{item.channelTitle}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
