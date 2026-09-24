"use client";

import { useEffect, useState, type DependencyList, type RefObject } from "react";

type Options = {
  /** Сумарний зсув (px) в одному напрямку, після якого реагуємо — без дёргання на мікрорухах. */
  threshold?: number;
  /** Скільки бездіяльності (мс) після прокрутки — і елементи знову з'являються. */
  idleMs?: number;
  /** Відстань до кінця (px), яка вважається «дочитав до кінця». */
  endOffset?: number;
};

/**
 * Ховає плаваючі елементи, поки користувач гортає вниз.
 * Показує знову: після паузи, при невеликому скролі вгору, біля початку та в кінці контенту.
 * Слухач пасивний і обробляє не більше однієї події на кадр (requestAnimationFrame).
 */
export function useAutoHideOnScroll(
  ref: RefObject<HTMLElement | null>,
  deps: DependencyList,
  { threshold = 10, idleMs = 800, endOffset = 24 }: Options = {},
) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let lastTop = el.scrollTop;
    /** Накопичений зсув у поточному напрямку (+ вниз, − вгору). */
    let travel = 0;
    let frame = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const set = (next: boolean) => setHidden((prev) => (prev === next ? prev : next));

    const evaluate = () => {
      frame = 0;
      const top = el.scrollTop;
      const delta = top - lastTop;
      lastTop = top;

      const atTop = top <= threshold;
      const atEnd = top + el.clientHeight >= el.scrollHeight - endOffset;
      if (atTop || atEnd) {
        travel = 0;
        set(false);
        return;
      }

      // Зміна напрямку обнуляє накопичення, щоб одиничний «відскок» не перемикав стан.
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      if (travel > threshold) set(true);
      else if (travel < -threshold) set(false);

      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        travel = 0;
        set(false);
      }, idleMs);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(evaluate);
    };

    // Скидати стан при зміні глави не треба: програмний scrollTop = 0 теж дає подію scroll → atTop.
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(idleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps задає викликач (зміна глави тощо)
  }, deps);

  return hidden;
}
