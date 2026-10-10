import { circle, drawCreature } from "./flockCreature";
import { skinOf } from "./flockSkins";
import type { Theme } from "./flockRender";

/**
 * Кеш готових спрайтів (offscreen canvas): персонажі, бонуси зі свіченням, кущі, імена, цифри маси, тайл пасовища.
 * Жодного shadowBlur/filter/градієнтів на кадр: усе малюється один раз під потрібний розмір, далі - drawImage.
 * Розмір спрайта підбирається "відрами" (крок 12%), тож перемальовка потрібна лише при помітній зміні масштабу.
 */

const TAU = Math.PI * 2;

function makeCanvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

/** Мапа з обмеженням розміру (найстаріший вилітає) - щоб кеш не ріс безмежно. */
class Lru<V> {
  private m = new Map<string, V>();
  constructor(private readonly cap: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V) {
    this.m.set(k, v);
    if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value as string);
  }
  clear() {
    this.m.clear();
  }
}

// ---------- персонажі ----------
const BUCKET = 1.12;
const ANGLES = 24;
interface CreatureSprite {
  cv: HTMLCanvasElement;
  /** Піксельний радіус, під який намальовано. */
  rb: number;
}
const creatures = new Lru<CreatureSprite>(500);

/** Малює персонажа спрайтом (тіло, мордочка, вуха); дрібні/дуже великі - напряму. */
export function drawCreatureCached(
  ctx: CanvasRenderingContext2D,
  skinId: number,
  x: number,
  y: number,
  r: number,
  ang: number,
  phase: number,
  wobble: number,
  scale: number,
  dpr: number,
) {
  const rPx = r * scale * dpr;
  if (rPx > 220 || rPx < 2.5) {
    drawCreature(ctx, skinOf(skinId), x, y, r, ang, phase, wobble);
    return;
  }
  const b = Math.round(Math.log(rPx) / Math.log(BUCKET));
  const ab = ((Math.round(ang / (TAU / ANGLES)) % ANGLES) + ANGLES) % ANGLES;
  const key = `${skinId}:${b}:${ab}`;
  let spr = creatures.get(key);
  if (!spr) {
    const rb = Math.pow(BUCKET, b);
    const size = Math.ceil(rb * 2.6) + 2;
    const cv = makeCanvas(size, size);
    const c = cv.getContext("2d");
    if (c) {
      c.translate(size / 2, size / 2);
      drawCreature(c, skinOf(skinId), 0, 0, rb, (ab * TAU) / ANGLES, 0, 0);
    }
    spr = { cv, rb };
    creatures.set(key, spr);
  }
  const f = r / spr.rb; // піксель спрайта -> світові одиниці
  const w = spr.cv.width * f;
  ctx.save();
  ctx.translate(x, y);
  // покачування й "дихання": трансформ поверх готового спрайта
  ctx.rotate(Math.sin(phase) * 0.07 * wobble);
  const sq = 1 + Math.sin(phase * 2) * 0.035 * wobble;
  ctx.scale(sq, 2 - sq);
  ctx.drawImage(spr.cv, -w / 2, -w / 2, w, w);
  ctx.restore();
}

// ---------- бонуси (свічення + диск + іконка в одному спрайті) ----------
const bonusCache = new Map<string, HTMLCanvasElement>();
const BONUS_SPRITE = 192;

export function bonusFullSprite(kind: string, color: string, icon: string, dark: boolean) {
  const key = `${kind}${dark ? "d" : "l"}`;
  let cv = bonusCache.get(key);
  if (cv) return cv;
  cv = makeCanvas(BONUS_SPRITE, BONUS_SPRITE);
  const c = cv.getContext("2d");
  if (c) {
    const s = BONUS_SPRITE;
    const k = s / 100; // 100 світових одиниць = весь спрайт (радіус свічення 44, диск 17)
    c.translate(s / 2, s / 2);
    const g = c.createRadialGradient(0, 0, 4 * k, 0, 0, 44 * k);
    g.addColorStop(0, color);
    g.addColorStop(0.45, color + "99");
    g.addColorStop(1, color + "00");
    c.fillStyle = g;
    circle(c, 0, 0, 44 * k);
    c.fill();
    c.fillStyle = dark ? "#f2f5ea" : "#ffffff";
    circle(c, 0, 0, 17 * k);
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 3 * k;
    c.stroke();
    c.font = `${(icon.length > 1 && icon[0] === "✖" ? 15 : 20) * k}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#1b2a14";
    c.fillText(icon, 0, k);
  }
  bonusCache.set(key, cv);
  return cv;
}
/** Сторона спрайта бонуса у світових одиницях. */
export const BONUS_WORLD_SIZE = 100;

// ---------- кущі ----------
let thornCv: HTMLCanvasElement | null = null;
const THORN_PX = 256;
export function thornSprite() {
  if (thornCv) return thornCv;
  const cv = makeCanvas(THORN_PX, THORN_PX);
  const c = cv.getContext("2d");
  if (c) {
    const r = THORN_PX * 0.47;
    c.translate(THORN_PX / 2, THORN_PX / 2);
    const spikes = 16;
    c.fillStyle = "#2f7a3a";
    c.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU;
      const rr = i % 2 === 0 ? r : r * 0.82;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.fillStyle = "#47a357";
    circle(c, 0, 0, r * 0.72);
    c.fill();
    c.fillStyle = "#5fbf6e";
    circle(c, -r * 0.2, -r * 0.22, r * 0.38);
    c.fill();
    c.fillStyle = "#e9577f";
    for (const [dx, dy] of [
      [0.25, 0.2],
      [-0.3, 0.3],
      [0.05, -0.35],
    ]) {
      circle(c, dx * r, dy * r, r * 0.07);
      c.fill();
    }
  }
  thornCv = cv;
  return cv;
}
/** Радіус куща в спрайті відносно його половини (0.47) - щоб малювати з тим самим масштабом. */
export const THORN_SPRITE_FILL = 0.47;

// ---------- текст: імена й цифри маси ----------
interface TextSprite {
  cv: HTMLCanvasElement;
  /** Піксельний розмір шрифту, під який намальовано. */
  px: number;
  /** Де в спрайті центр самого імені (без значка бота), px. */
  centerX: number;
}
const texts = new Lru<TextSprite>(300);

/** Імʼя з обводкою одним спрайтом; бот - з непомітним значком. Розмір шрифту підбирається "відрами" по 2 px. */
export function nameSprite(text: string, bot: boolean, fontPx: number, theme: Theme): TextSprite {
  const px = Math.max(8, Math.round(fontPx / 2) * 2);
  const key = `${text}|${bot ? 1 : 0}|${px}|${theme.dark ? "d" : "l"}`;
  let spr = texts.get(key);
  if (spr) return spr;
  const font = `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const probe = makeCanvas(4, 4).getContext("2d");
  let w = px * 2;
  if (probe) {
    probe.font = font;
    w = probe.measureText(text).width;
  }
  const pad = Math.ceil(px * 0.3);
  const badge = bot ? px * 0.9 : 0;
  const cv = makeCanvas(w + badge + pad * 2, px * 1.5 + pad * 2);
  const c = cv.getContext("2d");
  if (c) {
    c.font = font;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    const cy = cv.height / 2;
    c.lineWidth = px * 0.22;
    c.strokeStyle = theme.nameStroke;
    c.fillStyle = theme.nameFill;
    c.globalAlpha = bot ? 0.88 : 1;
    c.strokeText(text, pad, cy);
    c.fillText(text, pad, cy);
    if (bot) {
      // значок бота: маленька "кнопка" праворуч від імені
      c.globalAlpha = 0.55;
      circle(c, pad + w + px * 0.45, cy, px * 0.17);
      c.fill();
      c.lineWidth = px * 0.07;
      c.stroke();
    }
  }
  spr = { cv, px, centerX: pad + w / 2 };
  texts.set(key, spr);
  return spr;
}

const DIGITS = "0123456789";
const digitAtlas = new Map<string, { cv: HTMLCanvasElement; cellW: number; px: number }>();

/** Цифри маси: атлас 0-9 під розмір шрифту, число збирається drawImage-ами (без нових канвасів при зміні маси). */
export function digitSprites(fontPx: number, theme: Theme) {
  const px = Math.max(8, Math.round(fontPx / 2) * 2);
  const key = `${px}|${theme.dark ? "d" : "l"}`;
  let a = digitAtlas.get(key);
  if (a) return a;
  const font = `600 ${px}px system-ui, sans-serif`;
  const cellW = Math.ceil(px * 0.75);
  const cv = makeCanvas(cellW * 10, px * 1.5);
  const c = cv.getContext("2d");
  if (c) {
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineWidth = px * 0.2;
    c.strokeStyle = theme.nameStroke;
    c.fillStyle = theme.nameFill;
    for (let i = 0; i < 10; i++) {
      c.strokeText(DIGITS[i], cellW * i + cellW / 2, cv.height / 2);
      c.fillText(DIGITS[i], cellW * i + cellW / 2, cv.height / 2);
    }
  }
  a = { cv, cellW, px };
  digitAtlas.set(key, a);
  return a;
}

/** Малює ціле число по центру (x, y) у світових координатах; `worldPerPx` - скільки світових одиниць у пікселі спрайта. */
export function drawDigits(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, fontWorld: number, scale: number, dpr: number, theme: Theme) {
  const a = digitSprites(fontWorld * scale * dpr, theme);
  const wp = fontWorld / a.px;
  const s = String(Math.max(0, Math.round(n)));
  const total = s.length * a.cellW * wp * 0.8;
  const h = a.cv.height * wp;
  let dx = x - total / 2;
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(i) - 48;
    ctx.drawImage(a.cv, d * a.cellW, 0, a.cellW, a.cv.height, dx - a.cellW * wp * 0.1, y - h / 2, a.cellW * wp, h);
    dx += a.cellW * wp * 0.8;
  }
}

// ---------- тайл пасовища: сітка-трава + пучки одним патерном ----------
export const TILE_CELLS = 3; // 3x3 клітини сітки (по 90 одиниць) = 270 одиниць
export const GRID = 90;
let tile: { key: string; cv: HTMLCanvasElement; pattern: CanvasPattern | null } | null = null;

function hash(a: number, b: number) {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Патерн пасовища (колір + сітка + рідкі пучки). Розмір тайла підбирається під px/одиницю (бакети по 25%),
 * патерн повторюється у СВІТОВИХ координатах (setTransform перед fill).
 */
export function pastureTile(ctx: CanvasRenderingContext2D, theme: Theme, pxPerUnit: number): CanvasPattern | null {
  const q = Math.max(0.25, Math.round(pxPerUnit * 4) / 4);
  const key = `${theme.dark ? "d" : "l"}|${q}`;
  if (tile && tile.key === key) return tile.pattern;
  const span = GRID * TILE_CELLS;
  const size = Math.round(span * q);
  const cv = makeCanvas(size, size);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(size / span, size / span);
    c.fillStyle = theme.bg;
    c.fillRect(0, 0, span, span);
    c.strokeStyle = theme.grid;
    c.lineWidth = 1.2 / q;
    c.beginPath();
    for (let i = 0; i <= TILE_CELLS; i++) {
      c.moveTo(i * GRID, 0);
      c.lineTo(i * GRID, span);
      c.moveTo(0, i * GRID);
      c.lineTo(span, i * GRID);
    }
    c.stroke();
    c.strokeStyle = theme.tuft;
    c.lineWidth = 2 / q;
    c.lineCap = "round";
    c.beginPath();
    for (let gx = 0; gx < TILE_CELLS; gx++) {
      for (let gy = 0; gy < TILE_CELLS; gy++) {
        const h = hash(gx, gy);
        if (h > 0.55) continue;
        const tx = gx * GRID + 20 + h * 120 * 0.5;
        const ty = gy * GRID + 24 + hash(gy, gx) * 50;
        c.moveTo(tx, ty);
        c.lineTo(tx - 4, ty - 9);
        c.moveTo(tx, ty);
        c.lineTo(tx + 1, ty - 11);
        c.moveTo(tx, ty);
        c.lineTo(tx + 5, ty - 8);
      }
    }
    c.stroke();
  }
  const pattern = ctx.createPattern(cv, "repeat");
  // піксель тайла -> світова одиниця (тайл покриває span одиниць, а не size)
  pattern?.setTransform(new DOMMatrix([span / size, 0, 0, span / size, 0, 0]));
  tile = { key, cv, pattern };
  return pattern;
}

export function clearSpriteCaches() {
  creatures.clear();
  texts.clear();
  digitAtlas.clear();
  bonusCache.clear();
  thornCv = null;
  tile = null;
}
