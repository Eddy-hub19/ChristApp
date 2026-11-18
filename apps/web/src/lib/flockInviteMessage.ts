/**
 * Запрошення в «Отару» як звичайне TEXT-повідомлення з префіксом (як стікери й вірші):
 * `[[flock-invite:<арена>]]`. Міграція БД не потрібна. Сирий префікс ніде не показуємо:
 * списки чатів, пуші, цитати, копіювання - через `parseFlockInvite`.
 */
export const FLOCK_INVITE_PREFIX = "[[flock-invite:";
export const FLOCK_INVITE_SUFFIX = "]]";

export function buildFlockInviteMessage(arenaId: number | null): string {
  const id = arenaId && Number.isInteger(arenaId) && arenaId > 0 ? arenaId : 0;
  return `${FLOCK_INVITE_PREFIX}${id}${FLOCK_INVITE_SUFFIX}`;
}

/** `arenaId` = null, якщо арену не вказано (запрошення "в Отару взагалі"). */
export function parseFlockInvite(rawContent: string | null | undefined): { arenaId: number | null } | null {
  const text = (rawContent ?? "").trim();
  const m = /^\[\[flock-invite:(\d{1,9})\]\]$/.exec(text);
  if (!m) return null;
  const id = Number(m[1]);
  return { arenaId: id > 0 ? id : null };
}

export function flockInvitePath(arenaId: number | null): string {
  return arenaId ? `/games/flock?arena=${arenaId}` : "/games/flock";
}
