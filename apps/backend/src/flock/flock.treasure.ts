/**
 * Карта «Острів скарбів» (FLOCK_MAPS, id 9): круглий острів (круг у центрі світу), вода за його межею й посередині сильна річка
 * на всю ширину острова з кількома мостами. Клітина, чий центр у воді (поза колом або в річці поза мостом), через sharkMs гине
 * (її з'їдає акула). Міст витримує лише клітини масою не більше bridgeMaxMass. Усе рахується за координатами: коло, смуга й
 * список мостів, без БД і без окремих сутностей. Клієнт дзеркалить ті самі функції (flockTreasure.ts); сервер авторитетний.
 */
export interface TreasureBridge {
  x0: number;
  x1: number;
}

export interface TreasureLayout {
  cx: number;
  cy: number;
  /** Радіус острова: поза колом вода. */
  r: number;
  /** Річка: смуга [y0, y1] на всю ширину острова. */
  y0: number;
  y1: number;
  bridges: TreasureBridge[];
}

export interface TreasureCfg {
  islandRadius: number;
  riverWidth: number;
  bridges: number;
  bridgeWidth: number;
  /** Мінімальна відстань між центрами мостів і відступ мосту від краю острова. */
  bridgeMinGap: number;
  bridgeEdgeMargin: number;
  /** Міст витримує клітину масою не більше цього значення. */
  bridgeMaxMass: number;
  /** Скільки мс у воді до того, як клітину з'їсть акула. */
  sharkMs: number;
  /** Швидкість виштовхування захищеної клітини з води (світових одиниць за с) і важкої з моста. */
  pushOutSpeed: number;
  /** Новачок цей час (мс від появи) у воді не гине (разом зі стартовим щитом і паузою). */
  newbieSafeMs: number;
  /** Відступ від води (від краю), у який не потрапляють їжа, кущі, бонуси, зірки й точки появи. */
  shoreMargin: number;
}

type Rng = () => number;

/** Створює острів: річка по центру, мости в випадкових місцях (не ближче bridgeMinGap один до одного й від краю острова). */
export function generateTreasure(rng: Rng, world: number, cfg: TreasureCfg): TreasureLayout {
  const cx = world / 2;
  const cy = world / 2;
  const y0 = cy - cfg.riverWidth / 2;
  const y1 = cy + cfg.riverWidth / 2;
  const half = cfg.bridgeWidth / 2;
  // по x міст має лежати в хорді острова на рівні річки (там її кінці), з відступом від берега
  const chord = Math.sqrt(Math.max(0, cfg.islandRadius ** 2 - (cfg.riverWidth / 2) ** 2));
  const lo = cx - chord + cfg.bridgeEdgeMargin + half;
  const hi = cx + chord - cfg.bridgeEdgeMargin - half;
  const centers: number[] = [];
  for (let attempt = 0; attempt < 400 && centers.length < cfg.bridges; attempt++) {
    const x = lo + rng() * (hi - lo);
    if (centers.every((c) => Math.abs(c - x) >= cfg.bridgeMinGap)) centers.push(x);
  }
  // запасний варіант: рівномірно, якщо випадково не вийшло
  while (centers.length < cfg.bridges) {
    centers.length = 0;
    for (let i = 0; i < cfg.bridges; i++) centers.push(lo + ((hi - lo) * (i + 0.5)) / cfg.bridges);
  }
  centers.sort((a, b) => a - b);
  return { cx, cy, r: cfg.islandRadius, y0, y1, bridges: centers.map((c) => ({ x0: c - half, x1: c + half })) };
}

/** Центр у смузі річки (по y; береги острова обмежує коло). */
export function inRiverBand(l: TreasureLayout, y: number): boolean {
  return y > l.y0 && y < l.y1;
}

/** Центр у створі моста (по x) - разом із inRiverBand це «на мосту». */
export function onBridge(l: TreasureLayout, x: number): boolean {
  for (const b of l.bridges) if (x >= b.x0 && x <= b.x1) return true;
  return false;
}

/** Поза островом (вода навколо). */
export function outsideIsland(l: TreasureLayout, x: number, y: number): boolean {
  return Math.hypot(x - l.cx, y - l.cy) >= l.r;
}

/** Вода, у якій клітину з'їдає акула: поза колом, або в річці поза мостом. */
export function inWater(l: TreasureLayout, x: number, y: number): boolean {
  if (outsideIsland(l, x, y)) return true;
  return inRiverBand(l, y) && !onBridge(l, x);
}

/**
 * Заборонена для об'єктів (їжа, кущі, бонуси, зірки, точки появи) точка: вода, міст і смуга біля води (margin),
 * тобто лише «твердий берег» не ближче margin від води й від мостів.
 */
export function treasureBlocked(l: TreasureLayout, x: number, y: number, margin: number): boolean {
  if (Math.hypot(x - l.cx, y - l.cy) > l.r - margin) return true;
  return y > l.y0 - margin && y < l.y1 + margin;
}

/** На якому березі точка: -1 північний (y менше річки), 1 південний, 0 - у смузі. */
export function bankOf(l: TreasureLayout, y: number): -1 | 0 | 1 {
  return y <= l.y0 ? -1 : y >= l.y1 ? 1 : 0;
}

/** Випадкова точка твердого берега (bank -1/1) не ближче margin від води: рівномірно по площі сегмента круга. */
export function randomBankPoint(l: TreasureLayout, rng: Rng, bank: -1 | 1, margin: number): [number, number] | null {
  const R = l.r - margin;
  for (let i = 0; i < 30; i++) {
    const x = l.cx + (rng() * 2 - 1) * R;
    // y: від краю кола до смуги річки (з відступом)
    const yMin = bank < 0 ? l.cy - R : l.y1 + margin;
    const yMax = bank < 0 ? l.y0 - margin : l.cy + R;
    if (yMax <= yMin) return null;
    const y = yMin + rng() * (yMax - yMin);
    if (!treasureBlocked(l, x, y, margin)) return [x, y];
  }
  return null;
}

/** Для welcome: усе, що клієнту потрібно, щоб малювати острів і рахувати воду тими самими формулами. */
export function treasureWelcome(l: TreasureLayout, cfg: Pick<TreasureCfg, 'bridgeMaxMass' | 'sharkMs' | 'shoreMargin' | 'pushOutSpeed'>) {
  return {
    cx: l.cx,
    cy: l.cy,
    r: l.r,
    y0: l.y0,
    y1: l.y1,
    b: l.bridges.map((b) => [Math.round(b.x0), Math.round(b.x1)] as [number, number]),
    maxMass: cfg.bridgeMaxMass,
    shark: cfg.sharkMs,
    shore: cfg.shoreMargin,
    push: cfg.pushOutSpeed,
  };
}
