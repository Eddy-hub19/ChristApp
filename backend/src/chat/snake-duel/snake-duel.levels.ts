import type { Cell, DuelLevel } from './snake-duel.engine';

/**
 * Реєстр серверних рівнів Snake. Рівень 1 («Класика») працює на клієнті й тут не описується.
 * Новий рівень (перешкоди на карті, прискорення) — це ще один запис нижче:
 *   3: { id: 3, ..., obstacles: () => [...], tickMs: (tick) => Math.max(70, 120 - tick / 20) }
 */

export const CLASSIC_LEVEL_ID = 1;
export const DUEL_LEVEL_ID = 2;

const NO_OBSTACLES = (): Cell[] => [];

export const DUEL_LEVELS: Record<number, DuelLevel> = {
  [DUEL_LEVEL_ID]: {
    id: DUEL_LEVEL_ID,
    board: { w: 24, h: 16 },
    tickMs: () => 110,
    targetScore: 30,
    respawnMs: 3000,
    obstacles: NO_OBSTACLES,
    // Протилежні кути, різні рядки й дивляться «повз» одне одного — миттєвого зіткнення немає.
    spawns: () => [
      { head: { x: 4, y: 3 }, dir: 'right' },
      { head: { x: 19, y: 12 }, dir: 'left' },
    ],
  },
};

export function getDuelLevel(id: number): DuelLevel | undefined {
  return DUEL_LEVELS[id];
}

/** Усі доступні для вибору рівні (1 — клієнтський, решта — серверні). */
export const SELECTABLE_LEVEL_IDS: number[] = [
  CLASSIC_LEVEL_ID,
  ...Object.keys(DUEL_LEVELS).map(Number),
];
