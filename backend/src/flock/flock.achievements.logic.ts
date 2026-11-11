import type { Prisma } from '@prisma/client';
import { FLOCK_CONFIG, NUM_SKINS, isHiddenSkin, isSelectableSkin, isSpecialSkin } from './flock.config';
import { shiftDayKey } from './flock.time';

const A = FLOCK_CONFIG.achievements;

/** Особливі скіни, що зараз у продажу (без знятих HIDDEN_SKINS і тих, що не можна обрати): їх треба купити для досягнення. */
export function specialsOnSale(): number[] {
  const out: number[] = [];
  for (let id = 0; id < NUM_SKINS; id++) if (isSelectableSkin(id) && isSpecialSkin(id) && !isHiddenSkin(id)) out.push(id);
  return out;
}

/** Скільки з особливих у продажу гравець купив САМ за рубіни (price > 0: видача адміном і нагороди пишуться з ціною 0). */
export async function ownSpecialsBought(
  tx: Pick<Prisma.TransactionClient, 'flockSkinPurchase'>,
  userId: string,
): Promise<{ have: number; total: number }> {
  const ids = specialsOnSale();
  if (ids.length === 0) return { have: 0, total: 0 };
  const have = await tx.flockSkinPurchase.count({ where: { userId, skinId: { in: ids }, price: { gt: 0 } } });
  return { have, total: ids.length };
}

/**
 * Після покупки особливого скіна: якщо куплені всі, що в продажу, запам'ятовуємо це назавжди (specialsDone).
 * Тоді новий особливий скін, що з'явиться пізніше, досягнення не «забирає», а нагороду вдруге не дає (ключ `specials` унікальний).
 */
export async function latchSpecialsInTx(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  if (!A.enabled || !A.specials.enabled) return false;
  const { have, total } = await ownSpecialsBought(tx, userId);
  if (total === 0 || have < total) return false;
  await tx.flockAchievementState.upsert({ where: { userId }, create: { userId, specialsDone: true }, update: { specialsDone: true } });
  return true;
}

export interface StreakState {
  streakCount: number;
  streakLastDay: string | null;
}

/** Зарахувати добу `day` (за Києвом) у серію: вже зарахована - без змін; вчора була - +1; пропуск - з одиниці; готова серія чекає «Забрати». */
export function streakCountDay<T extends StreakState>(st: T, day: string, days: number = A.streak.days): T {
  if (st.streakLastDay === day) return st;
  if (st.streakCount >= days) return st;
  const next = st.streakLastDay === shiftDayKey(day, -1) ? st.streakCount + 1 : 1;
  return { ...st, streakCount: Math.min(days, next), streakLastDay: day };
}

/** Серія, яку бачить гравець сьогодні: пропущена доба обнуляє незавершену серію (готова, але не забрана, не згорає). */
export function streakShown(st: StreakState, today: string, days: number = A.streak.days): number {
  if (st.streakCount >= days) return days;
  if (!st.streakLastDay) return 0;
  return st.streakLastDay >= shiftDayKey(today, -1) ? st.streakCount : 0;
}
