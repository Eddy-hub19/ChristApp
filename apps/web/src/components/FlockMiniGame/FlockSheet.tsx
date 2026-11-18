"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { playFlockSound } from "./flockSound";
import styles from "./FlockInfo.module.scss";

const CLOSE_DRAG_PX = 90;

type Props = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  /** Между заголовком и крестиком (например, баланс рубинов). */
  headExtra?: ReactNode;
  /** Под строкой заголовка (например, вкладки). */
  headBottom?: (titleId: string) => ReactNode;
  bodyProps?: (titleId: string) => React.HTMLAttributes<HTMLDivElement>;
  testId?: string;
  children: (titleId: string) => ReactNode;
};

/**
 * Шторка (телефон) / окно (десктоп) поверх лобби «Отари»: закрывается крестиком, тапом по фону, Esc и свайпом вниз за шапку.
 * Общая оболочка окон «Про гру» и «Артефакти».
 */
export default function FlockSheet({ title, closeLabel, onClose, headExtra, headBottom, bodyProps, testId, children }: Props) {
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<{ startY: number } | null>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // свайп вниз за шапку шторки: слушатели на window, чтобы не отбирать клики у кнопок шапки (без pointer capture)
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragRef.current = { startY: e.clientY };
      const move = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        setDragY(Math.max(0, ev.clientY - dragRef.current.startY));
      };
      const end = (ev: PointerEvent) => {
        const d = dragRef.current ? ev.clientY - dragRef.current.startY : 0;
        dragRef.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (d > CLOSE_DRAG_PX) onClose();
        else setDragY(0);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [onClose],
  );

  return (
    <div className={styles.wrap} onClick={onClose} onClickCapture={(e) => (e.target as HTMLElement).closest("button") && playFlockSound("click", { self: true })} data-testid={testId}>
      <div
        className={`${styles.sheet} ${dragY === 0 ? "" : styles.dragging}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head} onPointerDown={startDrag}>
          <span className={styles.grabber} aria-hidden />
          <div className={styles.headRow}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {headExtra}
            <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel} autoFocus>
              <X size={20} aria-hidden />
            </button>
          </div>
          {headBottom?.(titleId)}
        </div>
        <div className={styles.body} {...bodyProps?.(titleId)}>
          {children(titleId)}
        </div>
      </div>
    </div>
  );
}
