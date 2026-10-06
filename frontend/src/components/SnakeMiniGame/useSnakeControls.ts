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
      const dir = KEY_TO_DIR[event.key.toLowerCase()];
      if (!dir) return;
      if (event.key.startsWith("Arrow")) event.preventDefault();
      onDirection(dir);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onDirection]);
}

const SWIPE_MIN_PX = 18;

/**
 * Свайпи по полю: напрямок спрацьовує вже під час руху пальця, а точка відліку зсувається —
 * можна робити серію поворотів одним жестом.
 */
export function useSwipeDirection(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  onDirection: (dir: Dir) => void,
) {
  useEffect(() => {
    const node = target.current;
    if (!enabled || !node) return;
    let startX = 0;
    let startY = 0;
    let active = false;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      active = true;
    };
    const onMove = (event: TouchEvent) => {
      if (!active) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
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
  }, [target, enabled, onDirection]);
}
