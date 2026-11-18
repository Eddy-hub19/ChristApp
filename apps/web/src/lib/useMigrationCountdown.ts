"use client";

import { useEffect, useState } from "react";
import { NEW_SITE_HOST, SHUTDOWN_MS, splitDuration } from "@/lib/siteMigration";

/**
 * Обратный отсчёт до отключения старого сайта. `null` — отсчёт не нужен
 * (новый домен, дедлайн прошёл или ещё не гидратировались).
 */
export function useMigrationCountdown(): {
  h: number;
  m: number;
  s: number;
} | null {
  const [active, setActive] = useState(false);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (window.location.hostname === NEW_SITE_HOST) return;
    setLeft(SHUTDOWN_MS - Date.now());
    setActive(true);
    const id = window.setInterval(() => setLeft(SHUTDOWN_MS - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!active || left <= 0) return null;
  return splitDuration(left);
}
