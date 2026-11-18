"use client";

import { useCallback, useRef, type MouseEventHandler } from "react";

type UseDoubleTapOptions = {
  ms?: number;
};

/**
 * Викликає `callback`, коли клік/тап стається вдруге впродовж `ms` після першого.
 * Навмисно лише `onClick` — на дотикових екранах браузер сам генерує синтетичний
 * click після touchend, тож окремий touch-обробник задвоював би спрацювання.
 */
export function useDoubleTap<T extends HTMLElement>(
  callback: () => void,
  options: UseDoubleTapOptions = {},
): { onClick: MouseEventHandler<T> } {
  const { ms = 300 } = options;
  const lastTapRef = useRef(0);

  const onClick = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < ms;
    lastTapRef.current = isDoubleTap ? 0 : now;
    if (isDoubleTap) callback();
  }, [callback, ms]);

  return { onClick };
}
