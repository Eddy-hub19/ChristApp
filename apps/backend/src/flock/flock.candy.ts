/**
 * «Цукеркова країна»: зони карамелі, що уповільнюють клітини. Створюються разом з ареною, не змінюються, один раз
 * йдуть клієнтам у `welcome` (поле `candy`); сервер і клієнт рахують уповільнення однією формулою (candyFactor).
 * Дві зони: карамельні калюжі (слабке уповільнення) і липка карамель (сильне; там не з'являються їжа, бонуси й гравці).
 * Зони не перетинаються, не в центрі світу й не біля країв. Нічого не вбивають. Усе дешево: до ~17 кіл, лінійна перевірка.
 */
export interface CandyZone {
  x: number;
  y: number;
  r: number;
}

export interface CandyLayout {
  /** Карамельні калюжі. */
  puddles: CandyZone[];
  /** Липка карамель. */
  sticky: CandyZone[];
  /** Уповільнення в калюжі й у липкій карамелі (частка швидкості, що втрачається). */
  puddleSlow: number;
  stickySlow: number;
}

export interface CandyZoneCfg {
  min: number;
  max: number;
  radiusMin: number;
  radiusMax: number;
  slowFraction: number;
}

export interface CandyCfg {
  puddles: CandyZoneCfg;
  sticky: CandyZoneCfg;
  /** Радіус навколо центру світу без зон (там запасна точка появи). */
  centerClear: number;
  edgeMargin: number;
  /** Мінімальний проміжок між краями зон. */
  gap: number;
}

type Rng = () => number;

/** Випадкові зони при створенні арени: спершу липка карамель, потім калюжі; зони не перетинаються. */
export function generateCandy(rng: Rng, worldSize: number, cfg: CandyCfg): CandyLayout {
  const half = worldSize / 2;
  const lo = cfg.edgeMargin;
  const hi = worldSize - cfg.edgeMargin;
  const placed: CandyZone[] = [];
  const make = (zc: CandyZoneCfg): CandyZone[] => {
    const out: CandyZone[] = [];
    const want = zc.min + Math.floor(rng() * (zc.max - zc.min + 1));
    for (let attempt = 0; attempt < want * 40 && out.length < want; attempt++) {
      const r = zc.radiusMin + rng() * (zc.radiusMax - zc.radiusMin);
      const x = lo + rng() * (hi - lo);
      const y = lo + rng() * (hi - lo);
      if (Math.hypot(x - half, y - half) < cfg.centerClear + r) continue;
      if (placed.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + r + cfg.gap)) continue;
      const zone = { x: Math.round(x), y: Math.round(y), r: Math.round(r) };
      placed.push(zone);
      out.push(zone);
    }
    return out;
  };
  const sticky = make(cfg.sticky);
  const puddles = make(cfg.puddles);
  return { puddles, sticky, puddleSlow: cfg.puddles.slowFraction, stickySlow: cfg.sticky.slowFraction };
}

/** Множник швидкості в точці: 1 - чисто; 1 - stickySlow у липкій карамелі; 1 - puddleSlow у калюжі. Формула дзеркалиться на клієнті. */
export function candyFactor(layout: CandyLayout, x: number, y: number): number {
  for (const z of layout.sticky) {
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy < z.r * z.r) return 1 - layout.stickySlow;
  }
  for (const z of layout.puddles) {
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy < z.r * z.r) return 1 - layout.puddleSlow;
  }
  return 1;
}

/** Точка в липкій карамелі (з запасом): туди не ставимо їжу, бонуси й точки появи. */
export function inSticky(layout: CandyLayout, x: number, y: number, margin = 0): boolean {
  for (const z of layout.sticky) {
    const rr = z.r + margin;
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

/** Точка в будь-якій зоні карамелі (з запасом): кущі туди не ставимо. */
export function inAnyCandy(layout: CandyLayout, x: number, y: number, margin = 0): boolean {
  return inSticky(layout, x, y, margin) || layout.puddles.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + margin);
}

/** Для welcome: [x, y, r] і формула (клієнт рахує те саме через candyFactor). */
export function candyWelcome(layout: CandyLayout) {
  return {
    p: layout.puddles.map((z) => [z.x, z.y, z.r] as [number, number, number]),
    s: layout.sticky.map((z) => [z.x, z.y, z.r] as [number, number, number]),
    pf: layout.puddleSlow,
    sf: layout.stickySlow,
  };
}
