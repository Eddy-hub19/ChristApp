"use client";

import { useEffect } from "react";

const KEYBOARD_INSET_VAR = "--keyboard-inset";

/**
 * Висота екранної клавіатури у CSS-змінній `--keyboard-inset`.
 *
 * На iOS `100dvh` не зменшується, коли з'являється клавіатура: layout viewport лишається
 * старим, а стискається лише visual viewport — тому поле введення опиняється під клавіатурою.
 * Рахуємо різницю самі й піднімаємо контент рівно на неї.
 *
 * На Android з `interactiveWidget: "resizes-content"` layout viewport стискається сам,
 * тож різниця виходить ~0 і нічого не подвоюється (базу беремо з живого `innerHeight`).
 */
export function useKeyboardInset(enabled = true) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = document.documentElement;

    if (!enabled) {
      root.style.removeProperty(KEYBOARD_INSET_VAR);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    let frame: number | null = null;

    const applyInset = () => {
      frame = null;
      const overlap =
        window.innerHeight - (viewport.height + viewport.offsetTop);
      // Дрібні коливання (адресний рядок, згладжування) ігноруємо.
      const inset = overlap > 24 ? Math.round(overlap) : 0;
      root.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
    };

    const scheduleApply = () => {
      if (frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(applyInset);
    };

    applyInset();
    viewport.addEventListener("resize", scheduleApply);
    viewport.addEventListener("scroll", scheduleApply);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      viewport.removeEventListener("resize", scheduleApply);
      viewport.removeEventListener("scroll", scheduleApply);
      root.style.removeProperty(KEYBOARD_INSET_VAR);
    };
  }, [enabled]);
}
