/**
 * Токен відновлення сесії "Отари": sessionStorage (переживає перезавантаження вкладки) +
 * localStorage з часом (переживає закриту вкладку / вивантажений PWA). Токен діє, поки сервер
 * тримає овечку в паузі (`pauseMs`), тому клієнт рахує свіжість від останнього "я був на звʼязку".
 */
export interface StoredFlockSession {
  token: string;
  arenaId: number | null;
  skin: number;
  /** Остання мить, коли ми точно були підключені (мс). */
  savedAt: number;
  /** Скільки секунд сервер тримає паузу (з `welcome`). */
  pauseMs: number;
  /** Гра зараз відкрита й підключена (банер "Повернутися" тоді не потрібен). */
  connected: boolean;
}

const KEY = "christapp:flock:session";
/** Запас на розбіжність годинників і дорогу: сервер усе одно вирішує сам. */
const GRACE_MS = 1500;
/** Банер не показуємо, поки гра сама оновлює `savedAt` (вона робить це раз на ~2 с). */
const ACTIVE_WINDOW_MS = 3500;

function read(storage: Storage | undefined): StoredFlockSession | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredFlockSession>;
    if (typeof p.token !== "string" || !/^[0-9a-f]{32}$/.test(p.token)) return null;
    if (typeof p.savedAt !== "number" || !Number.isFinite(p.savedAt)) return null;
    return {
      token: p.token,
      arenaId: typeof p.arenaId === "number" && p.arenaId > 0 ? p.arenaId : null,
      skin: typeof p.skin === "number" ? p.skin : 0,
      savedAt: p.savedAt,
      pauseMs: typeof p.pauseMs === "number" && p.pauseMs > 0 ? p.pauseMs : 20_000,
      connected: p.connected === true,
    };
  } catch {
    return null;
  }
}

function stores() {
  if (typeof window === "undefined") return { s: undefined, l: undefined };
  let s: Storage | undefined;
  let l: Storage | undefined;
  try {
    s = window.sessionStorage;
  } catch {
    s = undefined;
  }
  try {
    l = window.localStorage;
  } catch {
    l = undefined;
  }
  return { s, l };
}

/** Найсвіжіший із двох сховищ. */
export function loadFlockSession(): StoredFlockSession | null {
  const { s, l } = stores();
  const a = read(s);
  const b = read(l);
  if (a && b) return a.savedAt >= b.savedAt ? a : b;
  return a ?? b;
}

export function saveFlockSession(session: StoredFlockSession) {
  const raw = JSON.stringify(session);
  const { s, l } = stores();
  try {
    s?.setItem(KEY, raw);
  } catch {
    /* приватний режим */
  }
  try {
    l?.setItem(KEY, raw);
  } catch {
    /* приватний режим */
  }
}

export function clearFlockSession() {
  const { s, l } = stores();
  try {
    s?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    l?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Скільки мс лишилось, поки овечка чекає (0 - вже не чекає). */
export function resumeRemainingMs(session: StoredFlockSession | null, now = Date.now()): number {
  if (!session) return 0;
  return Math.max(0, session.pauseMs + GRACE_MS - (now - session.savedAt));
}

/** Токен ще має сенс пробувати. */
export function isResumable(session: StoredFlockSession | null, now = Date.now()): boolean {
  return resumeRemainingMs(session, now) > 0;
}

/** Для банера "Овечка чекає на тебе": токен свіжий, а гра зараз не відкрита. */
export function waitingSession(now = Date.now()): { session: StoredFlockSession; remainingMs: number } | null {
  const session = loadFlockSession();
  if (!session || !isResumable(session, now)) return null;
  if (session.connected && now - session.savedAt < ACTIVE_WINDOW_MS) return null;
  // для людини - чесний відлік до кінця паузи (запас GRACE_MS у ньому не показуємо)
  const remainingMs = Math.max(0, session.pauseMs - (now - session.savedAt));
  return remainingMs > 0 ? { session, remainingMs } : null;
}
