"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List, Minus, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { NavItem, Rendition } from "epubjs";
import { fetchBookFile } from "@/lib/book/shareFile";
import { readBookPosition, writeBookPosition } from "@/lib/book/bookStore";
import {
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  READER_THEMES,
  readFontSize,
  writeFontSize,
  type ReaderTheme,
} from "@/lib/book/readerTheme";
import styles from "./BookReader.module.scss";

/** Книга не може тягнути нічого зовні й виконувати код: усе, що не data:/blob:, відсікається. */
const BOOK_CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' data: blob:; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'";

const TAP_ZONE = 0.28;
const SWIPE_PX = 45;
const PULL_CLOSE_PX = 120;
const TAP_SLOP_PX = 10;

function themeRules(theme: ReaderTheme) {
  const { bg, fg } = READER_THEMES[theme];
  return {
    html: { background: `${bg} !important` },
    body: { background: `${bg} !important`, color: `${fg} !important`, "line-height": "1.6 !important" },
    "p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, blockquote": { color: `${fg} !important` },
    a: { color: `${fg} !important`, "text-decoration": "underline" },
    img: { "max-width": "100% !important", height: "auto" },
  };
}

type Props = {
  url: string;
  filename: string;
  theme: ReaderTheme;
  chromeVisible: boolean;
  onToggleChrome: () => void;
  onClose: () => void;
};

export default function EpubReader({ url, filename, theme, chromeVisible, onToggleChrome, onClose }: Props) {
  const t = useTranslations("book");
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const themeRef = useRef(theme);
  const fontRef = useRef(110);
  const chromeToggleRef = useRef(onToggleChrome);
  const closeRef = useRef(onClose);

  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [fontSize, setFontSize] = useState(110);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    chromeToggleRef.current = onToggleChrome;
    closeRef.current = onClose;
  }, [onToggleChrome, onClose]);

  useEffect(() => {
    const saved = readFontSize();
    fontRef.current = saved;
    setFontSize(saved);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      try {
        const [{ default: ePub }, file] = await Promise.all([
          import("epubjs"),
          fetchBookFile(url, filename, "epub"),
        ]);
        if (disposed) return;
        const book = ePub(await file.arrayBuffer());
        // Свій serialize-hook реєструємо ПІСЛЯ внутрішнього (підміна ресурсів на blob:), інакше той перезапише section.output.
        await book.ready;
        if (disposed) {
          book.destroy();
          return;
        }

        // Перед тим як секція піде в iframe, вшиваємо CSP: жодних скриптів і зовнішніх ресурсів.
        // epub.js ігнорує значення, що повертає hook, — результат треба писати в section.output.
        book.spine.hooks.serialize.register((_output: string, section: { output?: string }) => {
          const meta = `<meta http-equiv="Content-Security-Policy" content="${BOOK_CSP}">`;
          const html = section.output ?? "";
          section.output = /<head[^>]*>/i.test(html)
            ? html.replace(/<head[^>]*>/i, (m) => `${m}${meta}`)
            : `${meta}${html}`;
        });

        const rendition = book.renderTo(host, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        rendition.themes.register("reader", themeRules(themeRef.current));
        rendition.themes.select("reader");
        rendition.themes.fontSize(`${fontRef.current}%`);

        // iframe в paginated-режимі ширший за екран (колонки), тож позицію рахуємо в межах поточної сторінки.
        const pageRatio = (x: number) => {
          const pageWidth = host.clientWidth || 1;
          return (((x % pageWidth) + pageWidth) % pageWidth) / pageWidth;
        };

        rendition.hooks.content.register((contents: {
          document: Document;
          window: Window;
        }) => {
          const doc = contents.document;
          // Зовнішні посилання не відкриваємо: ні навігації iframe, ні нових вкладок.
          doc.addEventListener("click", (event) => {
            const anchor = (event.target as Element | null)?.closest("a");
            const href = anchor?.getAttribute("href") ?? "";
            if (/^[a-z][a-z0-9+.-]*:/i.test(href)) event.preventDefault();
          });
          // Тап по краях — листання, по центру — показати/сховати панелі; свайп — листання / закриття.
          let start: { x: number; y: number } | null = null;
          doc.addEventListener("touchstart", (event) => {
            const touch = event.touches[0];
            start = touch && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
          }, { passive: true });
          doc.addEventListener("touchend", (event) => {
            const touch = event.changedTouches[0];
            if (!start || !touch) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            const from = start;
            start = null;
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (dx < 0) void rendition.next();
              else void rendition.prev();
              return;
            }
            if (dy > PULL_CLOSE_PX && dy > Math.abs(dx) * 2) {
              closeRef.current();
              return;
            }
            if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) {
              const ratio = pageRatio(from.x);
              if (ratio < TAP_ZONE) void rendition.prev();
              else if (ratio > 1 - TAP_ZONE) void rendition.next();
              else chromeToggleRef.current();
            }
          }, { passive: true });
          // Десктоп: клік мишею по краях/центру та стрілки.
          doc.addEventListener("click", (event) => {
            if ((event as MouseEvent).detail === 0 || "ontouchstart" in contents.window) return;
            const ratio = pageRatio((event as MouseEvent).clientX);
            if (ratio < TAP_ZONE) void rendition.prev();
            else if (ratio > 1 - TAP_ZONE) void rendition.next();
            else chromeToggleRef.current();
          });
          doc.addEventListener("keydown", (event) => {
            if (event.key === "ArrowRight" || event.key === "PageDown") void rendition.next();
            if (event.key === "ArrowLeft" || event.key === "PageUp") void rendition.prev();
          });
        });

        rendition.on("relocated", (location: {
          start: { cfi: string; displayed?: { page: number; total: number } };
        }) => {
          writeBookPosition(url, { cfi: location.start.cfi });
          const displayed = location.start.displayed;
          if (displayed) setProgress(`${displayed.page} / ${displayed.total}`);
        });

        const onKey = (event: KeyboardEvent) => {
          if (event.key === "ArrowRight" || event.key === "PageDown") void rendition.next();
          if (event.key === "ArrowLeft" || event.key === "PageUp") void rendition.prev();
        };
        window.addEventListener("keydown", onKey);

        const resizeObserver = new ResizeObserver(() => {
          if (host.clientWidth > 0 && host.clientHeight > 0 && renditionRef.current === rendition) {
            try {
              rendition.resize(host.clientWidth, host.clientHeight);
            } catch {
              /* менеджер ще не стартував або вже знищений */
            }
          }
        });
        resizeObserver.observe(host);

        book.loaded.navigation.then((nav) => !disposed && setToc(nav.toc)).catch(() => undefined);

        await rendition.display(readBookPosition(url)?.cfi || undefined);
        if (!disposed) setReady(true);

        cleanup = () => {
          window.removeEventListener("keydown", onKey);
          resizeObserver.disconnect();
          rendition.destroy();
          book.destroy();
        };
        if (disposed) cleanup();
      } catch {
        if (!disposed) setError(true);
      }
    })();

    return () => {
      disposed = true;
      renditionRef.current = null;
      cleanup?.();
    };
  }, [url, filename]);

  useEffect(() => {
    themeRef.current = theme;
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.themes.register("reader", themeRules(theme));
    rendition.themes.select("reader");
  }, [theme, ready]);

  const changeFont = (delta: number) => {
    const next = Math.min(FONT_MAX, Math.max(FONT_MIN, fontSize + delta));
    fontRef.current = next;
    setFontSize(next);
    writeFontSize(next);
    renditionRef.current?.themes.fontSize(`${next}%`);
  };

  const goToc = useCallback((href: string) => {
    setTocOpen(false);
    void renditionRef.current?.display(href);
  }, []);

  const renderToc = (items: NavItem[], depth = 0) =>
    items.map((item) => (
      <div key={`${item.id}-${item.href}`}>
        <button
          type="button"
          className={styles.tocItem}
          style={{ paddingLeft: 16 + depth * 16 }}
          onClick={() => goToc(item.href)}
        >
          {item.label.trim()}
        </button>
        {item.subitems?.length ? renderToc(item.subitems, depth + 1) : null}
      </div>
    ));

  return (
    <div className={styles.epubRoot}>
      <div ref={hostRef} className={`${styles.epubHost} ${chromeVisible ? styles.epubHostWithBar : ""}`} />
      {!ready && !error ? <div className={styles.stateMessage}>{t("loading")}</div> : null}
      {error ? <div className={styles.stateMessage}>{t("loadFailed")}</div> : null}

      {ready && chromeVisible ? (
        <div className={styles.epubBar}>
          <button type="button" className={styles.barButton} onClick={() => setTocOpen(true)} aria-label={t("contents")}>
            <List size={18} />
          </button>
          <button type="button" className={styles.barButton} onClick={() => void renditionRef.current?.prev()} aria-label={t("prevPage")}>
            <ChevronLeft size={18} />
          </button>
          <span className={styles.pageIndicator}>{progress}</span>
          <button type="button" className={styles.barButton} onClick={() => void renditionRef.current?.next()} aria-label={t("nextPage")}>
            <ChevronRight size={18} />
          </button>
          <button type="button" className={styles.barButton} onClick={() => changeFont(-FONT_STEP)} disabled={fontSize <= FONT_MIN} aria-label={t("fontSmaller")}>
            <Minus size={18} />
          </button>
          <span className={styles.fontLabel} aria-hidden>
            Aa
          </span>
          <button type="button" className={styles.barButton} onClick={() => changeFont(FONT_STEP)} disabled={fontSize >= FONT_MAX} aria-label={t("fontLarger")}>
            <Plus size={18} />
          </button>
        </div>
      ) : null}

      {tocOpen ? (
        <div className={styles.tocLayer}>
          <button type="button" className={styles.tocBackdrop} aria-label={t("close")} onClick={() => setTocOpen(false)} />
          <aside className={styles.tocPanel} aria-label={t("contents")}>
            <div className={styles.tocHeader}>
              <strong>{t("contents")}</strong>
              <button type="button" className={styles.barButton} onClick={() => setTocOpen(false)} aria-label={t("close")}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.tocList}>
              {toc.length ? renderToc(toc) : <p className={styles.tocEmpty}>{t("noContents")}</p>}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
