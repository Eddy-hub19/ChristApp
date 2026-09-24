/**
 * Чиста логіка стану плеєра «Кіношки» — без БД і сокетів, щоб її можна було покрити тестами.
 *
 * Модель: сервер зберігає «якір» — позицію на момент `updatedAtMs` (серверний час) і прапорець
 * `isPlaying`. Поточна позиція під час відтворення = position + (now − updatedAt).
 */

export const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

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
  videoId: string;
  isPlaying: boolean;
  positionSec: number;
  updatedAtMs: number;
};

export function isValidVideoId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_VIDEO_ID_RE.test(value);
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
  | { type: 'changeVideo'; videoId: string; startSec?: number }
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
