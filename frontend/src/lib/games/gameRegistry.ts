/**
 * Реєстр ігор для статусу «грає в …». Нова гра — один запис тут, один у
 * backend/src/chat/game-activity/game-activity.registry.ts (там же `joinable`/`maxPlayers`,
 * які сервер розраховує сам) і підпис у messages/*.json → chat.gameActivity.games.<id>.
 * Назва в реченні (з потрібним в/у і відмінком) лежить у перекладах, а не тут.
 */
export const GAME_REGISTRY = {
  doodle: { id: "doodle" },
  snake: { id: "snake" },
  filword: { id: "filword" },
  guess: { id: "guess" },
  puzzle: { id: "puzzle" },
} as const;

export type GameId = keyof typeof GAME_REGISTRY;

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && Object.hasOwn(GAME_REGISTRY, value);
}
