import { QUICK_REACTIONS_COUNT, QUICK_REACTIONS_DEFAULT, RECENT_REACTIONS_LIMIT } from "./reactionCatalog";

const STORAGE_KEY = "christapp:recentReactions";

/** Последние использованные реакции этого браузера (новые первыми). */
export function readRecentReactions(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_REACTIONS_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Запоминает использованную реакцию: она встаёт первой, дубликаты убираются. */
export function recordRecentReaction(emoji: string): void {
  try {
    const next = [emoji, ...readRecentReactions().filter((item) => item !== emoji)].slice(0, RECENT_REACTIONS_LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage недоступен (приватный режим) - быстрый ряд остаётся по умолчанию */
  }
}

/** Быстрый ряд из шести: сначала последние использованные, остаток добивается набором по умолчанию. */
export function buildQuickReactions(recent: readonly string[]): string[] {
  const row: string[] = [];
  for (const emoji of [...recent, ...QUICK_REACTIONS_DEFAULT]) {
    if (!row.includes(emoji)) row.push(emoji);
    if (row.length === QUICK_REACTIONS_COUNT) break;
  }
  return row;
}
