/**
 * Карта «Ніч»: темний шар зі світлом навколо власної клітини, ореол «Вожака» і світлячки «Пляшки». Усе - кешовані спрайти:
 * шар темряви один радіальний спрайт (центр прозорий, м'який край), що масштабується під радіус світла; без shadowBlur
 * і без пересотворення на кадрі. Радіус світла рахує сервер, модель лише плавно його наздоганяє (flockModel.lightR).
 */
import type { FlockModel, RCell } from "./flockModel";

const TAU = Math.PI * 2;
const DARK = "3,6,18";
const DARK_ALPHA = 0.93;
const SPRITE_PX = 512;

let darkCv: HTMLCanvasElement | null = null;
let haloCv: HTMLCanvasElement | null = null;
let flyCv: HTMLCanvasElement | null = null;

function canvas(size: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  return cv;
}

/** Спрайт темряви: у центрі прозоро, повна темрява на краю (радіус спрайта = радіус світла). */
function darkSprite() {
  if (darkCv) return darkCv;
  const cv = canvas(SPRITE_PX);
  const c = cv.getContext("2d");
  if (c) {
    const h = SPRITE_PX / 2;
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, `rgba(${DARK},0)`);
    g.addColorStop(0.42, `rgba(${DARK},0)`);
    g.addColorStop(0.72, `rgba(${DARK},${DARK_ALPHA * 0.38})`);
    g.addColorStop(0.92, `rgba(${DARK},${DARK_ALPHA * 0.82})`);
    g.addColorStop(1, `rgba(${DARK},${DARK_ALPHA})`);
    c.fillStyle = g;
    c.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  }
  darkCv = cv;
  return cv;
}

/** Слабкий червонуватий ореол «Вожака» (видно на краю світла). */
function haloSprite() {
  if (haloCv) return haloCv;
  const cv = canvas(128);
  const c = cv.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(255,70,60,0.55)");
    g.addColorStop(0.45, "rgba(220,40,50,0.22)");
    g.addColorStop(1, "rgba(200,30,40,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  haloCv = cv;
  return cv;
}

/** Світлячок: тепле жовто-зелене сяйво з яскравою точкою. */
function fireflySprite() {
  if (flyCv) return flyCv;
  const cv = canvas(64);
  const c = cv.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,200,1)");
    g.addColorStop(0.18, "rgba(200,255,120,0.85)");
    g.addColorStop(0.55, "rgba(140,255,120,0.22)");
    g.addColorStop(1, "rgba(120,255,120,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  }
  flyCv = cv;
  return cv;
}

/** Темний шар поверх сцени (екранні координати, трансформ = dpr): спрайт під радіус світла + заливка решти екрана. */
export function drawDarkness(ctx: CanvasRenderingContext2D, m: FlockModel, W: number, H: number, scale: number, reduce: boolean) {
  const R = m.lightR * (reduce ? 1 : m.lightPulse()) * scale;
  const fill = `rgba(${DARK},${DARK_ALPHA})`;
  if (!m.alive || R < 4) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const sx = W / 2 + (m.lightX - m.camX) * scale;
  const sy = H / 2 + (m.lightY - m.camY) * scale;
  ctx.drawImage(darkSprite(), sx - R, sy - R, R * 2, R * 2);
  ctx.fillStyle = fill;
  // решта екрана за межею спрайта: чотири прямокутники
  if (sy - R > 0) ctx.fillRect(0, 0, W, sy - R);
  if (sy + R < H) ctx.fillRect(0, sy + R, W, H - (sy + R));
  const y0 = Math.max(0, sy - R);
  const y1 = Math.min(H, sy + R);
  if (sx - R > 0) ctx.fillRect(0, y0, sx - R, y1 - y0);
  if (sx + R < W) ctx.fillRect(sx + R, y0, W - (sx + R), y1 - y0);
}

/**
 * Поверх темряви (світові координати): ореол «Вожака» (і сам він, коли поза світлом) та світлячки «Пляшки» навколо власної клітини.
 * `redraw` малює клітину ще раз (вона була під темним шаром).
 */
export function drawNightTop(ctx: CanvasRenderingContext2D, m: FlockModel, cells: RCell[], scale: number, time: number, reduce: boolean, isBoss: (pid: number) => boolean, redraw: (c: RCell) => void) {
  for (const c of cells) {
    if (!isBoss(c.pid)) continue;
    const r = m.radiusOf(c.mass);
    const d = Math.hypot(c.x - m.lightX, c.y - m.lightY);
    const s = r * 4.2;
    ctx.drawImage(haloSprite(), c.x - s / 2, c.y - s / 2, s, s);
    // за межею світла сама клітина лишається під темрявою - малюємо її приглушено поверх
    if (d > m.lightR * 0.7) {
      ctx.globalAlpha = 0.55;
      redraw(c);
      ctx.globalAlpha = 1;
    }
  }
  if (m.alive && m.hasEffect("jar")) {
    const R = Math.max(40, m.lightR * 0.55);
    const n = 8;
    const sz = Math.max(10 / scale, 16);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (reduce ? 0 : time * (0.25 + (i % 3) * 0.08) * (i % 2 ? 1 : -1));
      const rr = R * (0.4 + 0.55 * (((i * 37) % 10) / 10)) + (reduce ? 0 : Math.sin(time * 1.3 + i * 1.7) * R * 0.06);
      const x = m.lightX + Math.cos(a) * rr;
      const y = m.lightY + Math.sin(a) * rr;
      ctx.globalAlpha = reduce ? 0.85 : 0.55 + 0.4 * Math.sin(time * 2.4 + i * 2.1) ** 2;
      ctx.drawImage(fireflySprite(), x - sz, y - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
  }
}
