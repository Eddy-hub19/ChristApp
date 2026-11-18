/**
 * Чиста логіка стану плеєра «Кіношки» — без БД і сокетів, щоб її можна було покрити тестами.
 *
 * Модель: сервер зберігає «якір» — позицію на момент `updatedAtMs` (серверний час) і прапорець
 * `isPlaying`. Поточна позиція під час відтворення = position + (now − updatedAt).
 */

export const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * YOUTUBE/VIMEO/DAILYMOTION/FILE — повна синхронізація (сервер може довіряти позиції з команд
 * play/pause/seek/heartbeat). IFRAME/MANUAL — ручна: цей самий "якір" (positionSec/isPlaying)
 * тут не використовується, кімната синхронізується окремим протоколом відліку/готовності
 * (watch:manualReady/Start/Pause/Resume у watch-party.gateway.ts/watch-party.service.ts,
 * чиста логіка фаз — нижче, ManualSyncState/manualStart/manualPause/manualResume тощо).
 */
export const WATCH_PROVIDERS = [
  'YOUTUBE',
  'VIMEO',
  'DAILYMOTION',
  'FILE',
  'IFRAME',
  'MANUAL',
] as const;
export type WatchProvider = (typeof WATCH_PROVIDERS)[number];
export const AUTO_SYNC_PROVIDERS: ReadonlySet<WatchProvider> = new Set([
  'YOUTUBE',
  'VIMEO',
  'DAILYMOTION',
  'FILE',
]);
export function isWatchProvider(value: unknown): value is WatchProvider {
  return typeof value === 'string' && (WATCH_PROVIDERS as readonly string[]).includes(value);
}

/** Найдовше відео на YouTube — ~12 год; беремо із запасом, аби відсікати сміття. */
export const MAX_POSITION_SEC = 24 * 3600;

/**
 * Скільки максимум компенсуємо затримку доставки команди хоста. Більша різниця означає
 * розбіжність годинників або «застарілий» пакет — тоді краще взяти позицію як є.
 */
export const MAX_TRANSIT_COMPENSATION_MS = 2_000;

/** Heartbeat хоста виправляє якір, лише якщо той відійшов від реальної позиції хоста помітно. */
export const HEARTBEAT_CORRECTION_THRESHOLD_SEC = 0.35;

export type WatchPlaybackState = {
  provider: WatchProvider;
  videoId: string;
  isPlaying: boolean;
  positionSec: number;
  updatedAtMs: number;
};

export function isValidVideoId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_VIDEO_ID_RE.test(value);
}

export const VIMEO_ID_RE = /^\d{6,12}$/;
export const DAILYMOTION_ID_RE = /^[A-Za-z0-9]{6,14}$/;

/**
 * Формальна перевірка "схожості" ref на правильний для цього провайдера (без мережі — це
 * не резолвінг посилання, а захист про всяк випадок від явно зіпсованих/шкідливих значень,
 * що надійшли прямо в сокет-команду в обхід звичайного шляху "вставили посилання → resolveLink").
 * FILE/IFRAME/MANUAL зберігають повний URL — тут лише http/https, без розкодовування хоста.
 */
export function isValidProviderRef(
  provider: WatchProvider,
  value: unknown,
): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  switch (provider) {
    case 'YOUTUBE':
      return YOUTUBE_VIDEO_ID_RE.test(value);
    case 'VIMEO':
      return VIMEO_ID_RE.test(value);
    case 'DAILYMOTION':
      return DAILYMOTION_ID_RE.test(value);
    case 'FILE':
    case 'IFRAME':
    case 'MANUAL':
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
  }
}

export function clampPosition(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, MAX_POSITION_SEC);
}

/** Позиція в момент `nowMs` за серверним годинником. */
export function projectPosition(
  state: Pick<WatchPlaybackState, 'isPlaying' | 'positionSec' | 'updatedAtMs'>,
  nowMs: number,
): number {
  if (!state.isPlaying) return state.positionSec;
  const elapsedSec = Math.max(0, nowMs - state.updatedAtMs) / 1000;
  return clampPosition(state.positionSec + elapsedSec);
}

/**
 * Позиція, яку хост мав у момент `sentAtServerMs` (його годинник, уже переведений у серверний час),
 * перенесена на `nowMs`. Якщо відтворення стоїть або час відправки підозрілий — повертає як є.
 */
export function compensateTransit(
  positionSec: number,
  isPlaying: boolean,
  sentAtServerMs: number | undefined,
  nowMs: number,
): number {
  const base = clampPosition(positionSec);
  if (!isPlaying || typeof sentAtServerMs !== 'number') return base;
  if (!Number.isFinite(sentAtServerMs)) return base;
  const transit = nowMs - sentAtServerMs;
  if (transit < 0 || transit > MAX_TRANSIT_COMPENSATION_MS) return base;
  return clampPosition(base + transit / 1000);
}

export type ControlCommand =
  | { type: 'play'; positionSec?: number; sentAt?: number }
  | { type: 'pause'; positionSec?: number; sentAt?: number }
  | { type: 'seek'; positionSec: number; sentAt?: number }
  | {
      type: 'changeVideo';
      provider: WatchProvider;
      videoId: string;
      startSec?: number;
      /** Лише для не-YOUTUBE: сервер повторно посилання не тягне, довіряє цим полям з клієнта. */
      videoTitle?: string;
      thumbnailUrl?: string;
    }
  | {
      type: 'heartbeat';
      positionSec: number;
      isPlaying: boolean;
      sentAt?: number;
    };

/**
 * Застосовує команду хоста. Повертає новий стан або `null`, якщо нічого не змінилося
 * (наприклад, heartbeat у межах похибки) — тоді й розсилати нічого не треба.
 */
export function applyControlCommand(
  state: WatchPlaybackState,
  command: ControlCommand,
  nowMs: number,
): WatchPlaybackState | null {
  switch (command.type) {
    case 'play': {
      // Хост запускає плеєр локально одразу, тож поки команда летить, він уже пройшов `transit`.
      const position =
        typeof command.positionSec === 'number'
          ? compensateTransit(command.positionSec, true, command.sentAt, nowMs)
          : projectPosition(state, nowMs);
      return {
        ...state,
        isPlaying: true,
        positionSec: position,
        updatedAtMs: nowMs,
      };
    }
    case 'pause': {
      const position =
        typeof command.positionSec === 'number'
          ? clampPosition(command.positionSec)
          : projectPosition(state, nowMs);
      return {
        ...state,
        isPlaying: false,
        positionSec: position,
        updatedAtMs: nowMs,
      };
    }
    case 'seek': {
      return {
        ...state,
        positionSec: compensateTransit(
          command.positionSec,
          state.isPlaying,
          command.sentAt,
          nowMs,
        ),
        updatedAtMs: nowMs,
      };
    }
    case 'changeVideo': {
      return {
        provider: command.provider,
        videoId: command.videoId,
        isPlaying: false,
        positionSec: clampPosition(command.startSec ?? 0),
        updatedAtMs: nowMs,
      };
    }
    case 'heartbeat': {
      // Play/pause задають лише явні команди: heartbeat, що «розминувся» з паузою,
      // не повинен знову запускати відтворення всім.
      if (!state.isPlaying || !command.isPlaying) return null;
      const hostPosition = compensateTransit(
        command.positionSec,
        true,
        command.sentAt,
        nowMs,
      );
      const drift = Math.abs(hostPosition - projectPosition(state, nowMs));
      if (drift < HEARTBEAT_CORRECTION_THRESHOLD_SEC) return null;
      return { ...state, positionSec: hostPosition, updatedAtMs: nowMs };
    }
  }
}

/**
 * Кому передати керування, коли хост пішов. Спершу — ті, хто зараз у залі, у порядку приєднання
 * до кімнати; якщо в залі нікого — `null` (кімнату ставимо на паузу, хост лишається).
 */
export function pickNextHost(
  membersByJoinOrder: string[],
  currentHostId: string,
  presentUserIds: ReadonlySet<string>,
): string | null {
  for (const userId of membersByJoinOrder) {
    if (userId !== currentHostId && presentUserIds.has(userId)) return userId;
  }
  return null;
}

/*
 * ================= РУЧНА СИНХРОНІЗАЦІЯ (IFRAME/MANUAL) =================
 *
 * Немає програмного керування чужим плеєром (вбудована сторінка або взагалі не вбудовується),
 * тож синхронізуємо не позицію, а МОМЕНТ: хост оголошує старт → усі бачать однаковий відлік
 * 3-2-1 за серверним годинником → у нуль кожен сам натискає play у себе. Той самий відлік
 * використовується і для "Продовжуємо" після паузи для всіх.
 */

export const MANUAL_PHASES = ['idle', 'countdown', 'running', 'paused'] as const;
export type ManualPhase = (typeof MANUAL_PHASES)[number];

/** 3-2-1: три секунди дають людям встигнути натиснути play рівно в момент "0". */
export const MANUAL_COUNTDOWN_MS = 3_000;

export type ManualSyncState = {
  phase: ManualPhase;
  /** Серверний час (мс), коли відлік дійде до нуля. `null` поза фазою countdown. */
  countdownEndsAtMs: number | null;
  readyUserIds: ReadonlySet<string>;
  /**
   * Скільки мс показ уже йшов сумарно ДО поточного відрізку running — заморожено під час paused,
   * щоб запізлілий учасник побачив коректний "Показ іде 12:34" з урахуванням попередніх пауз.
   */
  accumulatedMs: number;
  /** Серверний час (мс) початку поточного відрізку running. `null` поза фазою running. */
  runningSinceMs: number | null;
};

export function initialManualState(): ManualSyncState {
  return {
    phase: 'idle',
    countdownEndsAtMs: null,
    readyUserIds: new Set(),
    accumulatedMs: 0,
    runningSinceMs: null,
  };
}

/** Скидається щоразу, коли хост міняє відео — попередня готовність/відлік більше не мають сенсу. */
export function resetManualState(): ManualSyncState {
  return initialManualState();
}

export function manualSetReady(
  state: ManualSyncState,
  userId: string,
  ready: boolean,
): ManualSyncState {
  const next = new Set(state.readyUserIds);
  if (ready) next.add(userId);
  else next.delete(userId);
  return { ...state, readyUserIds: next };
}

/** Хтось вийшов із кімнати — його "готовність" більше не інформативна. */
export function manualDropReady(state: ManualSyncState, userId: string): ManualSyncState {
  if (!state.readyUserIds.has(userId)) return state;
  const next = new Set(state.readyUserIds);
  next.delete(userId);
  return { ...state, readyUserIds: next };
}

/** Хост натиснув "Почати" — лише з idle. `null` — команда зараз не має сенсу (вже почато). */
export function manualStart(state: ManualSyncState, nowMs: number): ManualSyncState | null {
  if (state.phase !== 'idle') return null;
  return { ...state, phase: 'countdown', countdownEndsAtMs: nowMs + MANUAL_COUNTDOWN_MS };
}

/** Хост натиснув "Пауза для всіх" — з running або просто щоб перервати відлік. */
export function manualPause(state: ManualSyncState, nowMs: number): ManualSyncState | null {
  if (state.phase !== 'running' && state.phase !== 'countdown') return null;
  // Заморожуємо накопичений час поточного відрізку running (якщо він був) — countdown, який
  // перервали, ще не встиг додати жодної секунди "показу", тож accumulatedMs не чіпаємо.
  const accumulatedMs =
    state.phase === 'running' && state.runningSinceMs !== null
      ? state.accumulatedMs + Math.max(0, nowMs - state.runningSinceMs)
      : state.accumulatedMs;
  return { ...state, phase: 'paused', countdownEndsAtMs: null, runningSinceMs: null, accumulatedMs };
}

/** Хост натиснув "Продовжуємо" — новий відлік 3-2-1, лише з paused. */
export function manualResume(state: ManualSyncState, nowMs: number): ManualSyncState | null {
  if (state.phase !== 'paused') return null;
  return { ...state, phase: 'countdown', countdownEndsAtMs: nowMs + MANUAL_COUNTDOWN_MS };
}

/** Відлік сам дійшов до нуля (серверний таймер) — countdown → running. */
export function manualCountdownElapsed(state: ManualSyncState): ManualSyncState | null {
  if (state.phase !== 'countdown') return null;
  // Якір "початку" цього відрізку — саме момент, коли відлік мав дійти до нуля (той самий
  // серверний час, під який усі клієнти вже підлаштували свій локальний "0"), а не момент,
  // коли спрацював цей таймер на сервері (він може спізнитись на кілька мс через event loop).
  const runningSinceMs = state.countdownEndsAtMs ?? Date.now();
  return { ...state, phase: 'running', countdownEndsAtMs: null, runningSinceMs };
}
