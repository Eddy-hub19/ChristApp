/**
 * Карта «Небо» на клієнті: дзеркало серверної геометрії (backend flock.sky.ts). Хмара - заокруглений прямокутник, що пливе в межах
 * своєї клітинки сітки; положення = формула від часу світу. У welcome - лише параметри, далі раз на кілька секунд подія `sy`
 * (годинник світу + хто з «Крильцями»), між ними час рахуємо за локальним годинником.
 */
export const SKY_MAP_ID = 6;

/** Параметри хмари з welcome: [cx, cy, hx, hy, ax, ay, px, py, fx, fy]. */
export interface SkyCloud {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  ax: number;
  ay: number;
  px: number;
  py: number;
  fx: number;
  fy: number;
}

export interface SkyWelcome {
  t: number;
  c: number[][];
  syncMs: number;
  grace: number;
  /** Множник швидкості з «Крильцями» (1.1). */
  wings?: number;
}

export interface SkyState {
  clouds: SkyCloud[];
  cell: number;
  cols: number;
  /** Час світу на момент якоря й локальний час (мс), коли він прийшов. */
  srv: number;
  local: number;
  graceMs: number;
  wingsSpeed: number;
  /** pid із «Крильцями» (подія `sy`). */
  wings: Set<number>;
}

const TAU = Math.PI * 2;

export function createSky(w: SkyWelcome, world: number, localNow: number): SkyState {
  const clouds = w.c.map((a) => ({ cx: a[0], cy: a[1], hx: a[2], hy: a[3], ax: a[4], ay: a[5], px: a[6], py: a[7], fx: a[8], fy: a[9] }));
  const cols = Math.max(1, Math.round(Math.sqrt(clouds.length)));
  return { clouds, cell: world / cols, cols, srv: w.t, local: localNow, graceMs: w.grace, wingsSpeed: w.wings ?? 1.1, wings: new Set() };
}

/** Час світу (мс) у локальний момент `localNow`. */
export const skyTime = (s: SkyState, localNow: number) => s.srv + (localNow - s.local);

export function cloudCenter(c: SkyCloud, t: number): [number, number] {
  return [c.cx + c.ax * Math.sin((TAU * t) / c.px + c.fx), c.cy + c.ay * Math.sin((TAU * t) / c.py + c.fy)];
}

function inRound(x: number, y: number, ox: number, oy: number, hx: number, hy: number, margin: number): boolean {
  const ex = hx - margin;
  const ey = hy - margin;
  if (ex <= 0 || ey <= 0) return false;
  const rad = Math.min(ex, ey) * 0.45;
  const dx = Math.abs(x - ox);
  const dy = Math.abs(y - oy);
  if (dx > ex || dy > ey) return false;
  const qx = dx - (ex - rad);
  const qy = dy - (ey - rad);
  if (qx <= 0 || qy <= 0) return true;
  return qx * qx + qy * qy <= rad * rad;
}

export function onCloud(s: SkyState, x: number, y: number, t: number, margin = 0): boolean {
  const gx = Math.min(s.cols - 1, Math.max(0, Math.floor(x / s.cell)));
  const gy = Math.min(s.cols - 1, Math.max(0, Math.floor(y / s.cell)));
  const c = s.clouds[gy * s.cols + gx];
  if (!c) return false;
  const [ox, oy] = cloudCenter(c, t);
  return inRound(x, y, ox, oy, c.hx, c.hy, margin);
}
