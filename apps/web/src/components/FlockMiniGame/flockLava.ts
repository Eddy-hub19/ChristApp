/**
 * Річка лави карти «Вулкан»: клієнтська геометрія (дзеркало серверної), відмальовування з кешованих тайлів
 * (3 кадри мерехтіння, одна спільна фаза часу для всіх тайлів, без shadowBlur), береги, мости, світіння біля краю
 * екрана, анімація «згоріла» й попередження. Усі спрайти малюються один раз.
 */

export interface LavaGeom {
  y0: number;
  y1: number;
  bridges: { x0: number; x1: number }[];
}

const TAU = Math.PI * 2;
/** Кадри мерехтіння лави й їхня послідовність (туди-сюди), кадрів на секунду. */
const FRAMES = 3;
const SEQ = [0, 1, 2, 1];
const FPS = 3;
const TILE = 256;

/** Відстань від центра клітини до небезпеки: по вертикалі до смуги; на мосту - до бічного краю. Infinity - далеко/безпечно. */
export function lavaDistance(l: LavaGeom, x: number, y: number): number {
  if (y > l.y0 && y < l.y1) {
    for (const b of l.bridges) if (x >= b.x0 && x <= b.x1) return Math.min(x - b.x0, b.x1 - x);
    return 0;
  }
  for (const b of l.bridges) if (x >= b.x0 && x <= b.x1) return Infinity;
  return y <= l.y0 ? l.y0 - y : y - l.y1;
}

function canvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}
const quant = (px: number) => Math.max(0.25, Math.min(2, Math.round(px * 4) / 4));
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---- лава: патерни кадрів ----
const patterns = new Map<string, CanvasPattern>();

function frameCanvas(frame: number, q: number) {
  const cv = canvas(TILE * q, TILE * q);
  const c = cv.getContext("2d");
  if (!c) return cv;
  c.scale(q, q);
  const base = c.createLinearGradient(0, 0, TILE, TILE);
  base.addColorStop(0, "#e2431a");
  base.addColorStop(0.5, "#d2330f");
  base.addColorStop(1, "#e84d1c");
  c.fillStyle = base;
  c.fillRect(0, 0, TILE, TILE);
  const r = rng(101);
  const wrap = (x: number, y: number, rad: number, fn: (x: number, y: number) => void) => {
    for (const dx of [0, -TILE, TILE]) for (const dy of [0, -TILE, TILE]) if (Math.abs(x + dx - TILE / 2) < TILE / 2 + rad && Math.abs(y + dy - TILE / 2) < TILE / 2 + rad) fn(x + dx, y + dy);
  };
  // гарячі плями: дрейфують між кадрами (мерехтіння)
  for (let i = 0; i < 16; i++) {
    const x = r() * TILE + Math.sin(frame * 2.1 + i) * 5;
    const y = r() * TILE + Math.cos(frame * 1.7 + i * 1.3) * 5;
    const rad = 18 + r() * 30;
    wrap(x, y, rad, (px, py) => {
      const g = c.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(255,${180 + ((i + frame) % 3) * 18},70,${0.55 + 0.1 * ((i + frame) % 2)})`);
      g.addColorStop(1, "rgba(255,120,30,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(px, py, rad, 0, TAU);
      c.fill();
    });
  }
  // темна кірка острівцями
  for (let i = 0; i < 9; i++) {
    const x = r() * TILE;
    const y = r() * TILE;
    const w = 14 + r() * 26;
    const rot = r() * TAU;
    wrap(x, y, w, (px, py) => {
      c.fillStyle = "rgba(70,18,10,0.55)";
      c.beginPath();
      c.ellipse(px, py, w, w * 0.45, rot, 0, TAU);
      c.fill();
      c.strokeStyle = `rgba(255,${150 + frame * 25},50,0.65)`;
      c.lineWidth = 1.6;
      c.stroke();
    });
  }
  // яскраві течії-жилки
  c.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    let x = r() * TILE;
    let y = r() * TILE;
    let a = r() * TAU;
    c.strokeStyle = `rgba(255,${214 + frame * 8},110,${0.6 + 0.12 * ((i + frame) % 3)})`;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      a += (r() - 0.5) * 1.4 + Math.sin(frame + k) * 0.18;
      x += Math.cos(a) * 20;
      y += Math.sin(a) * 20;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  return cv;
}

function lavaPattern(ctx: CanvasRenderingContext2D, frame: number, q: number) {
  const key = `${frame}|${q}`;
  let p = patterns.get(key);
  if (!p) {
    const pat = ctx.createPattern(frameCanvas(frame, q), "repeat");
    if (!pat) return null;
    pat.setTransform(new DOMMatrix().scale(1 / q, 1 / q));
    p = pat;
    patterns.set(key, p);
  }
  return p;
}

// ---- береги ----
const shores = new Map<number, HTMLCanvasElement>();
const SHORE_H = 96;
function shoreSprite(q: number) {
  let cv = shores.get(q);
  if (cv) return cv;
  cv = canvas(TILE * q, SHORE_H * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    // верхня половина - земля (червоне світіння), нижня - лава (жар біля скелі); скеля посередині (y = 40..58)
    const glowLand = c.createLinearGradient(0, 0, 0, 40);
    glowLand.addColorStop(0, "rgba(255,80,20,0)");
    glowLand.addColorStop(1, "rgba(255,80,20,0.28)");
    c.fillStyle = glowLand;
    c.fillRect(0, 0, TILE, 40);
    const edge = (x: number, amp: number, ph: number) => 52 + Math.sin((x / TILE) * TAU * 2 + ph) * amp + Math.sin((x / TILE) * TAU * 5 + ph * 2) * amp * 0.5;
    // скеля: нерівна чорна смуга
    c.beginPath();
    c.moveTo(0, 36);
    for (let x = 0; x <= TILE; x += 8) c.lineTo(x, 36 + Math.sin((x / TILE) * TAU * 3 + 1) * 3);
    for (let x = TILE; x >= 0; x -= 8) c.lineTo(x, edge(x, 4, 0.5));
    c.closePath();
    const rock = c.createLinearGradient(0, 36, 0, 60);
    rock.addColorStop(0, "#2a2124");
    rock.addColorStop(1, "#0c0809");
    c.fillStyle = rock;
    c.fill();
    c.strokeStyle = "#050303";
    c.lineWidth = 1.4;
    c.stroke();
    // жар під скелею (на лаві)
    const hot = c.createLinearGradient(0, 52, 0, 78);
    hot.addColorStop(0, "rgba(255,200,80,0.85)");
    hot.addColorStop(1, "rgba(255,120,30,0)");
    c.fillStyle = hot;
    c.beginPath();
    c.moveTo(0, 56);
    for (let x = 0; x <= TILE; x += 8) c.lineTo(x, edge(x, 4, 0.5));
    c.lineTo(TILE, 78);
    c.lineTo(0, 78);
    c.closePath();
    c.fill();
    // світлі відблиски на камінні
    c.strokeStyle = "rgba(255,170,100,0.22)";
    c.lineWidth = 1.2;
    c.beginPath();
    for (let x = 6; x < TILE; x += 31) {
      c.moveTo(x, 40);
      c.lineTo(x + 9, 41);
    }
    c.stroke();
  }
  shores.set(q, cv);
  return cv;
}

// ---- мости ----
const bridges = new Map<string, HTMLCanvasElement>();
const BR_OVER = 16; // міст трохи виступає за береги
function bridgeSprite(w: number, h: number, q: number) {
  const key = `${Math.round(w)}x${Math.round(h)}|${q}`;
  let cv = bridges.get(key);
  if (cv) return cv;
  const H = h + BR_OVER * 2;
  cv = canvas(w * q, H * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    // нижня тінь і жар з боків
    c.fillStyle = "rgba(60,10,0,0.45)";
    c.fillRect(6, 6, w - 12, H - 8);
    // плити-дошки впоперек (обвуглені), з проміжками
    const n = Math.max(4, Math.round(H / 34));
    const ph = H / n;
    for (let i = 0; i < n; i++) {
      const y = i * ph;
      const g = c.createLinearGradient(0, y, 0, y + ph);
      g.addColorStop(0, i % 2 ? "#5b4a45" : "#66544d");
      g.addColorStop(1, i % 2 ? "#3f302c" : "#463631");
      c.fillStyle = g;
      c.strokeStyle = "#140c0a";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(2, y + 2, w - 4, ph - 4, 5);
      c.fill();
      c.stroke();
      // волокна й вищербини
      c.strokeStyle = "rgba(0,0,0,0.28)";
      c.lineWidth = 1;
      c.beginPath();
      const off = (i * 53) % 90;
      c.moveTo(24 + off, y + ph * 0.4);
      c.lineTo(80 + off, y + ph * 0.4);
      c.moveTo(w - 120 - off, y + ph * 0.65);
      c.lineTo(w - 60 - off, y + ph * 0.65);
      c.stroke();
      c.strokeStyle = "rgba(255,200,150,0.16)";
      c.beginPath();
      c.moveTo(8, y + 5);
      c.lineTo(w - 8, y + 5);
      c.stroke();
    }
    // бічні балки з заклепками
    for (const x of [0, w - 14]) {
      const g = c.createLinearGradient(x, 0, x + 14, 0);
      g.addColorStop(0, "#2a1f1c");
      g.addColorStop(1, "#171010");
      c.fillStyle = g;
      c.strokeStyle = "#0a0605";
      c.lineWidth = 1.6;
      c.beginPath();
      c.roundRect(x, 0, 14, H, 4);
      c.fill();
      c.stroke();
      c.fillStyle = "#8a7a72";
      for (let y = 18; y < H - 8; y += 40) {
        c.beginPath();
        c.arc(x + 7, y, 2, 0, TAU);
        c.fill();
      }
    }
  }
  bridges.set(key, cv);
  return cv;
}

/** Лава, береги й мости у видимій частині кадру. `time` - секунди (одна фаза мерехтіння для всіх тайлів). */
export function drawLava(ctx: CanvasRenderingContext2D, l: LavaGeom, x0: number, x1: number, y0: number, y1: number, time: number, pxPerUnit: number, world: number) {
  if (y1 < l.y0 - 70 || y0 > l.y1 + 70) return;
  const q = quant(pxPerUnit);
  const frame = SEQ[Math.floor(time * FPS) % SEQ.length] % FRAMES;
  const pat = lavaPattern(ctx, frame, q);
  const xa = Math.max(0, x0);
  const xb = Math.min(world, x1);
  if (pat) ctx.fillStyle = pat;
  else ctx.fillStyle = "#d8401a";
  ctx.fillRect(xa, l.y0, xb - xa, l.y1 - l.y0);
  // береги: верхній (скеля над лавою) і нижній (віддзеркалений)
  const sh = shoreSprite(q);
  const start = Math.floor(xa / TILE) * TILE;
  for (let x = start; x < xb; x += TILE) {
    ctx.drawImage(sh, x, l.y0 - 52, TILE, SHORE_H);
    ctx.save();
    ctx.translate(0, l.y1 + 52);
    ctx.scale(1, -1);
    ctx.drawImage(sh, x, 0, TILE, SHORE_H);
    ctx.restore();
  }
  // мости
  for (const b of l.bridges) {
    if (b.x1 < x0 || b.x0 > x1) continue;
    const w = b.x1 - b.x0;
    const h = l.y1 - l.y0;
    ctx.drawImage(bridgeSprite(w, h, q), b.x0, l.y0 - BR_OVER, w, h + BR_OVER * 2);
  }
}

// ---- світіння біля краю екрана ----
let glowTop: HTMLCanvasElement | null = null;
let glowBottom: HTMLCanvasElement | null = null;
function glowSprite(top: boolean) {
  const cached = top ? glowTop : glowBottom;
  if (cached) return cached;
  const cv = canvas(4, 128);
  const c = cv.getContext("2d");
  if (c) {
    const g = c.createLinearGradient(0, top ? 0 : 128, 0, top ? 128 : 0);
    g.addColorStop(0, "rgba(255,70,20,0.85)");
    g.addColorStop(0.5, "rgba(255,70,20,0.28)");
    g.addColorStop(1, "rgba(255,70,20,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 128);
  }
  if (top) glowTop = cv;
  else glowBottom = cv;
  return cv;
}

/** Червоне світіння з боку екрана, де лава: сильнішає, коли гравець ближче (distance - до лави, світові одиниці). */
export function drawLavaGlow(ctx: CanvasRenderingContext2D, W: number, H: number, l: LavaGeom, camY: number, distance: number, time: number) {
  const near = 650;
  if (!(distance < near)) return;
  const k = (1 - distance / near) * (0.75 + 0.25 * Math.sin(time * 5));
  const above = camY > (l.y0 + l.y1) / 2; // камера нижче за річку: лава зверху
  ctx.globalAlpha = Math.min(1, k);
  const h = Math.min(H * 0.35, 220);
  ctx.drawImage(glowSprite(above), 0, above ? 0 : H - h, W, h);
  ctx.globalAlpha = 1;
}

// ---- «згоріла» ----
export interface LavaBurn {
  x: number;
  y: number;
  r: number;
  t0: number;
}
export const BURN_MS = 900;
let burnCv: HTMLCanvasElement | null = null;
function burnSprite() {
  if (burnCv) return burnCv;
  const cv = canvas(128, 128);
  const c = cv.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,240,170,0.95)");
    g.addColorStop(0.35, "rgba(255,150,40,0.75)");
    g.addColorStop(1, "rgba(220,50,10,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  burnCv = cv;
  return cv;
}

/** Спалах і іскри на місці клітини, що згоріла (кешований спрайт, кілька точок). */
export function drawBurns(ctx: CanvasRenderingContext2D, burns: LavaBurn[], now: number, x0: number, x1: number, y0: number, y1: number) {
  for (let i = burns.length - 1; i >= 0; i--) {
    const b = burns[i];
    const k = (now - b.t0) / BURN_MS;
    if (k >= 1) {
      burns.splice(i, 1);
      continue;
    }
    if (k < 0 || b.x < x0 - b.r * 2 || b.x > x1 + b.r * 2 || b.y < y0 - b.r * 3 || b.y > y1 + b.r * 2) continue;
    // обвуглений силует, що стискається, і хмарка попелу, що здіймається
    if (k < 0.55) {
      const kk = k / 0.55;
      ctx.globalAlpha = 1 - kk * 0.4;
      ctx.fillStyle = "#1a1012";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (1 - kk * 0.75), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#ffb02a";
      ctx.lineWidth = Math.max(2, b.r * 0.1);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.min(0.6, k * 1.4) * (1 - k);
    ctx.fillStyle = "#2a1c1e";
    ctx.beginPath();
    ctx.arc(b.x, b.y - k * b.r * 1.4, b.r * (0.9 + 0.8 * k), 0, TAU);
    ctx.fill();
    const s = b.r * (1.6 + 1.4 * k);
    ctx.globalAlpha = (1 - k) * 0.95;
    ctx.drawImage(burnSprite(), b.x - s, b.y - s, s * 2, s * 2);
    // іскри летять угору
    ctx.fillStyle = "#ffd24a";
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * TAU + j;
      const d = b.r * (0.3 + 1.1 * k);
      const rise = k * b.r * 1.6;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.6 - rise, Math.max(1.5, b.r * 0.07 * (1 - k)), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Попереджувальне кільце навколо клітини, що наближається до лави. */
export function drawLavaWarning(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, scale: number) {
  const pulse = 0.55 + 0.45 * Math.sin(time * 9);
  ctx.strokeStyle = `rgba(255,60,30,${0.45 + 0.45 * pulse})`;
  ctx.lineWidth = Math.max(3 / scale, r * 0.1);
  ctx.setLineDash([r * 0.35, r * 0.2]);
  ctx.beginPath();
  ctx.arc(x, y, r * (1.12 + 0.06 * pulse), 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Лава й мости на мінікарті: червона смуга й світлі смужки мостів. */
export function drawLavaMinimap(ctx: CanvasRenderingContext2D, l: LavaGeom, world: number, size: number) {
  const k = size / world;
  ctx.fillStyle = "#e04418";
  ctx.fillRect(0, l.y0 * k, size, Math.max(2, (l.y1 - l.y0) * k));
  ctx.fillStyle = "#e9dcc8";
  for (const b of l.bridges) ctx.fillRect(b.x0 * k, l.y0 * k - 0.5, Math.max(2, (b.x1 - b.x0) * k), Math.max(2, (l.y1 - l.y0) * k) + 1);
}

export function resetLavaCache() {
  patterns.clear();
  shores.clear();
  bridges.clear();
  burnCv = glowTop = glowBottom = null;
}
