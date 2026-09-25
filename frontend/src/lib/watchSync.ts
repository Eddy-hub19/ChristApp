/**
 * Синхронізація «Кіношки» на клієнті: годинник сервера та рішення, коли підправляти плеєр.
 * Чисті функції/класи без React, щоб логіку було легко читати й перевіряти.
 */

/**
 * YOUTUBE/VIMEO/DAILYMOTION/FILE — повна синхронізація (адаптер керує плеєром програмно).
 * IFRAME/MANUAL — ручна: адаптер лише показує вміст (вбудований чи прев'ю-картку), а
 * синхронізація йде окремим протоколом відліку/готовності (`state.manual`, нижче), не через
 * positionSec/isPlaying.
 */
export const WATCH_PROVIDERS = [
  "YOUTUBE",
  "VIMEO",
  "DAILYMOTION",
  "FILE",
  "IFRAME",
  "MANUAL",
] as const;
export type WatchProvider = (typeof WATCH_PROVIDERS)[number];
export const AUTO_SYNC_PROVIDERS: ReadonlySet<WatchProvider> = new Set([
  "YOUTUBE",
  "VIMEO",
  "DAILYMOTION",
  "FILE",
]);

/** Дзеркалить backend/src/watch-party/watch-party.state.ts (ManualPhase/ManualSyncState). */
export const MANUAL_PHASES = ["idle", "countdown", "running", "paused"] as const;
export type ManualPhase = (typeof MANUAL_PHASES)[number];
export const MANUAL_COUNTDOWN_MS = 3_000;

export type ManualSyncState = {
  phase: ManualPhase;
  /** Серверний час (мс), коли відлік дійде до нуля. `null` поза фазою countdown. */
  countdownEndsAt: number | null;
  readyUserIds: string[];
  /** Скільки мс показ уже йшов сумарно ДО поточного відрізку running (заморожено під час paused). */
  accumulatedMs: number;
  /** Серверний час (мс) початку поточного відрізку running. `null` поза фазою running. */
  runningSince: number | null;
};

export type WatchState = {
  roomId: string;
  provider: WatchProvider;
  videoId: string;
  videoTitle: string | null;
  thumbnailUrl: string | null;
  isPlaying: boolean;
  positionSec: number;
  /** Серверний час якоря, мс. */
  updatedAt: number;
  serverNow: number;
  hostId: string;
  version: number;
  reason: string;
  actorId: string | null;
  /** Ярлик пристрою, що надіслав команду (див. `DEVICE_TAG`). */
  originTag: string | null;
  /** Лише для IFRAME/MANUAL — `null` для провайдерів з автосинхронізацією. */
  manual: ManualSyncState | null;
};

/** Випадковий ярлик цієї вкладки: свої ж команди, що повернулися від сервера, не «виправляємо». */
export const DEVICE_TAG =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 18);

type TimeAck = { t0: number | null; serverNow: number };

/** Мінімальний інтерфейс сокета: і socket.io-client v4, і старі типи з ним сумісні. */
export type AckSocket = {
  emit(event: string, ...args: unknown[]): unknown;
};

/** emit з підтвердженням і таймаутом: `null`, якщо сервер не відповів вчасно. */
export function emitWithAck<T>(
  socket: AckSocket,
  event: string,
  body: unknown,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    socket.emit(event, body, (res: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res ?? null);
    });
  });
}

/**
 * NTP-подібний зсув годинника: кілька пінгів, беремо вибірку з найменшим RTT
 * (у неї найменша невизначеність). serverTime ≈ Date.now() + offset.
 */
export class ServerClock {
  private offsetMs = 0;
  private bestRttMs = Number.POSITIVE_INFINITY;
  private synced = false;

  now(): number {
    return Date.now() + this.offsetMs;
  }

  get isSynced() {
    return this.synced;
  }

  get rttMs() {
    return this.bestRttMs;
  }

  /** Грубе початкове наближення з будь-якого пакета стану, поки пінги не повернулися. */
  seedFromServerNow(serverNow: number) {
    if (!this.synced && Number.isFinite(serverNow)) {
      this.offsetMs = serverNow - Date.now();
    }
  }

  async sync(socket: AckSocket, samples = 5): Promise<void> {
    const results: Array<{ rtt: number; offset: number }> = [];
    for (let i = 0; i < samples; i += 1) {
      const t0 = Date.now();
      const res = await emitWithAck<TimeAck>(socket, "watch:time", { t0 }, 4000);
      const t1 = Date.now();
      if (!res || typeof res.serverNow !== "number") continue;
      const rtt = t1 - t0;
      results.push({ rtt, offset: res.serverNow - (t0 + rtt / 2) });
    }
    if (!results.length) return;

    const best = results.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    // Нова вибірка приймається, якщо вона не гірша за попередню з запасом —
    // RTT плаває, і «найкраща за весь час» може безнадійно застаріти.
    if (!this.synced || best.rtt <= this.bestRttMs * 1.5 + 20) {
      this.offsetMs = best.offset;
      this.bestRttMs = best.rtt;
    }
    this.synced = true;
  }
}

/** Де зараз має бути відео за станом сервера. */
export function expectedPosition(state: WatchState, serverNowMs: number): number {
  if (!state.isPlaying) return state.positionSec;
  return state.positionSec + Math.max(0, serverNowMs - state.updatedAt) / 1000;
}

/** Розбіжність, після якої робимо seek. Менші — не чіпаємо, щоб не смикати картинку. */
export const DRIFT_SEEK_THRESHOLD_SEC = 1;
/** Після seek плеєру треба час дозавантажитися — поки що не міряємо розбіжність. */
export const SEEK_SETTLE_MS = 3000;
/** Стільки seek-ів поспіль без успіху (за вікно) — ознака поганого інтернету. */
export const MAX_SEEKS_IN_WINDOW = 3;
export const SEEK_WINDOW_MS = 20_000;
/** Пауза в корекціях після серії невдалих seek-ів. */
export const SEEK_BACKOFF_MS = 10_000;

/**
 * Захист від нескінченного циклу seek: відстежує, як часто ми підправляли плеєр,
 * і на поганому інтернеті дає йому спокійно добуферизуватися.
 */
export class SeekGovernor {
  private seeks: number[] = [];
  private lastSeekAt = 0;
  private backoffUntil = 0;

  /** Чи можна зараз міряти розбіжність і, можливо, seek-нути. */
  canCorrect(nowMs: number): boolean {
    return nowMs >= this.backoffUntil && nowMs - this.lastSeekAt >= SEEK_SETTLE_MS;
  }

  get isBackingOff(): boolean {
    return Date.now() < this.backoffUntil;
  }

  recordSeek(nowMs: number) {
    this.lastSeekAt = nowMs;
    this.seeks = this.seeks.filter((t) => nowMs - t < SEEK_WINDOW_MS);
    this.seeks.push(nowMs);
    if (this.seeks.length >= MAX_SEEKS_IN_WINDOW) {
      this.backoffUntil = nowMs + SEEK_BACKOFF_MS;
      this.seeks = [];
    }
  }

  /** Явна команда хоста (seek/play/зміна відео) — це не «дрейф», лічильник скидаємо. */
  reset(nowMs: number) {
    this.seeks = [];
    this.backoffUntil = 0;
    this.lastSeekAt = nowMs;
  }

  /** Відтворення знову йде рівно — забуваємо старі невдачі. */
  markStable(nowMs: number) {
    this.seeks = this.seeks.filter((t) => nowMs - t < SEEK_WINDOW_MS);
  }
}

/** Скільки цілих секунд лишилось до кінця відліку — для великого числа "3…2…1" в UI. */
export function manualSecondsLeft(countdownEndsAt: number, nowMs: number): number {
  return Math.max(0, Math.ceil((countdownEndsAt - nowMs) / 1000));
}

/**
 * Скільки показ уже йде (сек), для запізнілого учасника — "Показ іде 12:34". Під час running
 * додає час поточного відрізку до вже накопиченого раніше (пред. відрізки до попередніх пауз).
 */
export function manualElapsedSec(manual: ManualSyncState, nowMs: number): number {
  const runningMs =
    manual.phase === "running" && manual.runningSince !== null
      ? Math.max(0, nowMs - manual.runningSince)
      : 0;
  return Math.floor((manual.accumulatedMs + runningMs) / 1000);
}

export function formatPlaybackTime(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
