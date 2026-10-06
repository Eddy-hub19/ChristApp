"use client";

import { useEffect, useState } from "react";

/** true лише тоді, коли `active` тримається довше за `delayMs` — щоб швидка мережа не давала спалахів. */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setElapsed(true), delayMs);
    return () => {
      window.clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);

  return active && elapsed;
}
