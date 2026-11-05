/**
 * Карта «Небо»: світ - небо, ходити можна лише по хмарах-платформах. Хмари плавно пливуть, але строго всередині своєї клітинки
 * сітки: тому вони НІКОЛИ не перетинаються й не виходять за межі світу. Положення хмари - формула від часу світу `t` (мс) і номера хмари;
 * у `welcome` йдуть лише параметри (раз), позицій на кожен тік немає. Клієнт рахує за тією самою формулою (дзеркало: frontend flockSky.ts).
 *
 * Розкладка (їжа, кущі, бонуси, точки появи) ставиться лише в «ядро» хмари - прямокутник, що завжди під хмарою за будь-якого `t`,
 * тож ніщо не «пливе» у порожнечу разом із хмарою, що їде.
 */
import type { Rng } from './flock.engine';

/** Хмара: центр (cx, cy), півсторони (hx, hy), амплітуди зсуву (ax, ay), періоди (мс) і фази. Числа округлені - однакові з обох боків. */
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

export interface SkyLayout {
  clouds: SkyCloud[];
  /** Сторона клітинки сітки (хмара живе всередині неї). */
  cell: number;
}

export interface SkyCfg {
  /** Клітинок на сторону сітки (cols x cols хмар). */
  cols: number;
  /** Частка клітинки, яку займає хмара: мін-макс (півсторона = частка * cell / 2). */
  fillMin: number;
  fillMax: number;
  /** Мінімальний зазор між хмарою й межею своєї клітинки (з обох сторін разом із сусідом = мінімальний просвіт). */
  edgeGap: number;
  /** Період плавання (мс): мін-макс. */
  periodMinMs: number;
  periodMaxMs: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function generateSky(rng: Rng, worldSize: number, cfg: SkyCfg): SkyLayout {
  const cell = worldSize / cfg.cols;
  const clouds: SkyCloud[] = [];
  for (let gy = 0; gy < cfg.cols; gy++) {
    for (let gx = 0; gx < cfg.cols; gx++) {
      const mid = (v: number) => (v + 0.5) * cell;
      const fillX = cfg.fillMin + rng() * (cfg.fillMax - cfg.fillMin);
      const fillY = cfg.fillMin + rng() * (cfg.fillMax - cfg.fillMin);
      const hx = r1((fillX * cell) / 2);
      const hy = r1((fillY * cell) / 2);
      // вільне місце всередині клітинки мінус зазор; хмара пливе в його межах (часом майже стоїть)
      const freeX = Math.max(0, cell / 2 - hx - cfg.edgeGap);
      const freeY = Math.max(0, cell / 2 - hy - cfg.edgeGap);
      clouds.push({
        cx: r1(mid(gx)),
        cy: r1(mid(gy)),
        hx,
        hy,
        ax: r1(freeX * (0.6 + rng() * 0.4)),
        ay: r1(freeY * (0.6 + rng() * 0.4)),
        px: Math.round(cfg.periodMinMs + rng() * (cfg.periodMaxMs - cfg.periodMinMs)),
        py: Math.round(cfg.periodMinMs + rng() * (cfg.periodMaxMs - cfg.periodMinMs)),
        fx: r1(rng() * Math.PI * 2),
        fy: r1(rng() * Math.PI * 2),
      });
    }
  }
  return { clouds, cell };
}

const TAU = Math.PI * 2;

/** Центр хмари в момент t (мс). */
export function cloudCenter(c: SkyCloud, t: number): [number, number] {
  return [c.cx + c.ax * Math.sin((TAU * t) / c.px + c.fx), c.cy + c.ay * Math.sin((TAU * t) / c.py + c.fy)];
}

/** Точка (x, y) усередині заокругленого прямокутника (півсторони hx, hy) з центром (ox, oy); `margin` звужує прямокутник. */
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

/** Чи стоїть точка на якійсь хмарі в момент t (margin > 0 - з відступом усередину від краю). */
export function onCloud(l: SkyLayout, x: number, y: number, t: number, margin = 0): boolean {
  // хмара живе у своїй клітинці: перевіряємо лише її й найближчих сусідів за індексом клітинки
  const cols = Math.round(l.clouds.length ** 0.5);
  const gx = Math.min(cols - 1, Math.max(0, Math.floor(x / l.cell)));
  const gy = Math.min(cols - 1, Math.max(0, Math.floor(y / l.cell)));
  const c = l.clouds[gy * cols + gx];
  if (!c) return false;
  const [ox, oy] = cloudCenter(c, t);
  return inRound(x, y, ox, oy, c.hx, c.hy, margin);
}

/** «Ядро» хмари: частина, що завжди під хмарою за будь-якого t. Лише тут ставимо їжу, кущі, бонуси й точки появи. */
export function inCore(l: SkyLayout, x: number, y: number, margin = 0): boolean {
  const cols = Math.round(l.clouds.length ** 0.5);
  const gx = Math.min(cols - 1, Math.max(0, Math.floor(x / l.cell)));
  const gy = Math.min(cols - 1, Math.max(0, Math.floor(y / l.cell)));
  const c = l.clouds[gy * cols + gx];
  if (!c) return false;
  return inRound(x, y, c.cx, c.cy, c.hx - c.ax, c.hy - c.ay, margin);
}

/** Випадкова точка ядра випадкової хмари (відступ margin від краю ядра). */
export function randomCorePoint(l: SkyLayout, rng: Rng, margin = 0): [number, number] | null {
  for (let i = 0; i < 12; i++) {
    const c = l.clouds[Math.floor(rng() * l.clouds.length)];
    const ex = c.hx - c.ax - margin;
    const ey = c.hy - c.ay - margin;
    if (ex <= 0 || ey <= 0) continue;
    const x = c.cx + (rng() * 2 - 1) * ex;
    const y = c.cy + (rng() * 2 - 1) * ey;
    if (inCore(l, x, y, margin)) return [x, y];
  }
  return null;
}

/** Найближча точка найближчої хмари (у момент t) до (x, y): куди м'яко повертати того, хто опинився над порожнечею. */
export function nearestCloudPoint(l: SkyLayout, x: number, y: number, t: number, margin = 0): [number, number] {
  let best: [number, number] = [x, y];
  let bestD = Infinity;
  for (const c of l.clouds) {
    const [ox, oy] = cloudCenter(c, t);
    const ex = Math.max(0, c.hx - margin - 20);
    const ey = Math.max(0, c.hy - margin - 20);
    const px = Math.min(ox + ex, Math.max(ox - ex, x));
    const py = Math.min(oy + ey, Math.max(oy - ey, y));
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bestD) {
      bestD = d;
      best = [px, py];
    }
  }
  return best;
}
