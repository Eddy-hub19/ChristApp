import { cloudCenter, onCloud, skyTime, type SkyCloud, type SkyState } from "./flockSky";
import type { FlockModel } from "./flockModel";

/**
 * Малювання карти «Небо»: небо-фон, далекі хмаринки (паралакс), хмари-платформи, хмарний бордюр замість загорожі, мінікарта,
 * анімація «сорвался», попередження біля просвіту, крильця. Усе - з кешованих спрайтів (offscreen canvas), без shadowBlur на кадр;
 * палітра не залежить від теми застосунку.
 */
const TAU = Math.PI * 2;
export const SKY_BG = "#8ec9f6";
export const SKY_OUT = "#6fb2ea";

function mk(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

const quant = (pxPerUnit: number) => Math.max(0.15, Math.min(1.5, Math.round(pxPerUnit * 4) / 4));

// ---------- хмара-платформа ----------
const cloudCache = new Map<string, HTMLCanvasElement>();
const PAD = 40;

/** Спрайт хмари (hx x hy півсторін) у масштабі q: тінь, пухнасте тіло в межах хітбокса, світла й тіньова сторони. */
function cloudSprite(hx: number, hy: number, q: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${hx}|${hy}|${q}`;
  const hit = cloudCache.get(key);
  if (hit) return hit;
  const w = hx * 2 + PAD * 2;
  const h = hy * 2 + PAD * 2;
  const cv = mk(w * q, h * q);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.scale(q, q);
  c.translate(PAD + hx, PAD + hy);
  const rad = Math.min(hx, hy) * 0.45;
  const body = (grow: number) => {
    c.beginPath();
    c.roundRect(-hx - grow, -hy - grow, (hx + grow) * 2, (hy + grow) * 2, rad + grow);
  };
  // м'яка тінь під хмарою (на небі)
  c.fillStyle = "rgba(60,110,170,0.28)";
  c.save();
  c.translate(10, 22);
  body(4);
  c.fill();
  c.restore();
  // пухнастий край: кулі вздовж периметру (центри трохи всередину, тому вигляд ≈ хітбоксу)
  const bump = Math.max(48, Math.min(hx, hy) * 0.2);
  const pts: [number, number][] = [];
  const per = (hx + hy) * 4;
  const n = Math.round(per / (bump * 1.05));
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 4;
    const side = Math.floor(t);
    const f = t - side;
    const ix = hx - bump * 0.75;
    const iy = hy - bump * 0.75;
    let x: number;
    let y: number;
    if (side === 0) [x, y] = [-ix + f * 2 * ix, -iy];
    else if (side === 1) [x, y] = [ix, -iy + f * 2 * iy];
    else if (side === 2) [x, y] = [ix - f * 2 * ix, iy];
    else [x, y] = [-ix, iy - f * 2 * iy];
    pts.push([x, y]);
  }
  c.fillStyle = "#f2f8ff";
  for (const [x, y] of pts) {
    c.beginPath();
    c.arc(x, y, bump * (0.85 + 0.3 * ((Math.abs((x * 7 + y * 13) | 0) % 5) / 4)), 0, TAU);
    c.fill();
  }
  c.fillStyle = "#ffffff";
  body(-bump * 0.6);
  c.fill();
  // тіньова нижня-права сторона й світла верхня-ліва
  const g = c.createLinearGradient(-hx, -hy, hx, hy);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.55, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(160,200,240,0.55)");
  c.fillStyle = g;
  c.save();
  body(bump * 0.5);
  c.clip();
  c.fillRect(-hx - bump, -hy - bump, hx * 2 + bump * 2, hy * 2 + bump * 2);
  c.restore();
  // кілька великих м'яких «клубів» на поверхні (світліші плями)
  c.fillStyle = "rgba(255,255,255,0.55)";
  for (const [fx, fy, k] of [[-0.35, -0.3, 0.3], [0.3, -0.15, 0.24], [-0.1, 0.3, 0.26]] as const) {
    c.beginPath();
    c.arc(fx * hx, fy * hy, Math.min(hx, hy) * k, 0, TAU);
    c.fill();
  }
  cloudCache.set(key, cv);
  return cv;
}

// ---------- далекі хмаринки (декор, паралакс) ----------
let farCv: HTMLCanvasElement | null = null;
function farSprite() {
  if (farCv || typeof document === "undefined") return farCv;
  const cv = mk(256, 128);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.fillStyle = "#ffffff";
  for (const [x, y, r] of [[60, 80, 38], [110, 62, 52], [170, 76, 42], [210, 88, 28], [100, 92, 36], [150, 96, 34]]) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  farCv = cv;
  return cv;
}

/** Фон неба: далекі хмаринки пливуть повільніше за камеру (паралакс) і дрейфують із часом. Малюється у світових координатах. */
function drawFarClouds(ctx: CanvasRenderingContext2D, m: FlockModel, x0: number, x1: number, y0: number, y1: number, time: number) {
  const spr = farSprite();
  if (!spr) return;
  const span = 5200;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 14; i++) {
    const bx = ((i * 1237) % span) - 800;
    const by = (((i * 911) % span) - 800);
    const k = 0.55;
    const sz = 380 + ((i * 53) % 260);
    const drift = time * (6 + (i % 5) * 2);
    // паралакс: зміщення від камери
    const px = ((((bx + drift - m.camX * k) % span) + span) % span) + m.camX - span / 2;
    const py = ((((by - m.camY * k) % span) + span) % span) + m.camY - span / 2;
    if (px + sz < x0 || px - sz > x1 || py + sz < y0 || py - sz > y1) continue;
    ctx.drawImage(spr, px - sz / 2, py - sz / 4, sz, sz / 2);
  }
  ctx.globalAlpha = 1;
}

/** Небо у межах світу + хмари-платформи у їхніх поточних положеннях. */
export function drawSkyWorld(ctx: CanvasRenderingContext2D, m: FlockModel, s: SkyState, x0: number, x1: number, y0: number, y1: number, pxPerUnit: number, time: number) {
  const world = m.cfg.world;
  ctx.fillStyle = SKY_BG;
  ctx.fillRect(0, 0, world, world);
  drawFarClouds(ctx, m, x0, x1, y0, y1, time);
  const t = skyTime(s, m.localNow);
  const q = quant(pxPerUnit);
  for (const c of s.clouds) {
    const [ox, oy] = cloudCenter(c, t);
    if (ox + c.hx + PAD < x0 || ox - c.hx - PAD > x1 || oy + c.hy + PAD < y0 || oy - c.hy - PAD > y1) continue;
    const spr = cloudSprite(c.hx, c.hy, q);
    if (!spr) continue;
    ctx.drawImage(spr, ox - c.hx - PAD, oy - c.hy - PAD, c.hx * 2 + PAD * 2, c.hy * 2 + PAD * 2);
  }
}

// ---------- хмарний бордюр замість загорожі ----------
const TILE = 240;
const BORDER_H = 90;
const borderCache = new Map<number, HTMLCanvasElement>();
function borderTile(q: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const hit = borderCache.get(q);
  if (hit) return hit;
  const cv = mk(TILE * q, BORDER_H * q);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.scale(q, q);
  const puff = (x: number, y: number, r: number, col: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  };
  // тінь знизу, білий пухнастий ряд, світла верхівка (краї тайла зшиваються: кулі циклічні)
  const spec: [number, number][] = [[0, 44], [60, 34], [120, 46], [180, 36], [240, 44]];
  for (const [x, r] of spec) puff(x, BORDER_H - 36 + 8, r, "rgba(70,120,180,0.35)");
  for (const [x, r] of spec) puff(x, BORDER_H - 36, r, "#e9f3ff");
  for (const [x, r] of spec) puff(x - 4, BORDER_H - 42, r * 0.8, "#ffffff");
  borderCache.set(q, cv);
  return cv;
}

/** Хмарний бордюр по периметру світу (кешований тайл, лише видима частина): внутрішній край - на межі поля. */
export function drawCloudBorder(ctx: CanvasRenderingContext2D, world: number, x0: number, x1: number, y0: number, y1: number, pxPerUnit: number) {
  const tile = borderTile(quant(pxPerUnit));
  if (!tile) return;
  const a = Math.floor(Math.max(x0, -TILE) / TILE) * TILE;
  const b = Math.min(x1, world + TILE);
  if (y0 < BORDER_H) for (let p = a; p < b; p += TILE) ctx.drawImage(tile, p, -BORDER_H + 24, TILE, BORDER_H);
  if (y1 > world - BORDER_H) {
    ctx.save();
    ctx.translate(0, world);
    ctx.scale(1, -1);
    for (let p = a; p < b; p += TILE) ctx.drawImage(tile, p, -BORDER_H + 24, TILE, BORDER_H);
    ctx.restore();
  }
  const a2 = Math.floor(Math.max(y0, -TILE) / TILE) * TILE;
  const b2 = Math.min(y1, world + TILE);
  if (x0 < BORDER_H) {
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.scale(-1, 1);
    for (let p = a2; p < b2; p += TILE) ctx.drawImage(tile, p, -BORDER_H + 24, TILE, BORDER_H);
    ctx.restore();
  }
  if (x1 > world - BORDER_H) {
    ctx.save();
    ctx.translate(world, 0);
    ctx.rotate(Math.PI / 2);
    for (let p = a2; p < b2; p += TILE) ctx.drawImage(tile, p, -BORDER_H + 24, TILE, BORDER_H);
    ctx.restore();
  }
}

// ---------- падіння ----------
export interface SkyFall {
  x: number;
  y: number;
  r: number;
  t0: number;
}
export const FALL_MS = 800;

/** «Сорвался»: клітина осідає вниз, зменшується й гасне; білий відблиск, що йде в небо. */
export function drawFalls(ctx: CanvasRenderingContext2D, falls: SkyFall[], now: number, x0: number, x1: number, y0: number, y1: number) {
  for (let i = falls.length - 1; i >= 0; i--) {
    const f = falls[i];
    const k = (now - f.t0) / FALL_MS;
    if (k >= 1) {
      falls.splice(i, 1);
      continue;
    }
    if (k < 0 || f.x < x0 - f.r * 2 || f.x > x1 + f.r * 2 || f.y < y0 - f.r * 2 || f.y > y1 + f.r * 2) continue;
    const e = k * k;
    const r = f.r * (1 - 0.7 * e);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = "#fbfdff";
    ctx.beginPath();
    ctx.arc(f.x, f.y + f.r * 1.2 * e, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,170,230,0.9)";
    ctx.lineWidth = Math.max(2, f.r * 0.08);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Кільце-попередження навколо своєї клітини над порожнечею: заповнюється за fallGrace. progress 0..1. */
export function drawVoidRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, progress: number, time: number, scale: number) {
  const pulse = 1 + Math.sin(time * 14) * 0.05;
  ctx.strokeStyle = `rgba(255,${Math.round(120 - 80 * progress)},${Math.round(110 - 80 * progress)},${0.55 + 0.4 * progress})`;
  ctx.lineWidth = Math.max(3 / scale, r * 0.1);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.25 * pulse, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.12, progress));
  ctx.stroke();
}

/** Легке почервоніння країв екрана біля просвіту (екранні координати). */
export function drawVoidVignette(ctx: CanvasRenderingContext2D, W: number, H: number, strength: number) {
  if (strength <= 0.01) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(255,70,70,0)");
  g.addColorStop(1, `rgba(255,60,60,${0.32 * strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------- «Крильця» ----------
const WING_FRAMES = 4;
const wingCache = new Map<string, HTMLCanvasElement>();
function wingSprite(frame: number, px: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${frame}|${px}`;
  const hit = wingCache.get(key);
  if (hit) return hit;
  const cv = mk(px, px);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.translate(px / 2, px / 2);
  c.scale(px / 3, px / 3); // 3 радіуси на сторону; тіло радіусом 1 по центру
  const flap = [0.0, 0.35, 0.6, 0.3][frame % WING_FRAMES];
  for (const side of [-1, 1]) {
    c.save();
    c.rotate(side * (Math.PI / 2 - 0.15) + side * flap * -0.5);
    c.fillStyle = "#ffffff";
    c.strokeStyle = "rgba(150,190,235,0.95)";
    c.lineWidth = 0.05;
    c.beginPath();
    c.moveTo(0.7, 0);
    c.bezierCurveTo(1.0, -0.55, 1.7, -0.7, 1.95, -0.25);
    c.bezierCurveTo(1.75, -0.1, 1.85, 0.08, 1.55, 0.18);
    c.bezierCurveTo(1.5, 0.35, 1.2, 0.35, 1.0, 0.3);
    c.bezierCurveTo(0.95, 0.4, 0.8, 0.35, 0.7, 0.2);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
  wingCache.set(key, cv);
  return cv;
}
const shadowCache = new Map<number, HTMLCanvasElement>();
function shadowSprite(px: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const hit = shadowCache.get(px);
  if (hit) return hit;
  const cv = mk(px, px);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.fillStyle = "rgba(40,80,130,0.28)";
  c.beginPath();
  c.ellipse(px / 2, px / 2, px * 0.34, px * 0.3, 0, 0, TAU);
  c.fill();
  shadowCache.set(px, cv);
  return cv;
}

/** Тінь на хмарі + крильця навколо клітини, що летить (кадр змаху з кешу). `blink` - останні секунди мигають. */
export function drawWings(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, time: number, scale: number, dpr: number, blink: boolean) {
  if (blink && Math.floor(time * 6) % 2 === 0) return;
  const px = Math.max(24, Math.min(256, Math.round(r * 3 * scale * dpr / 8) * 8));
  const sh = shadowSprite(px);
  if (sh) {
    const s = r * 3;
    ctx.drawImage(sh, x + r * 0.35 - s / 2, y + r * 0.6 - s / 2, s, s);
  }
  const fr = Math.floor(time * 9) % WING_FRAMES;
  const w = wingSprite(fr, px);
  if (!w) return;
  const s = r * 3;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.drawImage(w, -s / 2, -s / 2, s, s);
  ctx.restore();
}

// ---------- мінікарта ----------
export function drawSkyMinimap(ctx: CanvasRenderingContext2D, m: FlockModel, s: SkyState, size: number) {
  const k = size / m.cfg.world;
  ctx.fillStyle = "rgba(120,185,240,0.9)";
  ctx.fillRect(0, 0, size, size);
  const t = skyTime(s, m.localNow);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  for (const c of s.clouds) {
    const [ox, oy] = cloudCenter(c, t);
    ctx.beginPath();
    ctx.roundRect((ox - c.hx) * k, (oy - c.hy) * k, c.hx * 2 * k, c.hy * 2 * k, Math.min(c.hx, c.hy) * 0.45 * k);
    ctx.fill();
  }
}

export { onCloud };
export type { SkyCloud };
