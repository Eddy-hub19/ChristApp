/**
 * Карта «Небесні тераси» (командний режим «Замки»): острови, що висять у повітрі, з'єднані мостами. Острів - об'єднання кіл,
 * міст - «капсула» навколо відрізка. Усе поза островами й мостами - порожнеча: клітина, що там довше fallMs, падає й відроджується
 * в замку. Карта дзеркальна відносно центра світу (овечий бік знизу, вовчий зверху), як і річкова. Клієнт отримує ці числа в welcome
 * й рахує ту саму чисту математику (flockCastles.ts). Тут же маршрутизація ботів по графу островів.
 */
export type Circle = [number, number, number];

export interface TerraceBridge {
  /** Індекси островів, які міст з'єднує, і кінці відрізка (всередині островів, трохи від краю). */
  a: number;
  b: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TerracesGeom {
  /** Острови: кожен - список кіл [x, y, r]. */
  islands: Circle[][];
  bridges: TerraceBridge[];
  /** Ширина мостів. */
  bw: number;
}

/** Половина карти (овечий бік, y > центра) й центральний острів; вовчий бік - дзеркало. Координати у світі 3400. */
const HALF: Circle[][] = [
  /* 0: замок овець */ [[1700, 3030, 340], [1500, 3070, 240], [1900, 3070, 240]],
  /* 1: ліво-низ */ [[760, 2700, 270], [640, 2790, 180]],
  /* 2: право-низ */ [[2640, 2700, 270], [2760, 2790, 180]],
  /* 3: середній */ [[1700, 2330, 210], [1560, 2370, 150], [1840, 2370, 150]],
  /* 4: ліво-середина */ [[800, 2000, 240], [930, 2090, 160]],
  /* 5: право-середина */ [[2600, 2000, 240], [2470, 2090, 160]],
];
const CENTER: Circle[] = [[1700, 1700, 300], [1500, 1700, 190], [1900, 1700, 190]];
/** Мости між островами половини (індекси в HALF) і з центром (-1 = центр). */
const HALF_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [1, 4], [2, 5],
];
const CENTER_EDGES: number[] = [3, 4, 5];

export const castleCenterOf = (c: Circle[]): [number, number] => [c[0][0], c[0][1]];

export function buildTerraces(world: number, bw: number): TerracesGeom {
  const islands: Circle[][] = [];
  for (const isl of HALF) islands.push(isl.map(([x, y, r]) => [x, y, r] as Circle));
  const centerIdx = islands.length;
  islands.push(CENTER.map(([x, y, r]) => [x, y, r] as Circle));
  const mirrorBase = islands.length;
  for (const isl of HALF) islands.push(isl.map(([x, y, r]) => [world - x, world - y, r] as Circle));
  const link = (a: number, b: number): TerraceBridge => {
    const [ax, ay, ar] = islands[a][0];
    const [bx, by, br] = islands[b][0];
    const d = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / d;
    const uy = (by - ay) / d;
    return { a, b, x1: ax + ux * (ar - 50), y1: ay + uy * (ar - 50), x2: bx - ux * (br - 50), y2: by - uy * (br - 50) };
  };
  const bridges: TerraceBridge[] = [];
  for (const [a, b] of HALF_EDGES) {
    bridges.push(link(a, b));
    bridges.push(link(mirrorBase + a, mirrorBase + b));
  }
  for (const a of CENTER_EDGES) {
    bridges.push(link(a, centerIdx));
    bridges.push(link(mirrorBase + a, centerIdx));
  }
  for (const b of bridges) {
    b.x1 = Math.round(b.x1);
    b.y1 = Math.round(b.y1);
    b.x2 = Math.round(b.x2);
    b.y2 = Math.round(b.y2);
  }
  return { islands, bridges, bw };
}

/** Відстань від точки до відрізка (і найближча точка на ньому). */
function toSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { d: number; x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const x = x1 + dx * t;
  const y = y1 + dy * t;
  return { d: Math.hypot(px - x, py - y), x, y };
}

/** Індекс острова, на якому стоїть точка (центр у колі), або -1. */
export function islandAt(g: TerracesGeom, x: number, y: number, pad = 0): number {
  for (let i = 0; i < g.islands.length; i++) {
    for (const [cx, cy, r] of g.islands[i]) if (Math.hypot(x - cx, y - cy) < r - pad) return i;
  }
  return -1;
}

export function onBridge(g: TerracesGeom, x: number, y: number, pad = 0): boolean {
  const half = g.bw / 2 - pad;
  for (const b of g.bridges) if (toSegment(x, y, b.x1, b.y1, b.x2, b.y2).d < half) return true;
  return false;
}

/** Є опора під центром клітини: острів або міст. */
export function onLand(g: TerracesGeom, x: number, y: number): boolean {
  return islandAt(g, x, y) >= 0 || onBridge(g, x, y);
}

/** Найближча точка опори (трохи углиб від краю), куди м'яко повертається клітина з порожнечі. */
export function nearestLand(g: TerracesGeom, x: number, y: number): { x: number; y: number } {
  let best = { d: Infinity, x, y };
  for (const isl of g.islands) {
    for (const [cx, cy, r] of isl) {
      const dist = Math.hypot(x - cx, y - cy) || 1;
      const d = Math.max(0, dist - (r - 14));
      if (d < best.d) best = { d, x: cx + ((x - cx) / dist) * Math.min(dist, r - 14), y: cy + ((y - cy) / dist) * Math.min(dist, r - 14) };
    }
  }
  for (const b of g.bridges) {
    const s = toSegment(x, y, b.x1, b.y1, b.x2, b.y2);
    const d = Math.max(0, s.d - (g.bw / 2 - 14));
    if (d < best.d) {
      const k = s.d || 1;
      const m = Math.min(s.d, g.bw / 2 - 14);
      best = { d, x: s.x + ((x - s.x) / k) * m, y: s.y + ((y - s.y) / k) * m };
    }
  }
  return { x: best.x, y: best.y };
}

/** Перевірка для кущів/декору: коло радіуса r з центром (x, y) цілком на острові з відступом pad. */
export function circleOnIsland(g: TerracesGeom, x: number, y: number, r: number, pad: number): boolean {
  const i = islandAt(g, x, y, r + pad);
  if (i < 0) return false;
  // має бути всередині одного з кіл цілком (а не на стику, де край ближче)
  for (const [cx, cy, cr] of g.islands[i]) if (Math.hypot(x - cx, y - cy) < cr - r - pad) return true;
  return false;
}

/**
 * Маршрут по графу островів: куди йти з (x, y), щоб потрапити в (tx, ty). Дейкстра по островах (їх 13), вага ребра = довжина моста
 * + штраф за кожну точку avoid (вороги) ближче 380 до кінців моста. Повертає точку, у яку цілитись.
 */
export function routeTerraces(
  g: TerracesGeom,
  x: number,
  y: number,
  tx: number,
  ty: number,
  avoid: readonly { x: number; y: number }[],
  out: { x: number; y: number },
  /** Зерно бота: невеликий відхил ваг мостів, щоб різні боти обирали різні маршрути (їх не ловлять усі в одному місці). */
  seed = 0,
) {
  out.x = tx;
  out.y = ty;
  const from = islandAt(g, x, y);
  const to = islandAt(g, tx, ty, -60) >= 0 ? islandAt(g, tx, ty, -60) : islandAt(g, tx, ty);
  if (to < 0) return;
  const n = g.islands.length;
  const cost = (b: TerraceBridge) => {
    let c = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) + (((b.x1 * 7 + b.y1 * 13 + seed * 131) | 0) % 5 + 5) % 5 * 60;
    for (const a of avoid) {
      if (Math.hypot(a.x - b.x1, a.y - b.y1) < 380 || Math.hypot(a.x - b.x2, a.y - b.y2) < 380) c += 700;
    }
    return c;
  };
  // дистанція до цілі від кожного острова (Дейкстра від цілі: граф неорієнтований)
  const dist = new Array<number>(n).fill(Infinity);
  dist[to] = 0;
  const done = new Array<boolean>(n).fill(false);
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (const b of g.bridges) {
      const v = b.a === u ? b.b : b.b === u ? b.a : -1;
      if (v < 0) continue;
      const nd = dist[u] + cost(b);
      if (nd < dist[v]) dist[v] = nd;
    }
  }
  if (from === to) return;
  if (from >= 0) {
    // на острові: найкращий міст з нього (ціна моста + дістатись до входу + шлях від іншого кінця)
    let best: TerraceBridge | null = null;
    let bestEnd: 1 | 2 = 1;
    let bc = Infinity;
    for (const b of g.bridges) {
      if (b.a !== from && b.b !== from) continue;
      const near = b.a === from ? 1 : 2;
      const other = b.a === from ? b.b : b.a;
      const px = near === 1 ? b.x1 : b.x2;
      const py = near === 1 ? b.y1 : b.y2;
      // лише вперед: сусід має бути ближче до цілі, ніж цей острів (інакше маршрут крутився б між островами)
      if (!(dist[other] < dist[from])) continue;
      const c = Math.hypot(px - x, py - y) + cost(b) + dist[other];
      if (c < bc) {
        bc = c;
        best = b;
        bestEnd = near;
      }
    }
    if (!best) return;
    const nx = bestEnd === 1 ? best.x1 : best.x2;
    const ny = bestEnd === 1 ? best.y1 : best.y2;
    const fx = bestEnd === 1 ? best.x2 : best.x1;
    const fy = bestEnd === 1 ? best.y2 : best.y1;
    // до входу на міст, а на самому мосту - до дальнього кінця
    if (Math.hypot(nx - x, ny - y) > 110) {
      out.x = nx;
      out.y = ny;
    } else {
      out.x = fx;
      out.y = fy;
    }
    return;
  }
  // на мосту: до того кінця, з якого ближче до цілі
  let bestB: TerraceBridge | null = null;
  let bd = Infinity;
  for (const b of g.bridges) {
    const s = toSegment(x, y, b.x1, b.y1, b.x2, b.y2);
    if (s.d < bd) {
      bd = s.d;
      bestB = b;
    }
  }
  if (!bestB) return;
  const c1 = Math.hypot(bestB.x1 - x, bestB.y1 - y) + dist[bestB.a];
  const c2 = Math.hypot(bestB.x2 - x, bestB.y2 - y) + dist[bestB.b];
  if (c1 < c2) {
    out.x = bestB.x1;
    out.y = bestB.y1;
  } else {
    out.x = bestB.x2;
    out.y = bestB.y2;
  }
}
