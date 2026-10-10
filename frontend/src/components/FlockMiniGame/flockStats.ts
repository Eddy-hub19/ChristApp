export interface FlockStats {
  bestMass: number;
  eaten: number;
  topMs: number;
  games: number;
}

const EMPTY: FlockStats = { bestMass: 0, eaten: 0, topMs: 0, games: 0 };
const key = (userId: string) => `christapp:flock:stats:${userId}`;

export function loadFlockStats(userId: string): FlockStats {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<FlockStats>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    return { bestMass: n(p.bestMass), eaten: n(p.eaten), topMs: n(p.topMs), games: n(p.games) };
  } catch {
    return { ...EMPTY };
  }
}

export function recordFlockRun(userId: string, run: { maxMass: number; kills: number; topMs: number }): FlockStats {
  const prev = loadFlockStats(userId);
  const next: FlockStats = {
    bestMass: Math.max(prev.bestMass, Math.round(run.maxMass)),
    eaten: prev.eaten + Math.max(0, run.kills),
    topMs: prev.topMs + Math.max(0, Math.round(run.topMs)),
    games: prev.games + 1,
  };
  try {
    localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    /* приватний режим / квота: статистика просто не збережеться */
  }
  return next;
}

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
