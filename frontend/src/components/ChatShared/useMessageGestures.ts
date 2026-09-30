"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type TouchEvent,
} from "react";

/** Скільки тримати палець до меню. */
const LONG_PRESS_MS = 380;
/** Скільки пікселів пальця "вправо" вважаємо свайпом-відповіддю. */
const SWIPE_TRIGGER_PX = 56;
const SWIPE_MAX_OFFSET_PX = 72;
/** Мінімальний зсув, з якого взагалі визначаємо напрямок жесту. */
const DIRECTION_LOCK_PX = 10;
/** Свайп рахується горизонтальним, лише якщо dx суттєво більший за dy. */
const HORIZONTAL_DOMINANCE = 2;
/** Жест, що почався біля лівого краю екрана, лишаємо системі (iOS "назад"). */
const SYSTEM_EDGE_PX = 24;
const DOUBLE_TAP_MS = 300;

type GestureMode = "idle" | "pending" | "swipe" | "ignored";

type Options = {
  onReply?: () => void;
  onDoubleTap?: () => void;
  onOpenMenu: (rect: DOMRect) => void;
  /** Підпис "свайп не чіпає" для інтерактивних дітей (кнопки, посилання, плеєри). */
  isInteractiveTarget?: (target: EventTarget | null) => boolean;
};

function vibrate(ms: number) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(ms);
  }
}

const DEFAULT_INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, audio, video, iframe, [data-bubble-control]";

function defaultIsInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(DEFAULT_INTERACTIVE_SELECTOR));
}

/**
 * Єдині жести повідомлення для всіх чатів:
 *  - свайп вправо (лише явно горизонтальний, не з лівого краю) → відповідь;
 *  - довгий тап / правий клік → меню дій;
 *  - подвійний тап/клік → швидка реакція.
 * Вертикальну прокрутку не блокує (напрямок визначається до першого зсуву бульбашки).
 */
export function useMessageGestures<T extends HTMLElement>({
  onReply,
  onDoubleTap,
  onOpenMenu,
  isInteractiveTarget = defaultIsInteractive,
}: Options) {
  const elementRef = useRef<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    elementRef.current = el;
  }, []);
  const startRef = useRef({ x: 0, y: 0 });
  const modeRef = useRef<GestureMode>("idle");
  const swipeAllowedRef = useRef(true);
  const armedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const lastTapRef = useRef(0);
  const lastMenuAtRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  /** Проковтує синтетичний click після жесту; скидається сам, бо браузер його не завжди шле. */
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClick = useCallback(() => {
    suppressClickRef.current = true;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
    }, 450);
  }, []);
  useEffect(
    () => () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    },
    [],
  );

  const resetOffset = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    el.style.transition = "transform 0.18s ease";
    el.style.transform = "";
    delete el.dataset.swipeArmed;
  }, []);

  const openMenu = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    lastMenuAtRef.current = Date.now();
    vibrate(20);
    onOpenMenu(el.getBoundingClientRect());
  }, [onOpenMenu]);

  const onTouchStart = (event: TouchEvent<T>) => {
    const touch = event.touches[0];
    if (!touch || isInteractiveTarget(event.target)) {
      modeRef.current = "ignored";
      return;
    }
    startRef.current = { x: touch.clientX, y: touch.clientY };
    modeRef.current = "pending";
    armedRef.current = false;
    swipeAllowedRef.current = touch.clientX > SYSTEM_EDGE_PX;
    const el = elementRef.current;
    if (el) el.style.transition = "none";
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (modeRef.current !== "pending") return;
      modeRef.current = "ignored";
      suppressNextClick();
      openMenu();
    }, LONG_PRESS_MS);
  };

  const onTouchMove = (event: TouchEvent<T>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startRef.current.x;
    const dy = touch.clientY - startRef.current.y;

    if (modeRef.current === "pending") {
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < DIRECTION_LOCK_PX && ady < DIRECTION_LOCK_PX) return;
      clearTimer();
      if (swipeAllowedRef.current && dx > 0 && adx > ady * HORIZONTAL_DOMINANCE) {
        modeRef.current = "swipe";
      } else {
        // Вертикальний (або не той бік) рух — це прокрутка, жест відпускаємо.
        modeRef.current = "ignored";
        return;
      }
    }

    if (modeRef.current !== "swipe") return;
    const el = elementRef.current;
    const offset = Math.max(0, Math.min(dx, SWIPE_MAX_OFFSET_PX));
    if (el) el.style.transform = `translateX(${offset}px)`;
    const armed = dx >= SWIPE_TRIGGER_PX;
    if (armed !== armedRef.current) {
      armedRef.current = armed;
      if (el) {
        if (armed) el.dataset.swipeArmed = "";
        else delete el.dataset.swipeArmed;
      }
      if (armed) vibrate(12);
    }
  };

  const finishTouch = (triggered: boolean) => {
    clearTimer();
    const wasSwipe = modeRef.current === "swipe";
    modeRef.current = "idle";
    if (wasSwipe) {
      resetOffset();
      suppressNextClick();
      if (triggered) onReply?.();
    }
    armedRef.current = false;
  };

  const onTouchEnd = () => finishTouch(armedRef.current);
  const onTouchCancel = () => finishTouch(false);

  const onContextMenu = (event: MouseEvent<T>) => {
    if (isInteractiveTarget(event.target)) return;
    event.preventDefault();
    // Android після довгого тапу шле ще й contextmenu — меню вже відкрите.
    if (Date.now() - lastMenuAtRef.current < 800) return;
    openMenu();
  };

  const onClick = (event: MouseEvent<T>) => {
    if (isInteractiveTarget(event.target)) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      lastTapRef.current = 0;
      return;
    }
    const now = Date.now();
    const isDouble = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = isDouble ? 0 : now;
    if (isDouble) {
      vibrate(10);
      onDoubleTap?.();
    }
  };

  return {
    ref,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onContextMenu, onClick },
  };
}
