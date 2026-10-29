"use client";

import { useEffect, type RefObject } from "react";
import type { Dir } from "./snakeTypes";

const KEY_TO_DIR: Record<string, Dir> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
};

/** WASD / стрілки. Стрілки не прокручують сторінку. */
export function useKeyboardDirection(enabled: boolean, onDirection: (dir: Dir) => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // WASD по физической клавише (event.code): работает и на русской/украинской раскладке
      const dir = CODE_TO_DIR[event.code] ?? KEY_TO_DIR[event.key.toLowerCase()];
      if (!dir) return;
      if (event.key.startsWith("Arrow")) event.preventDefault();
      onDirection(dir);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onDirection]);
}

const CODE_TO_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

const SWIPE_FALLBACK_PX = 11;

/**
 * Свайпи по полю: напрямок спрацьовує вже під час руху пальця, а точка відліку зсувається —
 * можна робити серію поворотів одним жестом.
 */
export function useSwipeDirection(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  onDirection: (dir: Dir) => void,
  /** Поріг свайпу в CSS-пікселях (~0.6 клітинки); рахується на початку жесту. */
  getMinPx?: () => number,
) {
  useEffect(() => {
    const node = target.current;
    if (!enabled || !node) return;
    let startX = 0;
    let startY = 0;
    let active = false;
    let minPx = SWIPE_FALLBACK_PX;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      active = true;
      const measured = getMinPx?.();
      minPx = measured && Number.isFinite(measured) ? Math.max(8, measured) : SWIPE_FALLBACK_PX;
    };
    const onMove = (event: TouchEvent) => {
      if (!active) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < minPx) return;
      onDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
      startX = touch.clientX;
      startY = touch.clientY;
      event.preventDefault();
    };
    const onEnd = () => {
      active = false;
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, [target, enabled, onDirection, getMinPx]);
}
