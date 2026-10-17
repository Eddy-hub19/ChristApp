import { isGameId, type GameId } from "@/lib/games/gameRegistry";

/**
 * Запрошення в парну гру в особистому чаті — звичайне TEXT-повідомлення з префіксом
 * `[[game-invite:<гра>]]` (як `[[flock-invite:N]]` і стікери): міграція БД не потрібна, сирий префікс
 * ніде не показуємо — списки чатів, пуші, цитати йдуть через `parseGameInvite`.
 */
export const GAME_INVITE_PREFIX = "[[game-invite:";
export const GAME_INVITE_SUFFIX = "]]";

/** Парні ігри, у які можна кликати з загального чату (Філворд — одиночна, «Отара» — спільна арена). */
export const PAIR_GAMES = ["snake", "doodle", "guess", "puzzle"] as const satisfies readonly GameId[];
export type PairGameId = (typeof PAIR_GAMES)[number];

export function isPairGame(value: unknown): value is PairGameId {
  return typeof value === "string" && (PAIR_GAMES as readonly string[]).includes(value);
}

export function buildGameInviteMessage(game: PairGameId): string {
  return `${GAME_INVITE_PREFIX}${game}${GAME_INVITE_SUFFIX}`;
}

export function parseGameInvite(rawContent: string | null | undefined): { game: PairGameId } | null {
  const m = /^\[\[game-invite:([a-z]{1,16})\]\]$/.exec((rawContent ?? "").trim());
  if (!m || !isGameId(m[1]) || !isPairGame(m[1])) return null;
  return { game: m[1] };
}
