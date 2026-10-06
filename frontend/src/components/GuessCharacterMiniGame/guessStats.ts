/**
 * Локальна статистика «Вгадай персонажа»: перемоги, поразки й нічиї проти кожного суперника
 * (як у Snake — у localStorage). Записи беруться з журналу матчів сервера й нумеруються, тож
 * матч, що завершився, поки гравець був поза грою, теж потрапить у статистику — і лише раз.
 */
import type { MatchLogEntry } from "./guessTypes";

const PREFIX = "christapp:guess";

export type GuessRecord = { wins: number; losses: number; draws: number };

export type GuessStatsState = { record: GuessRecord; lastMatch: number };

export const EMPTY_STATS: GuessStatsState = {
  record: { wins: 0, losses: 0, draws: 0 },
  lastMatch: 0,
};

/** Дописує до статистики лише матчі, яких ще не було; повертає той самий об'єкт, якщо нових немає. */
export function applyMatches(
  state: GuessStatsState,
  matches: MatchLogEntry[],
  userId: string,
): GuessStatsState {
  const fresh = matches.filter((m) => m.n > state.lastMatch).sort((a, b) => a.n - b.n);
  if (fresh.length === 0) return state;
  const record = { ...state.record };
  for (const m of fresh) {
    if (m.winner === null) record.draws += 1;
    else if (m.winner === userId) record.wins += 1;
    else record.losses += 1;
  }
  return { record, lastMatch: fresh[fresh.length - 1].n };
}

function num(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseStats(raw: unknown): GuessStatsState {
  if (!raw || typeof raw !== "object") return EMPTY_STATS;
  const r = raw as Partial<GuessStatsState> & { record?: Partial<GuessRecord> };
  return {
    record: { wins: num(r.record?.wins), losses: num(r.record?.losses), draws: num(r.record?.draws) },
    lastMatch: num(r.lastMatch),
  };
}

const key = (userId: string, peerId: string) => `${PREFIX}:${userId}:${peerId}`;

export function loadStats(userId: string, peerId: string): GuessStatsState {
  try {
    const raw = window.localStorage.getItem(key(userId, peerId));
    return raw ? parseStats(JSON.parse(raw)) : EMPTY_STATS;
  } catch {
    return EMPTY_STATS;
  }
}

export function saveStats(userId: string, peerId: string, state: GuessStatsState) {
  try {
    window.localStorage.setItem(key(userId, peerId), JSON.stringify(state));
  } catch {
    // приватний режим / переповнене сховище — статистика просто не збережеться
  }
}
