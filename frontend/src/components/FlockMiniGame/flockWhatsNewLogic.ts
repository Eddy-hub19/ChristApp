import { WHATS_NEW, type WhatsNewEntry } from "./flockWhatsNewData";
import type { FlockStatus } from "./flockClient";

export type Announcement = { kind: "welcome"; version: number } | { kind: "news"; entries: WhatsNewEntry[]; version: number };

export const latestVersion = (entries: WhatsNewEntry[] = WHATS_NEW) => entries.reduce((m, e) => Math.max(m, e.version), 0);

/** Версии новее просмотренной; самые новые сверху. Из них собирается одна плашка. */
export function pendingEntries(seen: number, entries: WhatsNewEntry[] = WHATS_NEW): WhatsNewEntry[] {
  return entries.filter((e) => e.version > seen).sort((a, b) => b.version - a.version);
}

const key = (userId: string) => `christapp:flock:whatsNew:${userId}`;

export function loadLocalSeen(userId: string): number {
  try {
    const v = Number(localStorage.getItem(key(userId)));
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveLocalSeen(userId: string, version: number) {
  try {
    if (version > loadLocalSeen(userId)) localStorage.setItem(key(userId), String(version));
  } catch {
    /* приватный режим */
  }
}

export interface AnnounceInput {
  /** Версия, просмотренная по данным сервера / localStorage (берётся максимум). */
  serverSeen: number;
  localSeen: number;
  /** Сколько игр сыграно (после переноса статистики). 0 и seen=0 - впервые в «Отаре». */
  games: number;
  status: FlockStatus;
  /** Есть токен возврата после вылета («Овечка чекає»). */
  resumable: boolean;
  entries?: WhatsNewEntry[];
}

/** Статусы лобби, в которых плашку можно показывать (не игра, не возврат, не итоги). */
const LOBBY_OK: FlockStatus[] = ["ready", "connecting"];

export function decideAnnouncement(i: AnnounceInput): Announcement | null {
  if (!LOBBY_OK.includes(i.status) || i.resumable) return null;
  const entries = i.entries ?? WHATS_NEW;
  const version = latestVersion(entries);
  const seen = Math.max(i.serverSeen, i.localSeen);
  if (seen >= version) return null;
  if (seen === 0 && i.games === 0) return { kind: "welcome", version };
  const pending = pendingEntries(seen, entries);
  return pending.length ? { kind: "news", entries: pending, version } : null;
}
