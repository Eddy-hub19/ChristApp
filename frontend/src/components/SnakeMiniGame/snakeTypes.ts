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

/** Мінімальний інтерфейс сокета, потрібний грі (сумісний із socket.io-client). */
export type SnakeSocket = {
  connected?: boolean;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
  off: (event: string, listener: (...args: never[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
};
