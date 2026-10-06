/**
 * Реєстр ігор, які показуються в чаті як «грає в …».
 * Нова гра — один запис нижче (+ один запис у frontend/src/lib/games/gameRegistry.ts і переклади).
 *
 * `maxPlayers` — скільки людей може бути в одній сесії; коли місць нема, кнопка «Приєднатися» зникає.
 * `joinable: false` — одиночна гра: статус показуємо, але приєднатися до неї не можна.
 */
export type GameActivityDef = {
  id: string;
  joinable: boolean;
  maxPlayers: number;
  /**
   * Режими гри (наприклад, Snake: «classic» / «duel»). Місця рахуються в межах режиму:
   * «Приєднатися» до Дуелі є, поки друге місце в ній вільне, а до Класики — завжди, коли вона не зайнята обома.
   */
  modes?: readonly string[];
};

export const GAME_ACTIVITY_REGISTRY: Record<string, GameActivityDef> = {
  doodle: { id: 'doodle', joinable: true, maxPlayers: 2 },
  snake: {
    id: 'snake',
    joinable: true,
    maxPlayers: 2,
    modes: ['classic', 'duel'],
  },
  filword: { id: 'filword', joinable: false, maxPlayers: 1 },
};

export function getGameActivityDef(id: unknown): GameActivityDef | undefined {
  return typeof id === 'string' && Object.hasOwn(GAME_ACTIVITY_REGISTRY, id)
    ? GAME_ACTIVITY_REGISTRY[id]
    : undefined;
}

/** Режим гри з клієнта; невідомий чи для гри без режимів — undefined. */
export function parseGameActivityMode(
  game: string,
  mode: unknown,
): string | undefined {
  const def = getGameActivityDef(game);
  return typeof mode === 'string' && def?.modes?.includes(mode)
    ? mode
    : undefined;
}
