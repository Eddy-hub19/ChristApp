export interface FlockStats {
  bestMass: number;
  eaten: number;
  topMs: number;
  games: number;
}

const EMPTY: FlockStats = { bestMass: 0, eaten: 0, topMs: 0, games: 0 };
const legacyKey = (userId: string) => `christapp:flock:stats:${userId}`;

/** Стара статистика з localStorage (до переїзду в БД): читаємо лише для разового переносу на сервер. */
export function loadLegacyFlockStats(userId: string): FlockStats | null {
  try {
    const raw = localStorage.getItem(legacyKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FlockStats>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    const stats = { bestMass: n(p.bestMass), eaten: n(p.eaten), topMs: n(p.topMs), games: n(p.games) };
    return stats.games > 0 || stats.bestMass > 0 ? stats : null;
  } catch {
    return null;
  }
}

export function clearLegacyFlockStats(userId: string) {
  try {
    localStorage.removeItem(legacyKey(userId));
  } catch {
    /* ignore */
  }
}

export const EMPTY_FLOCK_STATS = EMPTY;

const CONTROLS_KEY = "christapp:flock:controls";
export type ControlMode = "follow" | "joystick";

export function loadControlMode(): ControlMode {
  try {
    return localStorage.getItem(CONTROLS_KEY) === "joystick" ? "joystick" : "follow";
  } catch {
    return "follow";
  }
}
export function saveControlMode(mode: ControlMode) {
  try {
    localStorage.setItem(CONTROLS_KEY, mode);
  } catch {
    /* ignore */
  }
}
