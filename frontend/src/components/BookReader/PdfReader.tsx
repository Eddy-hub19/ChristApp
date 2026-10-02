"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { loadPdfJs } from "@/lib/book/pdfjs";
import { readBookPosition, writeBookPosition } from "@/lib/book/bookStore";
import styles from "./BookReader.module.scss";

type PDFDocumentProxy = Awaited<
  ReturnType<Awaited<ReturnType<typeof loadPdfJs>>["getDocument"]>["promise"]
>;

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const PAGE_GAP = 10;
const PAGE_PADDING = 8;
/** На десктопі сторінка не розтягується на весь екран. */
const MAX_PAGE_WIDTH = 900;
/** Верхня межа розміру canvas у пікселях, щоб Safari не впирався в ліміт памʼяті на великому зумі. */
const MAX_CANVAS_PIXELS = 12_000_000;
const SAVE_DEBOUNCE_MS = 400;
const PULL_CLOSE_PX = 110;

type PdfPageProps = {
  doc: PDFDocumentProxy;
  index: number;
  width: number;
  defaultAspect: number;
  scrollRoot: HTMLElement | null;
};

/** Одна сторінка: малюється, лише коли близько до екрана, і звільняє canvas, коли відʼїхала. */
const PdfPage = memo(function PdfPage({ doc, index, width, defaultAspect, scrollRoot }: PdfPageProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [aspect, setAspect] = useState(defaultAspect);

  useEffect(() => {
    const node = holderRef.current;
    if (!node || !scrollRoot) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root: scrollRoot, rootMargin: "120% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !canvas || width <= 0) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let pageProxy: { cleanup: () => void } | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(index);
        pageProxy = page;
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        const cssScale = width / base.width;
        let outputScale = Math.min(window.devicePixelRatio || 1, 2.5);
        const pixels = base.width * cssScale * outputScale * base.height * cssScale * outputScale;
        if (pixels > MAX_CANVAS_PIXELS) outputScale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        const viewport = page.getViewport({ scale: cssScale * outputScale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
      } catch {
        /* RenderingCancelledException при зміні зуму/прокрутці — нормально */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      canvas.width = 0;
      canvas.height = 0;
      pageProxy?.cleanup();
    };
  }, [near, doc, index, width]);

  return (
    <div
      ref={holderRef}
      className={styles.pdfPage}
      data-page={index}
      style={{ width, height: Math.round(width * aspect) }}
    >
      <canvas ref={canvasRef} width={0} height={0} className={styles.pdfCanvas} style={{ width, height: "100%" }} />
    </div>
  );
});

type Props = {
  url: string;
  onClose: () => void;
};

export default function PdfReader({ url, onClose }: Props) {
  const t = useTranslations("book");
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const anchorRef = useRef<{ cx: number; cy: number; fx: number; fy: number } | null>(null);
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [aspect, setAspect] = useState(1.414);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoomState] = useState(1);
  const [page, setPage] = useState(1);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState("");

  const setZoom = useCallback((value: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
    zoomRef.current = next;
    setZoomState(next);
  }, []);

  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollEl(node);
  }, []);

  // Завантаження документа.
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const task = pdfjs.getDocument({
          url,
          rangeChunkSize: 131072,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        });
        destroy = () => void task.destroy();
        const loaded = await task.promise;
        if (cancelled) return;
        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        setAspect(viewport.height / viewport.width);
        setDoc(loaded);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  // Ширина контейнера.
  useEffect(() => {
    if (!scrollEl) return;
    const update = () => setContainerWidth(scrollEl.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  const pageWidth = Math.max(0, Math.floor(Math.min(containerWidth - PAGE_PADDING * 2, MAX_PAGE_WIDTH) * zoom));
  const total = doc?.numPages ?? 0;

  const pageNodes = useCallback(
    () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>("[data-page]") ?? []),
    [],
  );

  const scrollToPage = useCallback(
    (target: number, offset = 0) => {
      const el = scrollRef.current;
      const node = pageNodes()[target - 1];
      if (!el || !node) return;
      el.scrollTop = node.offsetTop + offset * node.offsetHeight - PAGE_PADDING;
    },
    [pageNodes],
  );

  // Відновлення місця зупинки: один раз, коли сторінки вже в DOM.
  useLayoutEffect(() => {
    if (!doc || restoredRef.current || pageWidth <= 0) return;
    restoredRef.current = true;
    const saved = readBookPosition(url);
    if (saved?.page && saved.page > 1) {
      scrollToPage(Math.min(saved.page, doc.numPages), saved.offset ?? 0);
    }
  }, [doc, pageWidth, url, scrollToPage]);

  // Утримання точки під пальцями після зміни зуму.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    const anchor = anchorRef.current;
    if (!el || !content || !anchor) return;
    anchorRef.current = null;
    el.scrollLeft = anchor.cx * content.scrollWidth - anchor.fx;
    el.scrollTop = anchor.cy * content.scrollHeight - anchor.fy;
  }, [zoom]);

  const updateCurrentPage = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !total) return;
    const nodes = pageNodes();
    const probe = el.scrollTop + el.clientHeight * 0.33;
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].offsetTop <= probe) lo = mid;
      else hi = mid - 1;
    }
    const node = nodes[lo];
    if (!node) return;
    setPage(lo + 1);
    if (!restoredRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const offset = Math.min(1, Math.max(0, (el.scrollTop - node.offsetTop) / (node.offsetHeight || 1)));
      writeBookPosition(url, { page: lo + 1, offset });
    }, SAVE_DEBOUNCE_MS);
  }, [pageNodes, total, url]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const onScroll = useCallback(() => {
    requestAnimationFrame(updateCurrentPage);
  }, [updateCurrentPage]);

  // Щипок двома пальцями, Ctrl+колесо та свайп вниз на початку документа — закрити.
  useEffect(() => {
    const el = scrollEl;
    const content = contentRef.current;
    if (!el || !content) return;

    let pinching = false;
    let startDist = 0;
    let baseZoom = 1;
    let pendingScale = 1;
    let focal = { x: 0, y: 0 };
    let pullStart: { x: number; y: number; atTop: boolean } | null = null;

    const dist = (e: TouchEvent) =>
      Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

    const commit = (scale: number, fx: number, fy: number) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomRef.current * scale));
      anchorRef.current = {
        cx: (el.scrollLeft + fx) / content.scrollWidth,
        cy: (el.scrollTop + fy) / content.scrollHeight,
        fx,
        fy,
      };
      zoomRef.current = next;
      setZoomState(next);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true;
        pullStart = null;
        startDist = dist(e);
        baseZoom = zoomRef.current;
        pendingScale = 1;
        const rect = el.getBoundingClientRect();
        focal = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
        };
        content.style.transformOrigin = `${el.scrollLeft + focal.x}px ${el.scrollTop + focal.y}px`;
      } else if (e.touches.length === 1) {
        pullStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          atTop: el.scrollTop <= 0 && zoomRef.current <= 1.01,
        };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinching && e.touches.length === 2) {
        e.preventDefault();
        pendingScale = Math.min(ZOOM_MAX / baseZoom, Math.max(ZOOM_MIN / baseZoom, dist(e) / startDist));
        content.style.transform = `scale(${pendingScale})`;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (pinching && e.touches.length < 2) {
        pinching = false;
        content.style.transform = "";
        content.style.transformOrigin = "";
        if (Math.abs(pendingScale - 1) > 0.02) commit(pendingScale, focal.x, focal.y);
        return;
      }
      if (pullStart && e.changedTouches.length === 1 && e.touches.length === 0) {
        const dy = e.changedTouches[0].clientY - pullStart.y;
        const dx = e.changedTouches[0].clientX - pullStart.x;
        if (pullStart.atTop && el.scrollTop <= 0 && dy > PULL_CLOSE_PX && Math.abs(dx) < dy / 2) onClose();
      }
      pullStart = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      commit(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [scrollEl, doc, onClose]);

  const stepZoom = (factor: number) => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const fx = el.clientWidth / 2;
    const fy = el.clientHeight / 2;
    anchorRef.current = {
      cx: (el.scrollLeft + fx) / content.scrollWidth,
      cy: (el.scrollTop + fy) / content.scrollHeight,
      fx,
      fy,
    };
    setZoom(zoomRef.current * factor);
  };

  const submitGoto = (event: FormEvent) => {
    event.preventDefault();
    const target = Math.min(total, Math.max(1, Math.floor(Number(gotoValue))));
    if (Number.isFinite(target) && target > 0) scrollToPage(target);
    setGotoOpen(false);
  };

  return (
    <div className={styles.pdfRoot}>
      <div ref={attachScroll} className={styles.pdfScroll} onScroll={onScroll}>
        <div
          ref={contentRef}
          className={styles.pdfContent}
          style={{ width: pageWidth, gap: PAGE_GAP, padding: PAGE_PADDING }}
        >
          {doc
            ? Array.from({ length: doc.numPages }, (_, i) => (
                <PdfPage
                  key={i}
                  doc={doc}
                  index={i + 1}
                  width={pageWidth}
                  defaultAspect={aspect}
                  scrollRoot={scrollEl}
                />
              ))
            : null}
        </div>
      </div>

      {!doc && !error ? <div className={styles.stateMessage}>{t("loading")}</div> : null}
      {error ? <div className={styles.stateMessage}>{t("loadFailed")}</div> : null}

      {doc ? (
        <div className={styles.pdfBar}>
          <button type="button" className={styles.barButton} onClick={() => stepZoom(1 / 1.25)} aria-label={t("zoomOut")}>
            <Minus size={18} />
          </button>
          {gotoOpen ? (
            <form className={styles.gotoForm} onSubmit={submitGoto}>
              <input
                className={styles.gotoInput}
                type="number"
                inputMode="numeric"
                min={1}
                max={total}
                autoFocus
                value={gotoValue}
                onChange={(e) => setGotoValue(e.target.value)}
                onBlur={() => setGotoOpen(false)}
                aria-label={t("goToPage")}
                placeholder={String(page)}
              />
              <span>/ {total}</span>
            </form>
          ) : (
            <button
              type="button"
              className={styles.pageIndicator}
              onClick={() => {
                setGotoValue("");
                setGotoOpen(true);
              }}
              aria-label={t("goToPage")}
            >
              {page} / {total}
            </button>
          )}
          <button type="button" className={styles.barButton} onClick={() => stepZoom(1.25)} aria-label={t("zoomIn")}>
            <Plus size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
