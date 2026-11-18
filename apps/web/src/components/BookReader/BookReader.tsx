"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Moon, Share, Sun, Coffee, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BookFormat } from "@/lib/book/bookFile";
import { canShareFiles, fetchBookFile, shareOrDownloadBook } from "@/lib/book/shareFile";
import {
  READER_THEMES,
  THEME_ORDER,
  readTheme,
  writeTheme,
  type ReaderTheme,
} from "@/lib/book/readerTheme";
import PdfReader from "./PdfReader";
import EpubReader from "./EpubReader";
import styles from "./BookReader.module.scss";

type Props = {
  url: string;
  filename: string;
  format: BookFormat;
  title: string;
  onClose: () => void;
};

const THEME_ICON = { light: Sun, sepia: Coffee, dark: Moon } as const;
const HEADER_PULL_CLOSE_PX = 80;

export default function BookReader({ url, filename, format, title, onClose }: Props) {
  const t = useTranslations("book");
  const [theme, setTheme] = useState<ReaderTheme>("light");
  const [chromeVisible, setChromeVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const pullRef = useRef<number | null>(null);

  useEffect(() => {
    setTheme(readTheme());
    setCanShare(canShareFiles());
  }, []);

  // Фон під читалкою не прокручується; Esc закриває.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setTheme(next);
    writeTheme(next);
  };

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fetchBookFile(url, filename, format);
      const result = await shareOrDownloadBook(file);
      if (result === "blocked") setToast(t("tapAgain"));
    } catch {
      setToast(t("shareFailed"));
    } finally {
      setBusy(false);
    }
  }, [busy, url, filename, format, t]);

  const ThemeIcon = THEME_ICON[theme];
  const { bg, fg, muted } = READER_THEMES[theme];
  const showHeader = format === "pdf" || chromeVisible;

  return createPortal(
    <div
      className={styles.shell}
      data-app-overlay
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ ["--br-bg" as string]: bg, ["--br-fg" as string]: fg, ["--br-muted" as string]: muted }}
    >
      {showHeader ? (
        <header
          className={styles.header}
          onTouchStart={(e) => {
            pullRef.current = e.touches.length === 1 ? e.touches[0].clientY : null;
          }}
          onTouchEnd={(e) => {
            const start = pullRef.current;
            pullRef.current = null;
            if (start !== null && e.changedTouches[0].clientY - start > HEADER_PULL_CLOSE_PX) onClose();
          }}
        >
          <button type="button" className={styles.headerButton} onClick={onClose} aria-label={t("close")}>
            <X size={20} />
          </button>
          <h2 className={styles.headerTitle}>{title}</h2>
          <button type="button" className={styles.headerButton} onClick={cycleTheme} aria-label={t("theme")}>
            <ThemeIcon size={19} />
          </button>
          <button
            type="button"
            className={styles.headerButton}
            onClick={() => void share()}
            disabled={busy}
            aria-label={canShare ? t("openIn") : t("download")}
            title={canShare ? t("openIn") : t("download")}
          >
            {busy ? <Loader2 size={19} className={styles.spin} /> : canShare ? <Share size={19} /> : <Download size={19} />}
          </button>
        </header>
      ) : null}

      <div className={styles.body}>
        {format === "pdf" ? (
          <PdfReader url={url} onClose={onClose} />
        ) : (
          <EpubReader
            url={url}
            filename={filename}
            theme={theme}
            chromeVisible={chromeVisible}
            onToggleChrome={() => setChromeVisible((v) => !v)}
            onClose={onClose}
          />
        )}
      </div>

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>,
    document.body,
  );
}
