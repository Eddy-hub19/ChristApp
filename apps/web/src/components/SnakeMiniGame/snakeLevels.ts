/**
 * Реєстр рівнів Snake (клієнтська частина). Додати рівень = додати запис тут,
 * серверний опис — у backend/src/chat/snake-duel/snake-duel.levels.ts, переклади — `snake.level{N}Name/Desc`.
 *  - `classic`: рівень грається локально (як раніше);
 *  - `server`: гру веде сервер, клієнт малює стан (SnakeDuelBoard).
 */
export type SnakeLevelKind = "classic" | "server";

export type SnakeLevelDef = {
  id: number;
  kind: SnakeLevelKind;
  nameKey: string;
  descKey: string;
};

export const SNAKE_LEVELS: readonly SnakeLevelDef[] = [
  { id: 1, kind: "classic", nameKey: "level1Name", descKey: "level1Desc" },
  { id: 2, kind: "server", nameKey: "level2Name", descKey: "level2Desc" },
];

export function getSnakeLevel(id: number): SnakeLevelDef {
  return SNAKE_LEVELS.find((level) => level.id === id) ?? SNAKE_LEVELS[0];
}
