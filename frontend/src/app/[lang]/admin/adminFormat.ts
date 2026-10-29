const pad = (n: number) => String(n).padStart(2, "0");

/** Короткий формат без року й секунд: «26.10 21:32». */
export function formatShortDate(value: string | number | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type LastSeen =
  | { kind: "never" }
  | { kind: "now" }
  | { kind: "min" | "hour" | "day"; count: number }
  | { kind: "date"; text: string };

/** «Був у мережі» для картки: щойно / N хв / N год / N дн тому, давніше тижня - коротка дата. */
export function describeLastSeen(lastSeenAt: string | null, now: number): LastSeen {
  if (!lastSeenAt) return { kind: "never" };
  const ts = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) return { kind: "never" };
  const min = Math.floor(Math.max(0, now - ts) / 60_000);
  if (min < 1) return { kind: "now" };
  if (min < 60) return { kind: "min", count: min };
  if (min < 60 * 24) return { kind: "hour", count: Math.floor(min / 60) };
  if (min < 60 * 24 * 7) return { kind: "day", count: Math.floor(min / (60 * 24)) };
  return { kind: "date", text: formatShortDate(ts) };
}
