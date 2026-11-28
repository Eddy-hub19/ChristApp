/**
 * Режим «Лабіринт» на вебі: стан раунду для відмальовки й типові значення. Сама сітка, зіткнення й хеш - це точна копія серверних
 * `flock.maze.grid.ts` (flockMazeGrid.ts) і `flock.race.shared.ts` (flockRaceShared.ts) за контрактом docs/flock-maze.md:
 * клієнт будує ту саму сітку з seed раунду й `race.maze` із welcome (хеш звіряється з `maze.hash`) і рухається тією самою `moveInMaze`.
 */
import { buildMaze, cellAt, type MazeGrid, type MazeParams } from "./flockMazeGrid";

export * from "./flockMazeGrid";

/** Параметри раунду, що не входять у MazeParams, але потрібні відмальовці (з welcome: eat / hint / maze). */
export interface MazeExtras {
  /** Скільки мс клітина «розчиняється» і скільки мс захисту після відродження. */
  dissolveMs: number;
  protectMs: number;
  /** Через скільки мс від початку раунду показувати стрілку до фінішу (0 - вимкнена). */
  hintArrowAfterMs: number;
}

/** Типові значення (дзеркало серверного FLOCK_CONFIG.maze) - для підписів, поки не прийшов конфіг. Фінальні числа - з сервера. */
export const MAZE_DEFAULTS: Omit<MazeParams, "seed"> = {
  cols: 11,
  rows: 11,
  cell: 260,
  wall: 40,
  braid: 0.12,
  world: 3400,
  foodMin: 30,
  foodMax: 50,
  checkpoints: 3,
  pathMin: 32,
  pathMax: 56,
};
export const MAZE_EXTRAS_DEFAULTS: MazeExtras = { dissolveMs: 500, protectMs: 3000, hintArrowAfterMs: 0 };

/** Скільки гравців у гонці й межі раунду (для підписів). */
export const MAZE_UI = { maxPlayers: 6, roundMaxSec: 180, rewardRubies: 5, winsPerDay: 3 } as const;

/** Те, що рендеру потрібно знати про поточний раунд лабіринту; наповнюється склейкою з welcome та пакетів (`rr`, `rz`, `rv`). */
export interface MazeView {
  params: MazeParams;
  grid: MazeGrid;
  extras: MazeExtras;
  /** Відвідані клітини (мінікарта з туманом): `vis` із welcome + `nv` із тіків; markVisited дописує за власною позицією. */
  visited: Uint8Array;
  /** Які чекпоінти вже пройдено (запалені факели), довжина = grid.checkpoints.length. */
  lit: boolean[];
  /** Клітини, що розчиняються: pid -> час початку (у годиннику моделі `localNow`); захищені pid -> до якого часу. */
  dissolving: Map<number, number>;
  protectedUntil: Map<number, number>;
  /** Мс від початку гонки (для стрілки до фінішу; 0 - вимкнено через extras.hintArrowAfterMs). */
  roundMs: number;
}

export function createMazeView(params: MazeParams, extras: MazeExtras = MAZE_EXTRAS_DEFAULTS): MazeView {
  const grid = buildMaze(params);
  return {
    params,
    grid,
    extras,
    visited: new Uint8Array(grid.cols * grid.rows),
    lit: grid.checkpoints.map(() => false),
    dissolving: new Map(),
    protectedUntil: new Map(),
    roundMs: 0,
  };
}

/** Відмічає клітину під позицією відвіданою. */
export function markVisited(v: MazeView, x: number, y: number) {
  const i = cellAt(v.grid, x, y);
  if (i >= 0) v.visited[i] = 1;
}

/** Частка прозорості клітини, що розчиняється (1 -> 0 за dissolveMs). */
export function dissolveAlpha(ageMs: number, dissolveMs: number): number {
  return Math.max(0, 1 - ageMs / Math.max(1, dissolveMs));
}
