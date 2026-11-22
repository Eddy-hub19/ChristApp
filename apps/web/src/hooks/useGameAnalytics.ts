"use client";

import { useEffect } from "react";
import { secondsSince } from "@/lib/analyticsEvents";
import { track } from "@/lib/analytics";

/**
 * Аналитика мини-игры чата: открытие/старт при показе и конец с длительностью при закрытии.
 * Результат партии в аналитику не передаётся (`end` = игрок закрыл игру). Единственное место для событий игр.
 */
export function useGameAnalytics(game: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    track("game_open", { game });
    track("game_start", { game });
    return () => {
      track("game_end", { game, result: "end", duration_s: secondsSince(startedAt) });
    };
  }, [game, active]);
}
