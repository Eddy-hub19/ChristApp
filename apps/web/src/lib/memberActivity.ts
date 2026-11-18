/** Порядок списків людей за активністю: онлайн → недавно → давно (див. `OnlineUsersDrawer`). */

export type ActivitySection = "online" | "recent" | "earlier";

export type ActivitySubject = {
  name: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
};

/** «Нещодавно» — останні 7 днів. */
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function lastSeenMs(subject: ActivitySubject): number | null {
  if (!subject.lastSeenAt) return null;
  const ms = new Date(subject.lastSeenAt).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function byName(a: ActivitySubject, b: ActivitySubject) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Онлайн (за алфавітом) → за свіжістю lastSeenAt → без lastSeenAt (за алфавітом). Сортує копію, стабільно. */
export function sortByActivity<T>(items: readonly T[], subject: (item: T) => ActivitySubject): T[] {
  return items
    .map((item) => {
      const s = subject(item);
      return { item, s, seen: s.isOnline ? null : lastSeenMs(s) };
    })
    .sort((a, b) => {
      if (a.s.isOnline !== b.s.isOnline) return a.s.isOnline ? -1 : 1;
      if (a.s.isOnline) return byName(a.s, b.s);
      if (a.seen !== null && b.seen !== null) {
        return b.seen - a.seen || byName(a.s, b.s);
      }
      if (a.seen !== null) return -1;
      if (b.seen !== null) return 1;
      return byName(a.s, b.s);
    })
    .map(({ item }) => item);
}

export function activitySectionOf(subject: ActivitySubject, nowMs: number): ActivitySection {
  if (subject.isOnline) return "online";
  const seen = lastSeenMs(subject);
  if (seen !== null && nowMs - seen <= RECENT_WINDOW_MS) return "recent";
  return "earlier";
}

/** Розкладає вже відсортований список по розділах; порожні розділи не повертаються. */
export function groupByActivity<T>(
  sorted: readonly T[],
  subject: (item: T) => ActivitySubject,
  nowMs: number,
): Array<{ section: ActivitySection; items: T[] }> {
  const buckets: Record<ActivitySection, T[]> = { online: [], recent: [], earlier: [] };
  for (const item of sorted) {
    buckets[activitySectionOf(subject(item), nowMs)].push(item);
  }
  return (["online", "recent", "earlier"] as const)
    .filter((section) => buckets[section].length > 0)
    .map((section) => ({ section, items: buckets[section] }));
}

/** Свіжіший із двох ISO-моментів (для злиття lastSeenAt з довідника і живих подій присутності). */
export function laterIso(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
