/**
 * Аналитика «Отары»: только значимые действия (вход в матч, итог, покупки, выбор), никаких событий на тиках игрового цикла.
 * Наружу уходят категории и числа без привязки к игроку: ни ника, ни id аккаунта, ни баланса.
 */
import { track } from "@/lib/analytics";
import { secondsSince } from "@/lib/analyticsEvents";
import { isLegendarySkin, isPremiumSkin, isSpecialSkin, isPaidSkin } from "@/lib/rubies";
import type { FlockStatus } from "./flockClient";

export type SkinCategory = "legendary" | "premium" | "special" | "paid" | "free";

export function skinCategory(id: number): SkinCategory {
  if (isLegendarySkin(id)) return "legendary";
  if (isPremiumSkin(id)) return "premium";
  if (isSpecialSkin(id)) return "special";
  return isPaidSkin(id) ? "paid" : "free";
}

/** Легендарные скины продаются за смарагди, остальное — за рубины. */
export function skinCurrency(id: number): "ruby" | "emerald" {
  return isLegendarySkin(id) ? "emerald" : "ruby";
}

/** Место округляется до класса, точная позиция не уходит. */
export function placeBucket(rank: number): "top1" | "top3" | "top10" | "other" {
  if (rank === 1) return "top1";
  if (rank >= 2 && rank <= 3) return "top3";
  if (rank >= 4 && rank <= 10) return "top10";
  return "other";
}

/** Сложность задания по слоту (слот 2 — «сложное»). */
export function questDifficulty(slot: number): "easy" | "medium" | "hard" {
  return slot >= 2 ? "hard" : slot === 1 ? "medium" : "easy";
}

type MatchContext = { map: string; mode: string; rank: number };

/**
 * Матч = от перехода статуса в "playing" до выхода из него. Реконнект (playing ⇄ reconnecting) матч не прерывает.
 * Вызывается только на смену статуса, а не на кадрах.
 */
export function createMatchTracker() {
  let startedAt: number | null = null;

  const finish = (outcome: "died" | "left", ctx: MatchContext) => {
    if (startedAt === null) return;
    const duration = secondsSince(startedAt);
    startedAt = null;
    track("otara_match_end", {
      map: ctx.map,
      duration_s: duration,
      place: placeBucket(ctx.rank),
      outcome,
    });
  };

  return {
    onStatus(status: FlockStatus, ctx: MatchContext) {
      if (status === "playing") {
        if (startedAt === null) {
          startedAt = Date.now();
          track("otara_match_start", { map: ctx.map, mode: ctx.mode });
        }
        return;
      }
      if (status === "reconnecting") return;
      finish(status === "dead" ? "died" : "left", ctx);
    },
    /** Игру закрыли посреди матча. */
    dispose(ctx: MatchContext) {
      finish("left", ctx);
    },
  };
}
