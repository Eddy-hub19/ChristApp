/**
 * Карта «Зимовий мороз»: каток по центру. Клиент рахує тріщини під СВОЇМИ клітинами тією самою формулою, що сервер
 * (backend flock.ice.ts), і малює їх на катку; провал під лід вирішує сервер.
 */
const TAU = Math.PI * 2;

/** Каток із welcome: центр, радіус і параметри формули (mh - massHalf, rec - швидкість загоювання). */
export interface IceCfg {
  x: number;
  y: number;
  r: number;
  maxSec: number;
  minSec: number;
  mh: number;
  rec: number;
}

export function iceFallSec(mass: number, c: Pick<IceCfg, "maxSec" | "minSec" | "mh">): number {
  return Math.max(c.minSec, (c.maxSec * c.mh) / (c.mh + Math.max(0, mass)));
}

export function iceStep(level: number, onIce: boolean, mass: number, dt: number, c: IceCfg): number {
  return onIce ? Math.min(1, level + dt / iceFallSec(mass, c)) : Math.max(0, level - dt * c.rec);
}

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Каток s×s: холодний градієнт, світла кромка, відблиски й ледь помітні подряпини. */
export function paintIceRink(c: CanvasRenderingContext2D, s: number) {
  const h = s / 2;
  const R = h - 6;
  // тінь-сніг навколо
  c.fillStyle = "rgba(120,160,200,0.28)";
  c.beginPath();
  c.arc(h, h + 3, R + 4, 0, TAU);
  c.fill();
  const g = c.createRadialGradient(h * 0.85, h * 0.8, R * 0.1, h, h, R);
  g.addColorStop(0, "#f2fbff");
  g.addColorStop(0.7, "#cdeafb");
  g.addColorStop(1, "#a9d4f1");
  c.fillStyle = g;
  c.beginPath();
  c.arc(h, h, R, 0, TAU);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(h, h, R - 2, 0, TAU);
  c.clip();
  const r = rng(17);
  // подряпини від ковзання
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    c.lineWidth = 1 + r() * 2;
    const a = r() * TAU;
    const d = r() * R * 0.8;
    const x = h + Math.cos(a) * d;
    const y = h + Math.sin(a) * d;
    const len = R * (0.2 + r() * 0.4);
    const t = r() * TAU;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(t) * len * 0.5, y + Math.sin(t) * len * 0.5 + 6, x + Math.cos(t) * len, y + Math.sin(t) * len);
    c.stroke();
  }
  // відблиск
  c.fillStyle = "rgba(255,255,255,0.45)";
  c.beginPath();
  c.ellipse(h * 0.72, h * 0.6, R * 0.34, R * 0.1, -0.6, 0, TAU);
  c.fill();
  c.restore();
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 4;
  c.beginPath();
  c.arc(h, h, R - 1, 0, TAU);
  c.stroke();
  c.strokeStyle = "rgba(70,130,180,0.55)";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(h, h, R + 1, 0, TAU);
  c.stroke();
}

/** Мережа тріщин від центру (малюється з globalAlpha = рівень): головні промені з відгалуженнями. */
export function paintIceCracks(c: CanvasRenderingContext2D, s: number) {
  const h = s / 2;
  const R = h - 14;
  const r = rng(91);
  c.lineCap = "round";
  c.lineJoin = "round";
  const crack = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let cx = x;
    let cy = y;
    let ang = a;
    const steps = 6 + Math.floor(r() * 4);
    for (let i = 0; i < steps; i++) {
      const seg = len / steps;
      ang += (r() - 0.5) * 0.7;
      const nx = cx + Math.cos(ang) * seg;
      const ny = cy + Math.sin(ang) * seg;
      if (Math.hypot(nx - h, ny - h) > R) break;
      c.lineWidth = Math.max(1, w * (1 - i / steps * 0.5));
      c.strokeStyle = "rgba(50,100,150,0.9)";
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(nx, ny);
      c.stroke();
      c.lineWidth = Math.max(0.6, w * 0.35);
      c.strokeStyle = "rgba(235,248,255,0.9)";
      c.beginPath();
      c.moveTo(cx - 0.8, cy - 0.8);
      c.lineTo(nx - 0.8, ny - 0.8);
      c.stroke();
      cx = nx;
      cy = ny;
      if (depth < 2 && r() < 0.32) crack(cx, cy, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), len * 0.45, w * 0.6, depth + 1);
    }
  };
  const rays = 9;
  for (let i = 0; i < rays; i++) crack(h, h, (i / rays) * TAU + r() * 0.4, R * (0.8 + r() * 0.35), 4.5, 0);
}

/** Мініатюра: каток світло-блакитним колом. */
export function drawIceMinimap(ctx: CanvasRenderingContext2D, ice: IceCfg, size: number, world: number) {
  const k = size / world;
  ctx.fillStyle = "rgba(170,215,245,0.9)";
  ctx.beginPath();
  ctx.arc(ice.x * k, ice.y * k, Math.max(3, ice.r * k), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
}
