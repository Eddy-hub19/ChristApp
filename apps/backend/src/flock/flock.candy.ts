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

/** Шоколадне печиво-пліт: коло, на якому течія не діє. */
export interface RiverCookie {
  x: number;
  y: number;
  r: number;
}

/** Шоколадна ріка: горизонтальна смуга [y0, y1] на всю ширину світу; течія несе вздовж x (dir: 1 - вправо, -1 - вліво). */
export interface ChocolateRiver {
  y0: number;
  y1: number;
  dir: 1 | -1;
  cookies: RiverCookie[];
}

export interface CandyLayout {
  /** Шоколадна ріка з печеньками (null - вимкнена). */
  river: ChocolateRiver | null;
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

export interface RiverCfg {
  /** Ширина русла (світові одиниці). */
  width: number;
  /** Зсув осі русла від центра світу (мінімум понад пів-ширини, щоб центр лишався сухим): min..max. */
  offsetMin: number;
  offsetMax: number;
  /** «Броди»: ланцюжки печенек упоперек ріки. */
  fords: number;
  fordCookieRadius: readonly [number, number];
  /** Окремі печеньки, що плавають посеред ріки. */
  strays: number;
  strayRadius: readonly [number, number];
  /** Сила течії: частка стартової швидкості клітини й маса, при якій снос удвічі слабший. */
  strength: number;
  massHalf: number;
  /** На скільки центр клітини може зайти за край світу в руслі, перш ніж її віднесе (див. FLOCK_CONFIG.candy.river). */
  exitKillDepth: number;
}

export interface CandyCfg {
  river: RiverCfg;
  puddles: CandyZoneCfg;
  sticky: CandyZoneCfg;
  /** Радіус навколо центру світу без зон (там запасна точка появи). */
  centerClear: number;
  edgeMargin: number;
  /** Мінімальний проміжок між краями зон. */
  gap: number;
}

type Rng = () => number;

/** Річка зсунута від центра в випадковий бік; течія тече в випадковий бік; броди - рівномірно по ширині зі збитком, печеньки не перетинаються. */
export function generateRiver(rng: Rng, worldSize: number, cfg: RiverCfg): ChocolateRiver {
  const half = worldSize / 2;
  const off = cfg.offsetMin + rng() * (cfg.offsetMax - cfg.offsetMin);
  const yc = half + (rng() < 0.5 ? -off : off);
  const y0 = yc - cfg.width / 2;
  const y1 = yc + cfg.width / 2;
  const dir: 1 | -1 = rng() < 0.5 ? -1 : 1;
  const cookies: RiverCookie[] = [];
  const margin = 260;
  const span = worldSize - margin * 2;
  for (let i = 0; i < cfg.fords; i++) {
    // ланцюжок з усіх берегів до берега: печеньки з перекриттям, трохи зигзагом по x
    const baseX = margin + (span * (i + 0.5)) / cfg.fords + (rng() - 0.5) * (span / cfg.fords) * 0.5;
    let y = y0 + 20;
    let k = 0;
    while (y < y1 - 20) {
      const r = cfg.fordCookieRadius[0] + rng() * (cfg.fordCookieRadius[1] - cfg.fordCookieRadius[0]);
      const cy = Math.min(y1 - r * 0.4, y + r * 0.7);
      cookies.push({ x: Math.round(baseX + (k % 2 === 0 ? -1 : 1) * r * 0.35 * (0.5 + rng())), y: Math.round(cy), r: Math.round(r) });
      y = cy + r * 1.05;
      k++;
    }
  }
  let strays = 0;
  for (let attempt = 0; attempt < cfg.strays * 40 && strays < cfg.strays; attempt++) {
    const r = cfg.strayRadius[0] + rng() * (cfg.strayRadius[1] - cfg.strayRadius[0]);
    const x = margin + rng() * span;
    const y = y0 + r + rng() * (cfg.width - r * 2);
    if (cookies.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 12)) continue;
    cookies.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r) });
    strays++;
  }
  return { y0, y1, dir, cookies };
}

/** Випадкові зони при створенні арени: спершу липка карамель, потім калюжі; зони не перетинаються. */
export function generateCandy(rng: Rng, worldSize: number, cfg: CandyCfg): CandyLayout {
  const half = worldSize / 2;
  const lo = cfg.edgeMargin;
  const hi = worldSize - cfg.edgeMargin;
  const placed: CandyZone[] = [];
  const river = generateRiver(rng, worldSize, cfg.river);
  const make = (zc: CandyZoneCfg): CandyZone[] => {
    const out: CandyZone[] = [];
    const want = zc.min + Math.floor(rng() * (zc.max - zc.min + 1));
    for (let attempt = 0; attempt < want * 40 && out.length < want; attempt++) {
      const r = zc.radiusMin + rng() * (zc.radiusMax - zc.radiusMin);
      const x = lo + rng() * (hi - lo);
      const y = lo + rng() * (hi - lo);
      if (Math.hypot(x - half, y - half) < cfg.centerClear + r) continue;
      if (y > river.y0 - r - cfg.gap && y < river.y1 + r + cfg.gap) continue;
      if (placed.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + r + cfg.gap)) continue;
      const zone = { x: Math.round(x), y: Math.round(y), r: Math.round(r) };
      placed.push(zone);
      out.push(zone);
    }
    return out;
  };
  const sticky = make(cfg.sticky);
  const puddles = make(cfg.puddles);
  return { river, puddles, sticky, puddleSlow: cfg.puddles.slowFraction, stickySlow: cfg.sticky.slowFraction };
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

/** Центр точки в руслі (смуга по y на всю ширину світу), з відступом margin від берега. */
export function inRiverBand(river: ChocolateRiver, y: number, margin = 0): boolean {
  return y > river.y0 - margin && y < river.y1 + margin;
}

/** Точка на печеньці-плоті (з відступом: центр має бути ближче до центра печеньки на margin). */
export function onCookie(river: ChocolateRiver, x: number, y: number, margin = 0): boolean {
  for (const c of river.cookies) {
    const rr = c.r - margin;
    if (rr <= 0) continue;
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

/** Течія діє: центр клітини в руслі й не на печеньці. Дзеркалиться на клієнті (riverCurrentAt). */
export function inCurrent(river: ChocolateRiver, x: number, y: number): boolean {
  return inRiverBand(river, y) && !onCookie(river, x, y);
}

/** Для welcome: [x, y, r] і формула (клієнт рахує те саме через candyFactor). */
export function candyWelcome(
  layout: CandyLayout,
  river: { v0: number; massHalf: number; exitKillDepth: number },
  rain: { r: number; br: number; pending: { id: number; x: number; y: number; fall: number }[] },
) {
  const rv = layout.river;
  return {
    rain,
    river: rv ? { y0: rv.y0, y1: rv.y1, d: rv.dir, c: rv.cookies.map((c) => [c.x, c.y, c.r] as [number, number, number]), v0: river.v0, mh: river.massHalf, ed: river.exitKillDepth } : undefined,
    p: layout.puddles.map((z) => [z.x, z.y, z.r] as [number, number, number]),
    s: layout.sticky.map((z) => [z.x, z.y, z.r] as [number, number, number]),
    pf: layout.puddleSlow,
    sf: layout.stickySlow,
  };
}
