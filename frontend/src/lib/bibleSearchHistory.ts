const KEY = "bibleSearchHistoryV1";
const MAX = 8;

export function readBibleSearchHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

function write(items: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    // приватний режим / переповнення — історія не критична
  }
}

export function pushBibleSearchHistory(query: string): string[] {
  const q = query.trim();
  if (!q) return readBibleSearchHistory();
  const next = [q, ...readBibleSearchHistory().filter((x) => x.toLowerCase() !== q.toLowerCase())];
  write(next);
  return next.slice(0, MAX);
}

export function removeBibleSearchHistory(query: string): string[] {
  const next = readBibleSearchHistory().filter((x) => x !== query);
  write(next);
  return next;
}

export function clearBibleSearchHistory(): string[] {
  write([]);
  return [];
}
