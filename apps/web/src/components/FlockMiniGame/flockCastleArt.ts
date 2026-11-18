/**
 * Графіка режиму «Замки»: озеро-річка по діагоналі з мостами, береги, декор карти, замки (3 стадії), камені, зона бази.
 * Усе малюється кодом один раз у кешовані канваси (тайли/спрайти за квантованим масштабом) - без shadowBlur на кадрі.
 */
import { TEAM_COLOR, castleOf, type CastleCfg, type Decor, type Team } from "./flockCastles";

const TAU = Math.PI * 2;
const TILE = 256;
const SQ = Math.SQRT2;

function canvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}
const quant = (px: number) => Math.max(0.25, Math.min(1, Math.round(px * 4) / 4));
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------------------------------------------------------------- вода
const FRAMES = 3;
const SEQ = [0, 1, 2, 1];
const FPS = 2;
const waterPatterns = new Map<string, CanvasPattern>();

function waterFrame(frame: number, q: number) {
  const cv = canvas(TILE * q, TILE * q);
  const c = cv.getContext("2d");
  if (!c) return cv;
  c.scale(q, q);
  const g = c.createLinearGradient(0, 0, 0, TILE);
  g.addColorStop(0, "#3a8cc4");
  g.addColorStop(0.5, "#2e7bb4");
  g.addColorStop(1, "#3687bf");
  c.fillStyle = g;
  c.fillRect(0, 0, TILE, TILE);
  // хвилі: періодичні по x (2 цикли на тайл), фаза зсувається за кадром - зациклено без швів
  c.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const y0 = i * 32 + 14;
    c.strokeStyle = i % 2 ? "rgba(255,255,255,0.22)" : "rgba(20,70,120,0.22)";
    c.lineWidth = 2.4;
    c.beginPath();
    for (let x = 0; x <= TILE; x += 8) {
      const y = y0 + Math.sin((x / TILE) * TAU * 2 + (frame * TAU) / FRAMES + i * 1.3) * 4;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  // блики
  const r = rng(77);
  c.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 12; i++) {
    const x = 20 + r() * (TILE - 40);
    const y = 20 + r() * (TILE - 40);
    c.beginPath();
    c.ellipse(x + Math.sin(frame * 2 + i) * 3, y, 7, 2.2, 0, 0, TAU);
    c.fill();
  }
  return cv;
}

function waterPattern(ctx: CanvasRenderingContext2D, frame: number, q: number) {
  const key = `${frame}|${q}`;
  let p = waterPatterns.get(key);
  if (!p) {
    const pat = ctx.createPattern(waterFrame(frame, q), "repeat");
    if (!pat) return null;
    pat.setTransform(new DOMMatrix().scale(1 / q, 1 / q));
    p = pat;
    waterPatterns.set(key, p);
  }
  return p;
}

/** Берег: смужка вздовж ріки (піщано-трав'яна кромка, камиш). Малюється як є (верх) і дзеркально (низ). */
const SHORE_H = 70;
const shores = new Map<number, HTMLCanvasElement>();
function shoreSprite(q: number) {
  let cv = shores.get(q);
  if (cv) return cv;
  cv = canvas(TILE * q, SHORE_H * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    // низ спрайта - вода; верх - суша. Плавна кромка піску
    const g = c.createLinearGradient(0, 0, 0, SHORE_H);
    g.addColorStop(0, "rgba(120,150,70,0)");
    g.addColorStop(0.35, "rgba(170,160,100,0.55)");
    g.addColorStop(0.75, "rgba(205,190,130,0.95)");
    g.addColorStop(1, "rgba(120,170,200,0.5)");
    c.fillStyle = g;
    c.fillRect(0, 0, TILE, SHORE_H);
    // хвиляста лінія прибою (періодична)
    c.strokeStyle = "rgba(255,255,255,0.6)";
    c.lineWidth = 2.2;
    c.beginPath();
    for (let x = 0; x <= TILE; x += 8) {
      const y = SHORE_H - 8 + Math.sin((x / TILE) * TAU * 3) * 2.5;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // камінці й камиш
    const r = rng(31);
    for (let i = 0; i < 9; i++) {
      const x = 8 + r() * (TILE - 16);
      const y = 30 + r() * 18;
      c.fillStyle = "rgba(120,115,100,0.65)";
      c.beginPath();
      c.ellipse(x, y, 3 + r() * 3, 2 + r() * 2, 0, 0, TAU);
      c.fill();
    }
    c.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const x = 14 + (i / 7) * (TILE - 20) + r() * 10;
      const base = 44 + r() * 10;
      for (let k = 0; k < 4; k++) {
        c.strokeStyle = k % 2 ? "#5d8a3c" : "#7aa650";
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(x + k * 2.5, base);
        c.quadraticCurveTo(x + k * 2.5 + (k - 1.5) * 3, base - 14, x + k * 2.5 + (k - 1.5) * 5, base - 22 - r() * 6);
        c.stroke();
      }
      c.fillStyle = "#8a5a2c";
      c.beginPath();
      c.ellipse(x + 4, base - 24, 1.8, 5, 0.1, 0, TAU);
      c.fill();
    }
  }
  shores.set(q, cv);
  return cv;
}

/** Міст: дерев'яні дошки впоперек руху, бокові поручні, тінь. Розмір в одиницях світу: довжина (через річку) × ширина. */
const bridges = new Map<string, HTMLCanvasElement>();
function bridgeSprite(len: number, wid: number, q: number) {
  const key = `${Math.round(len)}x${Math.round(wid)}|${q}`;
  let cv = bridges.get(key);
  if (cv) return cv;
  cv = canvas(wid * q, len * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    c.fillStyle = "rgba(10,40,70,0.35)";
    c.fillRect(8, 8, wid - 6, len - 6);
    const n = Math.max(6, Math.round(len / 30));
    const ph = len / n;
    for (let i = 0; i < n; i++) {
      const y = i * ph;
      c.fillStyle = i % 2 ? "#a97a45" : "#b98a52";
      c.fillRect(0, y + 1, wid, ph - 2);
      c.fillStyle = "rgba(60,30,10,0.35)";
      c.fillRect(0, y + ph - 3, wid, 2);
      c.fillStyle = "rgba(255,230,180,0.22)";
      c.fillRect(0, y + 1, wid, 2);
    }
    // поручні
    for (const x of [0, wid - 12]) {
      c.fillStyle = "#6b4423";
      c.fillRect(x, 0, 12, len);
      c.fillStyle = "#8d5e31";
      c.fillRect(x + 2, 0, 4, len);
      c.fillStyle = "#4a2f17";
      for (let y = 6; y < len; y += 70) c.fillRect(x - 2, y, 16, 10);
    }
  }
  bridges.set(key, cv);
  return cv;
}

/** Діагональна річка з мостами у видимій частині кадру (у повернутій системі: x - вздовж ріки, y - поперек). */
export function drawLake(ctx: CanvasRenderingContext2D, g: CastleCfg, x0: number, x1: number, y0: number, y1: number, time: number, pxPerUnit: number) {
  const { hw, bridges: bs, bw, over } = g.river;
  const dMin = (x0 - y1) / SQ;
  const dMax = (x1 - y0) / SQ;
  if (dMin > hw + SHORE_H || dMax < -hw - SHORE_H) return;
  const q = quant(pxPerUnit);
  const frame = SEQ[Math.floor(time * FPS) % SEQ.length] % FRAMES;
  const sMin = (x0 + y0) / SQ - g.world / SQ - 40;
  const sMax = (x1 + y1) / SQ - g.world / SQ + 40;
  ctx.save();
  ctx.translate(g.world / 2, g.world / 2);
  ctx.rotate(Math.PI / 4);
  const pat = waterPattern(ctx, frame, q);
  ctx.fillStyle = pat ?? "#2e7bb4";
  ctx.fillRect(sMin, -hw, sMax - sMin, hw * 2);
  // береги: верхній (y<0) і нижній (дзеркально)
  const sh = shoreSprite(q);
  for (let x = Math.floor(sMin / TILE) * TILE; x < sMax; x += TILE) {
    ctx.drawImage(sh, x, -hw - SHORE_H + 14, TILE, SHORE_H);
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(sh, x, -hw - SHORE_H + 14, TILE, SHORE_H);
    ctx.restore();
  }
  // мости: центр на осі в s=b (локальний x = s − world/√2)
  const len = (hw + over) * 2;
  for (const b of bs) {
    const lx = b - g.world / SQ;
    if (lx + bw < sMin || lx - bw > sMax) continue;
    ctx.drawImage(bridgeSprite(len, bw, q), lx - bw / 2, -len / 2, bw, len);
  }
  ctx.restore();
}

/** Річка й мости на мінікарті. */
export function drawLakeMinimap(ctx: CanvasRenderingContext2D, g: CastleCfg, size: number) {
  const k = size / g.world;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);
  const L = size * SQ;
  ctx.fillStyle = "#3a8cc4";
  ctx.fillRect(-L / 2, -g.river.hw * k, L, g.river.hw * 2 * k);
  ctx.fillStyle = "#b98a52";
  for (const b of g.river.bridges) {
    const lx = (b - g.world / SQ) * k;
    ctx.fillRect(lx - (g.river.bw * k) / 2, -(g.river.hw + g.river.over) * k, g.river.bw * k, (g.river.hw + g.river.over) * 2 * k);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- декор (чанки в кеші)
const CHUNK = 680;
const chunks = new Map<string, HTMLCanvasElement | null>();
const CHUNK_CAP = 40;

function drawDecorItem(c: CanvasRenderingContext2D, d: Decor) {
  c.save();
  c.translate(d.x, d.y);
  switch (d.kind) {
    case "tree": {
      const r = d.s;
      c.fillStyle = "rgba(10,40,10,0.28)";
      c.beginPath();
      c.ellipse(r * 0.2, r * 0.55, r * 1.0, r * 0.55, 0, 0, TAU);
      c.fill();
      c.fillStyle = "#5b3a1e";
      c.fillRect(-r * 0.12, r * 0.1, r * 0.24, r * 0.55);
      const greens = d.v < 0.5 ? ["#2f6a2e", "#3f8438", "#55a046"] : ["#2a5f35", "#388046", "#4c9a58"];
      for (let i = 0; i < 3; i++) {
        c.fillStyle = greens[i];
        c.beginPath();
        c.arc((i - 1) * r * 0.22, -i * r * 0.14 - r * 0.05, r * (0.86 - i * 0.14), 0, TAU);
        c.fill();
      }
      c.fillStyle = "rgba(255,255,200,0.16)";
      c.beginPath();
      c.arc(-r * 0.25, -r * 0.4, r * 0.3, 0, TAU);
      c.fill();
      break;
    }
    case "rock": {
      const r = d.s;
      c.fillStyle = "rgba(0,0,0,0.22)";
      c.beginPath();
      c.ellipse(r * 0.15, r * 0.5, r * 0.95, r * 0.4, 0, 0, TAU);
      c.fill();
      c.fillStyle = "#7d8186";
      c.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + d.v * 3;
        const rr = r * (0.8 + ((i * 37 + Math.floor(d.v * 100)) % 5) * 0.06);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr * 0.75;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.22)";
      c.beginPath();
      c.ellipse(-r * 0.25, -r * 0.25, r * 0.4, r * 0.22, -0.4, 0, TAU);
      c.fill();
      c.fillStyle = "rgba(70,100,50,0.45)";
      c.beginPath();
      c.ellipse(r * 0.2, r * 0.3, r * 0.4, r * 0.15, 0.2, 0, TAU);
      c.fill();
      break;
    }
    case "barrel": {
      const r = d.s;
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.beginPath();
      c.ellipse(r * 0.2, r * 0.8, r * 0.9, r * 0.35, 0, 0, TAU);
      c.fill();
      c.fillStyle = "#8d5a2b";
      c.fillRect(-r * 0.75, -r * 0.9, r * 1.5, r * 1.7);
      c.fillStyle = "#a8743c";
      c.fillRect(-r * 0.75, -r * 0.9, r * 0.5, r * 1.7);
      c.fillStyle = "#3b3a3f";
      c.fillRect(-r * 0.78, -r * 0.55, r * 1.56, r * 0.18);
      c.fillRect(-r * 0.78, r * 0.3, r * 1.56, r * 0.18);
      c.fillStyle = "#b5824a";
      c.beginPath();
      c.ellipse(0, -r * 0.9, r * 0.75, r * 0.3, 0, 0, TAU);
      c.fill();
      break;
    }
    case "fence": {
      const len = d.s;
      const ang = d.v < 0.5 ? 0 : Math.PI / 2;
      c.rotate(ang);
      c.fillStyle = "rgba(0,0,0,0.2)";
      c.fillRect(-len / 2 + 3, 4, len, 10);
      c.fillStyle = "#9b6b3a";
      c.fillRect(-len / 2, -6, len, 5);
      c.fillRect(-len / 2, 4, len, 5);
      c.fillStyle = "#6b4423";
      for (let x = -len / 2; x <= len / 2; x += 36) c.fillRect(x - 3, -13, 7, 28);
      break;
    }
    case "puddle": {
      c.fillStyle = "rgba(70,120,170,0.55)";
      c.beginPath();
      c.ellipse(0, 0, d.s, d.s * 0.6, d.v * 3, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.45)";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(-d.s * 0.15, -d.s * 0.1, d.s * 0.5, d.s * 0.25, d.v * 3, 0, Math.PI * 1.2);
      c.stroke();
      break;
    }
    case "flower": {
      const cols = ["#ffffff", "#ffe36a", "#ff9ec4", "#c9a6ff"];
      c.fillStyle = cols[Math.floor(d.v * cols.length) % cols.length];
      for (let k = 0; k < 5; k++) {
        c.beginPath();
        c.arc(Math.cos((k / 5) * TAU) * 3.2, Math.sin((k / 5) * TAU) * 3.2, 2.4, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#e0a020";
      c.beginPath();
      c.arc(0, 0, 1.8, 0, TAU);
      c.fill();
      break;
    }
    default: {
      c.strokeStyle = "rgba(30,100,40,0.7)";
      c.lineWidth = 2;
      c.lineCap = "round";
      for (let k = -1; k <= 1; k++) {
        c.beginPath();
        c.moveTo(k * 4, 0);
        c.lineTo(k * 6, -d.s * (0.8 + d.v * 0.4));
        c.stroke();
      }
    }
  }
  c.restore();
}

function chunkCanvas(items: Decor[], cx: number, cy: number, q: number, seed: number): HTMLCanvasElement | null {
  const key = `${seed}|${cx}|${cy}|${q}`;
  if (chunks.has(key)) return chunks.get(key) ?? null;
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  const pad = 130;
  const mine = items.filter((d) => d.x > ox - pad && d.x < ox + CHUNK + pad && d.y > oy - pad && d.y < oy + CHUNK + pad);
  let cv: HTMLCanvasElement | null = null;
  if (mine.length) {
    cv = canvas(CHUNK * q, CHUNK * q);
    const c = cv.getContext("2d");
    if (c) {
      c.scale(q, q);
      c.translate(-ox, -oy);
      c.beginPath();
      c.rect(ox, oy, CHUNK, CHUNK);
      c.clip();
      // порядок: плоске (калюжі, квіти, трава), потім предмети за y
      const flat = mine.filter((d) => d.kind === "puddle" || d.kind === "flower" || d.kind === "tuft");
      const tall = mine.filter((d) => !(d.kind === "puddle" || d.kind === "flower" || d.kind === "tuft")).sort((a, b) => a.y - b.y);
      for (const d of flat) drawDecorItem(c, d);
      for (const d of tall) drawDecorItem(c, d);
    }
  }
  if (chunks.size >= CHUNK_CAP) chunks.delete(chunks.keys().next().value as string);
  chunks.set(key, cv);
  return cv;
}

/** Декор карти: чанки-канваси в кеші (малюються один раз на квантований масштаб). */
export function drawDecor(ctx: CanvasRenderingContext2D, items: Decor[], seed: number, world: number, x0: number, x1: number, y0: number, y1: number, pxPerUnit: number) {
  const q = quant(pxPerUnit);
  const n = Math.ceil(world / CHUNK);
  for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(n - 1, Math.floor(y1 / CHUNK)); cy++) {
    for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(n - 1, Math.floor(x1 / CHUNK)); cx++) {
      const cv = chunkCanvas(items, cx, cy, q, seed);
      if (cv) ctx.drawImage(cv, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
    }
  }
}

// ---------------------------------------------------------------- камені (хризоліт / топаз)
const STONE_COL: Record<Team, { a: string; b: string; c: string }> = {
  // хризоліт - зелений камінь овець; топаз - жовто-бурштиновий камінь вовків
  1: { a: "#c9f27a", b: "#6fcf4a", c: "#2f9a3e" },
  2: { a: "#ffe58a", b: "#ffbb2e", c: "#d9801a" },
};

function gemPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.lineTo(cx + r * 0.78, cy - r * 0.3);
  c.lineTo(cx + r * 0.52, cy + r * 0.78);
  c.lineTo(cx - r * 0.52, cy + r * 0.78);
  c.lineTo(cx - r * 0.78, cy - r * 0.3);
  c.closePath();
}

function paintGem(c: CanvasRenderingContext2D, owner: Team, cx: number, cy: number, r: number, broken = false) {
  const col = STONE_COL[owner];
  const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, col.a);
  g.addColorStop(0.55, col.b);
  g.addColorStop(1, col.c);
  gemPath(c, cx, cy, r);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = Math.max(1, r * 0.08);
  c.stroke();
  // грані
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.lineWidth = Math.max(0.8, r * 0.05);
  c.beginPath();
  c.moveTo(cx - r * 0.78, cy - r * 0.3);
  c.lineTo(cx + r * 0.78, cy - r * 0.3);
  c.moveTo(cx, cy - r);
  c.lineTo(cx - r * 0.2, cy - r * 0.3);
  c.lineTo(cx - r * 0.52, cy + r * 0.78);
  c.moveTo(cx, cy - r);
  c.lineTo(cx + r * 0.2, cy - r * 0.3);
  c.lineTo(cx + r * 0.52, cy + r * 0.78);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.65)";
  c.beginPath();
  c.ellipse(cx - r * 0.3, cy - r * 0.55, r * 0.14, r * 0.07, -0.6, 0, TAU);
  c.fill();
  if (broken) {
    c.strokeStyle = "rgba(40,20,10,0.8)";
    c.lineWidth = Math.max(1, r * 0.09);
    c.beginPath();
    c.moveTo(cx - r * 0.1, cy - r * 0.9);
    c.lineTo(cx + r * 0.15, cy - r * 0.2);
    c.lineTo(cx - r * 0.2, cy + r * 0.3);
    c.lineTo(cx + r * 0.1, cy + r * 0.75);
    c.stroke();
  }
}

const stones = new Map<string, HTMLCanvasElement>();
/** Камінь команди-хазяїна (спрайт 96 px). */
export function stoneSprite(owner: Team): HTMLCanvasElement {
  const k = `s${owner}`;
  let cv = stones.get(k);
  if (!cv) {
    cv = canvas(96, 96);
    const c = cv.getContext("2d");
    if (c) paintGem(c, owner, 48, 50, 40);
    stones.set(k, cv);
  }
  return cv;
}

/** Кристал у центрі замка: цілий / з тріщиною / уламки. */
function crystalSprite(owner: Team, stage: 0 | 1 | 2): HTMLCanvasElement {
  const k = `c${owner}${stage}`;
  let cv = stones.get(k);
  if (cv) return cv;
  cv = canvas(160, 160);
  const c = cv.getContext("2d");
  if (c) {
    const col = STONE_COL[owner];
    // світіння
    const gl = c.createRadialGradient(80, 80, 6, 80, 80, 76);
    gl.addColorStop(0, `${col.b}${stage === 2 ? "55" : "aa"}`);
    gl.addColorStop(1, `${col.b}00`);
    c.fillStyle = gl;
    c.fillRect(0, 0, 160, 160);
    if (stage < 2) paintGem(c, owner, 80, 84, stage === 0 ? 46 : 42, stage === 1);
    else {
      paintGem(c, owner, 62, 100, 18, true);
      paintGem(c, owner, 100, 104, 14, true);
      paintGem(c, owner, 82, 86, 12, false);
    }
  }
  stones.set(k, cv);
  return cv;
}

// ---------------------------------------------------------------- замок
const castles = new Map<string, HTMLCanvasElement>();
/** Піврозмір спрайта замка в одиницях «радіуса частоколу» (100). */
const CS_HALF = 140;

function faceEmblem(c: CanvasRenderingContext2D, team: Team, x: number, y: number, s: number) {
  if (team === 1) {
    c.fillStyle = "#fffaf0";
    c.beginPath();
    c.arc(x, y, s, 0, TAU);
    c.fill();
    c.fillStyle = "#f2d3c4";
    c.beginPath();
    c.ellipse(x - s * 0.95, y - s * 0.1, s * 0.3, s * 0.2, -0.3, 0, TAU);
    c.ellipse(x + s * 0.95, y - s * 0.1, s * 0.3, s * 0.2, 0.3, 0, TAU);
    c.fill();
    c.fillStyle = "#3b3532";
    c.beginPath();
    c.arc(x - s * 0.33, y - s * 0.05, s * 0.11, 0, TAU);
    c.arc(x + s * 0.33, y - s * 0.05, s * 0.11, 0, TAU);
    c.arc(x, y + s * 0.3, s * 0.12, 0, TAU);
    c.fill();
  } else {
    c.fillStyle = "#2a2c33";
    c.beginPath();
    c.moveTo(x - s * 0.95, y - s * 1.1);
    c.lineTo(x - s * 0.35, y - s * 0.6);
    c.lineTo(x + s * 0.35, y - s * 0.6);
    c.lineTo(x + s * 0.95, y - s * 1.1);
    c.lineTo(x + s * 0.9, y + s * 0.1);
    c.quadraticCurveTo(x, y + s * 1.1, x - s * 0.9, y + s * 0.1);
    c.closePath();
    c.fill();
    c.fillStyle = "#ffd24a";
    c.beginPath();
    c.arc(x - s * 0.35, y - s * 0.1, s * 0.13, 0, TAU);
    c.arc(x + s * 0.35, y - s * 0.1, s * 0.13, 0, TAU);
    c.fill();
    c.fillStyle = "#e8e8ee";
    c.beginPath();
    c.arc(x, y + s * 0.42, s * 0.1, 0, TAU);
    c.fill();
  }
}

function tower(c: CanvasRenderingContext2D, team: Team, x: number, y: number, stage: 0 | 1 | 2, idx: number) {
  const col = TEAM_COLOR[team];
  if (stage === 2 && idx % 2 === 0) {
    // обвал: купа каміння
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? "#6c6f75" : "#8a8d93";
      c.beginPath();
      c.ellipse(x + Math.cos(i * 2.1) * 11, y + Math.sin(i * 1.7) * 8, 8 + (i % 3) * 2, 6, i, 0, TAU);
      c.fill();
    }
    return;
  }
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(x + 5, y + 14, 24, 10, 0, 0, TAU);
  c.fill();
  c.fillStyle = "#7a5a3a";
  c.fillRect(x - 17, y - 16, 34, 34);
  c.fillStyle = "#946d45";
  c.fillRect(x - 17, y - 16, 11, 34);
  c.strokeStyle = "#4a3320";
  c.lineWidth = 1.6;
  for (let k = -8; k <= 12; k += 10) {
    c.beginPath();
    c.moveTo(x - 17, y + k);
    c.lineTo(x + 17, y + k);
    c.stroke();
  }
  // дах кольору команди
  c.fillStyle = col.main;
  c.beginPath();
  c.moveTo(x - 22, y - 14);
  c.lineTo(x, y - 40);
  c.lineTo(x + 22, y - 14);
  c.closePath();
  c.fill();
  c.fillStyle = col.dark;
  c.beginPath();
  c.moveTo(x, y - 40);
  c.lineTo(x + 22, y - 14);
  c.lineTo(x + 4, y - 14);
  c.closePath();
  c.fill();
  // факел
  c.fillStyle = "#4a3320";
  c.fillRect(x + 20, y - 8, 3, 18);
  c.fillStyle = "#ffb02e";
  c.beginPath();
  c.ellipse(x + 21.5, y - 12, 5, 8, 0, 0, TAU);
  c.fill();
  c.fillStyle = "#fff0a0";
  c.beginPath();
  c.ellipse(x + 21.5, y - 10, 2.2, 4, 0, 0, TAU);
  c.fill();
  if (stage === 1) {
    c.strokeStyle = "rgba(25,12,5,0.85)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 6, y - 14);
    c.lineTo(x + 2, y - 2);
    c.lineTo(x - 5, y + 8);
    c.lineTo(x + 3, y + 17);
    c.stroke();
  }
}

function castleSprite(team: Team, stage: 0 | 1 | 2, q: number): HTMLCanvasElement {
  const key = `${team}|${stage}|${q}`;
  let cv = castles.get(key);
  if (cv) return cv;
  const size = CS_HALF * 2;
  cv = canvas(size * q, size * q);
  const c = cv.getContext("2d");
  if (!c) return cv;
  c.scale(q, q);
  c.translate(CS_HALF, CS_HALF);
  const col = TEAM_COLOR[team];
  // земля двору: бруківка
  const g = c.createRadialGradient(0, 0, 8, 0, 0, 100);
  g.addColorStop(0, "#a58a63");
  g.addColorStop(1, "#7a6444");
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 98, 0, TAU);
  c.fill();
  const r = rng(team * 17 + 5);
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * 90;
    c.fillStyle = r() < 0.5 ? "rgba(60,45,30,0.3)" : "rgba(220,200,160,0.25)";
    c.beginPath();
    c.ellipse(Math.cos(a) * d, Math.sin(a) * d, 5 + r() * 5, 3 + r() * 3, r() * 3, 0, TAU);
    c.fill();
  }
  // кільце кольору команди
  c.strokeStyle = col.main;
  c.lineWidth = 5;
  c.globalAlpha = 0.85;
  c.beginPath();
  c.arc(0, 0, 70, 0, TAU);
  c.stroke();
  c.globalAlpha = 1;
  if (stage === 1 || stage === 2) {
    c.strokeStyle = "rgba(30,20,10,0.7)";
    c.lineWidth = 2.4;
    for (let i = 0; i < (stage === 1 ? 4 : 9); i++) {
      const a = r() * TAU;
      c.beginPath();
      c.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
      c.lineTo(Math.cos(a + 0.2) * 45, Math.sin(a + 0.2) * 45);
      c.lineTo(Math.cos(a - 0.1) * 80, Math.sin(a - 0.1) * 80);
      c.stroke();
    }
  }
  // частокіл: стовпи по колу з проходом знизу (кут ~ π/2)
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.2) continue;
    if (stage >= 1 && (i * 7) % 5 < (stage === 1 ? 1 : 3)) continue;
    const px = Math.cos(a) * 92;
    const py = Math.sin(a) * 92;
    const hgt = stage === 2 ? 12 : stage === 1 && i % 3 === 0 ? 16 : 24;
    c.save();
    c.translate(px, py);
    c.rotate(a + Math.PI / 2);
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(-5, 0, 12, 6);
    c.fillStyle = "#7b5330";
    c.beginPath();
    c.moveTo(-6, 5);
    c.lineTo(-6, -hgt + 6);
    c.lineTo(0, -hgt);
    c.lineTo(6, -hgt + 6);
    c.lineTo(6, 5);
    c.closePath();
    c.fill();
    c.fillStyle = "#9b6b3e";
    c.fillRect(-6, -hgt + 6, 3, hgt - 1);
    c.restore();
  }
  // вежі в кутах
  [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].forEach((a, idx) => tower(c, team, Math.cos(a) * 96, Math.sin(a) * 96, stage, idx));
  // прапори/баннери з мордою
  if (stage < 2) {
    for (const a of [-Math.PI / 2, Math.PI + 0.35, -0.35]) {
      const px = Math.cos(a) * 66;
      const py = Math.sin(a) * 66;
      c.fillStyle = "#4a3320";
      c.fillRect(px - 2, py - 34, 4, 38);
      c.fillStyle = col.main;
      c.beginPath();
      c.moveTo(px + 2, py - 34);
      c.lineTo(px + 30, py - 31);
      c.lineTo(px + 30, py - 5);
      c.lineTo(px + 16, py - 12);
      c.lineTo(px + 2, py - 5);
      c.closePath();
      c.fill();
      c.strokeStyle = col.dark;
      c.lineWidth = 1.5;
      c.stroke();
      faceEmblem(c, team, px + 16, py - 21, 6.5);
    }
  } else {
    // зламаний прапор
    c.fillStyle = col.dark;
    c.beginPath();
    c.moveTo(-30, 52);
    c.lineTo(-8, 56);
    c.lineTo(-14, 66);
    c.lineTo(-34, 62);
    c.closePath();
    c.fill();
  }
  castles.set(key, cv);
  return cv;
}

/** Стадія руйнування за часткою HP: 0 цілий (>60%), 1 тріщини (25-60%), 2 обвал (<25%). */
export function castleStage(hp: number, hpMax: number): 0 | 1 | 2 {
  const f = hpMax > 0 ? hp / hpMax : 1;
  return f > 0.6 ? 0 : f >= 0.25 ? 1 : 2;
}

/** Замок команди: двір, частокіл, вежі, кристал (пульсує), камені у сховищі дугою знизу. */
export function drawCastle(ctx: CanvasRenderingContext2D, cfg: CastleCfg, team: Team, hp: number, hpMax: number, stock: number, time: number, pxPerUnit: number) {
  const k = castleOf(cfg, team);
  const unit = (k.r * 0.5) / 100; // піврозмір двору: половина радіуса бази
  const stage = castleStage(hp, hpMax);
  const q = quant(pxPerUnit * unit * 1.4);
  const sz = CS_HALF * 2 * unit;
  ctx.drawImage(castleSprite(team, stage, q), k.x - sz / 2, k.y - sz / 2, sz, sz);
  const pulse = 1 + (stage === 2 ? 0 : Math.sin(time * 3 + team) * 0.05);
  const cs = 150 * unit * pulse;
  ctx.drawImage(crystalSprite(team, stage), k.x - cs / 2, k.y - cs / 2 - 8 * unit, cs, cs);
  // сховище: стільки камінців, скільки лишилось
  const n = Math.max(0, Math.min(8, stock));
  const ms = 30 * unit;
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.32;
    ctx.drawImage(stoneSprite(team), k.x + Math.cos(a) * 52 * unit - ms / 2, k.y + Math.sin(a) * 52 * unit - ms / 2, ms, ms);
  }
}

// ---------------------------------------------------------------- зона бази й маркери
const zones = new Map<number, HTMLCanvasElement>();
export function drawBaseZone(ctx: CanvasRenderingContext2D, cfg: CastleCfg, team: Team) {
  const k = castleOf(cfg, team);
  let cv = zones.get(team);
  if (!cv) {
    cv = canvas(256, 256);
    const c = cv.getContext("2d");
    if (c) {
      const col = TEAM_COLOR[team];
      const g = c.createRadialGradient(128, 128, 20, 128, 128, 126);
      g.addColorStop(0, `${col.main}22`);
      g.addColorStop(0.8, `${col.main}30`);
      g.addColorStop(1, `${col.main}00`);
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
      c.setLineDash([10, 8]);
      c.strokeStyle = `${col.main}cc`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(128, 128, 118, 0, TAU);
      c.stroke();
    }
    zones.set(team, cv);
  }
  ctx.drawImage(cv, k.x - k.r, k.y - k.r, k.r * 2, k.r * 2);
}

export function resetCastleArtCache() {
  waterPatterns.clear();
  shores.clear();
  bridges.clear();
  chunks.clear();
  stones.clear();
  castles.clear();
  zones.clear();
}
