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

export type SnakePhase =
  | "lobby"
  | "countdown"
  | "playing"
  | "roundEnd"
  | "paused"
  | "matchEnd";

export type DuelSnake = {
  body: Array<{ x: number; y: number }>;
  dir: Dir;
  alive: boolean;
};

export type DuelSnapshot = {
  board: { w: number; h: number };
  tickMs: number;
  winsToTake: number;
  round: number;
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
  classicRun: number;
  wins: Record<string, number>;
  countdown: number | null;
  /** undefined — раунд іде; null — нічия; id — переможець раунду. */
  roundWinner?: string | null;
  matchWinner: string | null;
  endReason: "score" | "disconnect" | null;
  pausedFor: string | null;
  graceMs: number;
  duel: DuelSnapshot | null;
  serverTime: number;
};

/**
 * Сокет гри — це той самий тип, що створює `io()` у socket.io-client (так само задано AppSocket у чаті). Власний «спрощений інтерфейс» ламав збірку:
 * `listener: (...args: never[]) => void` не сумісний із `(...args: any[]) => void` у реальному Socket.
 */
export type SnakeSocket = ReturnType<typeof createSocket>;
