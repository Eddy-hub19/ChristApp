/** Скільки учасник може не заходити в застосунок, щоб ще вважатися активним (2 місяці). */
export const ACTIVE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Умова «активний» для адмінки: акаунт не вимкнено (`isActive`) і заходив за останні 2 місяці.
 * Хто ще жодного разу не заходив, рахується за датою реєстрації. Прапорець `isActive` у БД не змінюється:
 * він керує входом в акаунт.
 */
export function activeMemberWhere(now = Date.now()) {
  const since = new Date(now - ACTIVE_WINDOW_MS);
  return {
    isActive: true,
    OR: [{ lastSeenAt: { gte: since } }, { lastSeenAt: null, createdAt: { gte: since } }],
  };
}

export function isRecentlyActive(
  member: { isActive: boolean; lastSeenAt: Date | null; createdAt: Date },
  now = Date.now(),
): boolean {
  if (!member.isActive) return false;
  return now - (member.lastSeenAt ?? member.createdAt).getTime() < ACTIVE_WINDOW_MS;
}
