/**
 * Спільний код гоночних режимів «Отари» (Лабіринт, пізніше «Печерний забіг»): ЧИСТІ функції без імпортів.
 * Сервер і клієнт рахують однією формулою (клієнт передбачає рух і масу), тому цей файл копіюється на веб
 * (`apps/web/src/components/FlockMiniGame/flockRaceShared.ts`) без змін у логіці. Нічого тут не залежить від Node/DOM.
 */

/** Параметри руху (йдуть клієнту у `welcome.race.move`). */
export interface RaceMoveParams {
  /** speedOf(mass) = max(min, base * mass^exp) - та сама формула, що в звичайній «Отарі». */
  base: number;
  exp: number;
  min: number;
  radiusK: number;
  startMass: number;
  /** Швидкість ніколи не нижча за minFactor від стартової. */
  minFactor: number;
  dash: { mult: number; durationMs: number; cooldownMs: number };
}

export const radiusOfMass = (mass: number, radiusK: number) => radiusK * Math.sqrt(mass);

/** Швидкість (од/с) при powerу 1 без ривка. */
export function raceSpeed(mass: number, m: RaceMoveParams): number {
  const base = Math.max(m.min, m.base * Math.pow(mass, m.exp));
  const floor = m.minFactor * Math.max(m.min, m.base * Math.pow(m.startMass, m.exp));
  return Math.max(base, floor);
}

/** Стан ривка однієї клітини (мс). */
export interface DashState {
  /** Скільки ще триває ривок (0 - не активний). */
  leftMs: number;
  /** Скільки ще перезарядка (0 - готовий). */
  cdMs: number;
  /** Кнопка була натиснута на попередньому кроці (рух по фронту натискання). */
  held: boolean;
}

export const newDash = (): DashState => ({ leftMs: 0, cdMs: 0, held: false });

/**
 * Крок ривка: `want` - кнопка натиснута цього кроку. Ривок стартує по фронту натискання, коли готовий (cdMs == 0):
 * тоді leftMs = durationMs, cdMs = cooldownMs (відлік перезарядки з початку ривка).
 * Повертає множник швидкості на цей крок.
 */
export function stepDash(d: DashState, want: boolean, dtMs: number, m: RaceMoveParams): number {
  if (want && !d.held && d.cdMs <= 0 && d.leftMs <= 0) {
    d.leftMs = m.dash.durationMs;
    d.cdMs = m.dash.cooldownMs;
  }
  d.held = want;
  const active = d.leftMs > 0;
  d.leftMs = Math.max(0, d.leftMs - dtMs);
  d.cdMs = Math.max(0, d.cdMs - dtMs);
  return active ? m.dash.mult : 1;
}
