"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Share2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { downloadUrl } from "@/lib/chatMedia";
import styles from "./ImageViewer.module.scss";

export type ViewerImage = {
  id: string;
  src: string;
  caption?: string;
  fileName: string;
};

type Props = {
  images: ViewerImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 300;
const CLOSE_DRAG_PX = 110;
const SWIPE_PX = 70;

type Point = { x: number; y: number };

/** Повноекранний перегляд фото чату: щипок і подвійний тап — зум, свайп вниз — закрити, вліво/вправо — інше фото. */
export default function ImageViewer({ images, index, onIndexChange, onClose }: Props) {
  const t = useTranslations("chat");
  const image = images[index];

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef({
    startDist: 0,
    startScale: 1,
    startOffset: { x: 0, y: 0 } as Point,
    startPoint: { x: 0, y: 0 } as Point,
    moved: false,
    lastTapAt: 0,
  });

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= images.length) return;
      reset();
      onIndexChange(next);
    },
    [images.length, index, onIndexChange, reset],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [go, onClose]);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    g.moved = false;
    if (pointers.current.size === 2) {
      g.startDist = dist();
      g.startScale = scale;
      g.startOffset = offset;
    } else {
      g.startPoint = { x: event.clientX, y: event.clientY };
      g.startOffset = offset;
      setDragging(true);
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;

    if (pointers.current.size >= 2) {
      g.moved = true;
      const next = Math.min(MAX_SCALE, Math.max(1, (g.startScale * dist()) / g.startDist));
      setScale(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return;
    }

    const dx = event.clientX - g.startPoint.x;
    const dy = event.clientY - g.startPoint.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (scale > 1) {
      setOffset({ x: g.startOffset.x + dx, y: g.startOffset.y + dy });
    } else {
      setDrag({ x: dx, y: dy });
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // Після щипка залишився один палець — продовжуємо як перетягування.
      const [rest] = [...pointers.current.values()];
      g.startPoint = rest;
      g.startOffset = offset;
      return;
    }
    setDragging(false);

    if (scale === 1) {
      if (g.moved) {
        if (drag.y > CLOSE_DRAG_PX && Math.abs(drag.y) > Math.abs(drag.x)) {
          onClose();
          return;
        }
        if (Math.abs(drag.x) > SWIPE_PX && Math.abs(drag.x) > Math.abs(drag.y)) {
          setDrag({ x: 0, y: 0 });
          go(drag.x < 0 ? 1 : -1);
          return;
        }
        setDrag({ x: 0, y: 0 });
        return;
      }
      // Тап: подвійний — зум, одинарний на фоні нічого не робить.
      const now = Date.now();
      if (now - g.lastTapAt < DOUBLE_TAP_MS) {
        g.lastTapAt = 0;
        setScale(2.5);
      } else {
        g.lastTapAt = now;
      }
    } else if (!g.moved) {
      const now = Date.now();
      if (now - g.lastTapAt < DOUBLE_TAP_MS) {
        g.lastTapAt = 0;
        reset();
      } else {
        g.lastTapAt = now;
      }
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    const next = Math.min(MAX_SCALE, Math.max(1, scale - event.deltaY * 0.002));
    setScale(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
  };

  const share = async () => {
    if (!image) return;
    try {
      const response = await fetch(image.src);
      const blob = await response.blob();
      const file = new File([blob], image.fileName, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      // CORS/не підтримується — діляться посиланням нижче
    }
    try {
      if (navigator.share) {
        await navigator.share({ url: image.src });
      } else {
        await navigator.clipboard?.writeText(image.src);
      }
    } catch {
      // користувач закрив діалог
    }
  };

  if (!image || typeof document === "undefined") return null;

  const backdropOpacity = scale > 1 ? 1 : Math.max(0.35, 1 - Math.abs(drag.y) / 500);

  return createPortal(
    <div
      className={styles.overlay}
      style={{ background: `rgba(0,0,0,${0.92 * backdropOpacity})` }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.topBar}>
        <span className={styles.counter}>
          {images.length > 1 ? `${index + 1} / ${images.length}` : ""}
        </span>
        <div className={styles.actions}>
          <a
            className={styles.iconBtn}
            href={downloadUrl(image.src, image.fileName)}
            download={image.fileName}
            aria-label={t("viewerSave")}
            title={t("viewerSave")}
          >
            <Download size={22} />
          </a>
          <button type="button" className={styles.iconBtn} onClick={() => void share()} aria-label={t("viewerShare")} title={t("viewerShare")}>
            <Share2 size={22} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={t("viewerClose")} title={t("viewerClose")}>
            <X size={24} />
          </button>
        </div>
      </div>

      <div
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- зовнішній Cloudinary URL */}
        <img
          key={image.id}
          src={image.src}
          alt=""
          className={styles.image}
          draggable={false}
          style={{
            transform: `translate3d(${offset.x + drag.x}px, ${offset.y + drag.y}px, 0) scale(${scale})`,
            transition: dragging ? "none" : "transform 180ms ease",
          }}
        />
      </div>

      {images.length > 1 && index > 0 ? (
        <button type="button" className={`${styles.nav} ${styles.navPrev}`} onClick={() => go(-1)} aria-label={t("viewerPrev")}>
          <ChevronLeft size={28} />
        </button>
      ) : null}
      {images.length > 1 && index < images.length - 1 ? (
        <button type="button" className={`${styles.nav} ${styles.navNext}`} onClick={() => go(1)} aria-label={t("viewerNext")}>
          <ChevronRight size={28} />
        </button>
      ) : null}

      {image.caption ? <p className={styles.caption}>{image.caption}</p> : null}
    </div>,
    document.body,
  );
}
