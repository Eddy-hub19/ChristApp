/**
 * Реєстр ігор для статусу «грає в …». Нова гра — один запис тут, один у
 * backend/src/chat/game-activity/game-activity.registry.ts (там же `joinable`/`maxPlayers`,
 * які сервер розраховує сам) і підпис у messages/*.json → chat.gameActivity.games.<id>.
 * Іконки (lucide + власна овечка) — у gameIcons.tsx; `emoji` лише для тексту превью/пушів.
 * Назва в реченні (з потрібним в/у і відмінком) лежить у перекладах, а не тут.
 */
export const GAME_REGISTRY = {
  doodle: { id: "doodle", emoji: "🦘" },
  snake: { id: "snake", emoji: "🐍" },
  filword: { id: "filword", emoji: "🔤" },
  guess: { id: "guess", emoji: "🕵️" },
  puzzle: { id: "puzzle", emoji: "🧩" },
  flock: { id: "flock", emoji: "🐑" },
} as const;

export type GameId = keyof typeof GAME_REGISTRY;

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && Object.hasOwn(GAME_REGISTRY, value);
}
