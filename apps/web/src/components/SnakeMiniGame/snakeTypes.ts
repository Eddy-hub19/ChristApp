import type createSocket from "socket.io-client";

export type Dir = "up" | "down" | "left" | "right";

export function isOppositeDir(a: Dir, b: Dir): boolean {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

/** Буфер керування Класики: до 2 поворотів у черзі, кожен перевіряється щодо останнього в черзі. */
export type ClassicInput = { queue: Dir[]; current: Dir };

export const CLASSIC_INPUT_BUFFER = 2;

export function createClassicInput(): ClassicInput {
  return { queue: [], current: "right" };
}

export function queueClassicDirection(input: ClassicInput, dir: Dir): void {
  const reference = input.queue.length ? input.queue[input.queue.length - 1] : input.current;
  if (dir === reference || isOppositeDir(dir, reference)) return;
  if (input.queue.length >= CLASSIC_INPUT_BUFFER) return;
  input.queue.push(dir);
}

export type SnakePhase =
  | "lobby"
  | "countdown"
  | "playing"
  | "paused"
  | "matchEnd";

export type DuelSnake = {
  body: Array<{ x: number; y: number }>;
  dir: Dir;
  alive: boolean;
  /** Скільки ще до відродження (мс); 0 — жива. */
  respawnInMs: number;
};

export type DuelSnapshot = {
  board: { w: number; h: number };
  tickMs: number;
  /** Скільки штучок треба з'їсти, щоб виграти матч. */
  targetScore: number;
  tick: number;
  food: { x: number; y: number };
  snakes: Record<string, DuelSnake>;
  obstacles: Array<{ x: number; y: number }>;
};

/** Стан сесії Snake від сервера (лобі + дуель): сервер — єдине джерело істини. */
export type SnakeSessionState = {
  roomId: string;
  players: [string, string];
  level: number;
  levels: number[];
  phase: SnakePhase;
  ready: Record<string, boolean>;
  present: Record<string, boolean>;
  /** Рахунок гонки до targetScore (штучок на гравця). */
  scores: Record<string, number>;
  countdown: number | null;
  matchWinner: string | null;
  endReason: "score" | "disconnect" | null;
  pausedFor: string | null;
  graceMs: number;
  /** Параметри Дуелі з серверного реєстру рівнів (для опису рівня в лобі). */
  duelConfig?: { targetScore: number; respawnSec: number } | null;
  duel: DuelSnapshot | null;
  serverTime: number;
};

/**
 * Сокет гри — це той самий тип, що створює `io()` у socket.io-client (так само задано AppSocket у чаті). Власний «спрощений інтерфейс» ламав збірку:
 * `listener: (...args: never[]) => void` не сумісний із `(...args: any[]) => void` у реальному Socket.
 */
export type SnakeSocket = ReturnType<typeof createSocket>;
