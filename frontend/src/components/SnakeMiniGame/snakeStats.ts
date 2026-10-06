/** Локальна статистика Snake: найкращий результат за рівнем і рахунок перемог/поразок проти кожного суперника. */

const PREFIX = "christapp:snake";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватний режим / переповнене сховище — статистика просто не збережеться
  }
}

const bestKey = (userId: string, level: number) => `${PREFIX}:best:${userId}:${level}`;
const duelKey = (userId: string, peerId: string) => `${PREFIX}:duel:${userId}:${peerId}`;

export function getBestScore(userId: string, level: number): number {
  const value = Number(read(bestKey(userId, level)));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Повертає актуальний рекорд (оновлює, якщо новий результат вищий). */
export function recordBestScore(userId: string, level: number, score: number): number {
  const best = getBestScore(userId, level);
  if (score > best) {
    write(bestKey(userId, level), Math.floor(score));
    return Math.floor(score);
  }
  return best;
}

export type DuelRecord = { wins: number; losses: number };

export function getDuelRecord(userId: string, peerId: string): DuelRecord {
  const raw = read(duelKey(userId, peerId)) as Partial<DuelRecord> | null;
  return {
    wins: Math.max(0, Math.floor(Number(raw?.wins) || 0)),
    losses: Math.max(0, Math.floor(Number(raw?.losses) || 0)),
  };
}

export function recordDuelResult(
  userId: string,
  peerId: string,
  result: "win" | "loss",
): DuelRecord {
  const record = getDuelRecord(userId, peerId);
  const next = {
    wins: record.wins + (result === "win" ? 1 : 0),
    losses: record.losses + (result === "loss" ? 1 : 0),
  };
  write(duelKey(userId, peerId), next);
  return next;
}
