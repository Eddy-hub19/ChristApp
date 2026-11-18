import { FLOCK_CONFIG } from './flock.config';

const L = FLOCK_CONFIG.lava;

/** Міст через річку лави: безпечна смуга по x. */
export interface LavaBridge {
  x0: number;
  x1: number;
}

/** Річка лави на карті «Вулкан»: горизонтальна смуга [y0, y1] на всю ширину світу + мости. */
export interface LavaLayout {
  y0: number;
  y1: number;
  bridges: LavaBridge[];
}

/**
 * Створює річку посередині світу й випадково розставляє мости (кількість і проміжки з конфігу). Чиста функція від rng.
 * Якщо випадково розставити не вийшло (тісно), мости рівномірно розкладаються по ширині.
 */
export function generateLava(rng: () => number, world: number): LavaLayout {
  const h = world * L.riverFraction;
  const y0 = world / 2 - h / 2;
  const y1 = world / 2 + h / 2;
  const n = L.bridgesMin + Math.floor(rng() * (L.bridgesMax - L.bridgesMin + 1));
  const w = L.bridgeWidth;
  const lo = L.edgeMargin;
  const hi = world - L.edgeMargin - w;
  const xs: number[] = [];
  for (let attempt = 0; attempt < 200 && xs.length < n; attempt++) {
    const x = lo + rng() * (hi - lo);
    if (xs.every((o) => Math.abs(o - x) >= w + L.bridgeGap)) xs.push(x);
  }
  while (xs.length < n) {
    // запасний варіант: рівномірно
    xs.length = 0;
    for (let i = 0; i < n; i++) xs.push(lo + ((hi - lo) * (i + 0.5)) / n);
  }
  xs.sort((a, b) => a - b);
  return { y0, y1, bridges: xs.map((x) => ({ x0: x, x1: x + w })) };
}

/** Чи точка (центр клітини) у лаві: у смузі й поза мостом. Дешево: порівняння координати й перелік мостів. */
export function inLava(l: LavaLayout, x: number, y: number): boolean {
  if (y <= l.y0 || y >= l.y1) return false;
  for (const b of l.bridges) if (x >= b.x0 && x <= b.x1) return false;
  return true;
}

/**
 * Чи заборонена точка для появи об'єктів (їжа, кущі, бонуси, зірки, старт): лава плюс відступ margin від її краю;
 * міст дозволений, але з відступом margin від бічних країв (там лава поруч).
 */
export function lavaBlocked(l: LavaLayout, x: number, y: number, margin: number): boolean {
  if (y <= l.y0 - margin || y >= l.y1 + margin) return false;
  for (const b of l.bridges) {
    if (x >= b.x0 + margin && x <= b.x1 - margin) {
      // на мосту: заборонена лише смуга біля самих берегів-торців? ні, міст безпечний на всю довжину
      return false;
    }
  }
  return true;
}
