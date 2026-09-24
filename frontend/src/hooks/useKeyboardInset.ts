"use client";

import { useEffect } from "react";

const KEYBOARD_INSET_VAR = "--keyboard-inset";
const VV_HEIGHT_VAR = "--vv-height";
const VV_TOP_VAR = "--vv-top";
const KEYBOARD_OPEN_ATTR = "data-keyboard-open";

/**
 * Геометрія видимої області (visual viewport) у CSS-змінних на `<html>`:
 * - `--vv-height` — висота видимої частини екрана (без клавіатури та панелі ^ ∨ ✓ Safari);
 * - `--vv-top` — наскільки Safari «підсунув» видиму область, щоб показати поле введення;
 * - `--keyboard-inset` — висота клавіатури (0, якщо закрита);
 * - `data-keyboard-open` — клавіатура відкрита (тоді safe area знизу вже не потрібна).
 *
 * Навіщо: на iOS `100dvh`/`100vh` і `position: fixed` не зменшуються, коли з'являється
 * клавіатура, — стискається лише visual viewport. Екран чату фіксуємо рівно по ньому,
 * тож поле введення завжди стоїть над клавіатурою, а шапка — вгорі видимої частини.
 * На Android з `interactiveWidget: "resizes-content"` усе стискається само — значення збігаються.
 */
export function useKeyboardInset(enabled = true) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = document.documentElement;
    const clear = () => {
      root.style.removeProperty(KEYBOARD_INSET_VAR);
      root.style.removeProperty(VV_HEIGHT_VAR);
      root.style.removeProperty(VV_TOP_VAR);
      root.removeAttribute(KEYBOARD_OPEN_ATTR);
    };

    if (!enabled) {
      clear();
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    let frame: number | null = null;

    const apply = () => {
      frame = null;
      const height = viewport.height;
      const top = Math.max(0, viewport.offsetTop);
      const overlap = window.innerHeight - (height + top);
      // Дрібні коливання (адресний рядок, згладжування) — не клавіатура.
      const inset = overlap > 80 ? Math.round(overlap) : 0;

      root.style.setProperty(VV_HEIGHT_VAR, `${Math.round(height)}px`);
      root.style.setProperty(VV_TOP_VAR, `${Math.round(top)}px`);
      root.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
      if (inset > 0) root.setAttribute(KEYBOARD_OPEN_ATTR, "");
      else root.removeAttribute(KEYBOARD_OPEN_ATTR);
    };

    const schedule = () => {
      if (frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(apply);
    };

    apply();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      clear();
    };
  }, [enabled]);
}
