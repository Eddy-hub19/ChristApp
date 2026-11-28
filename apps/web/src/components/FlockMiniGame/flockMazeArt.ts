/**
 * Графіка режиму «Лабіринт»: печера. Світ малюється ПО КЛІТИНАХ видимої області з кешованих спрайтів (плити підлоги з сіткою й тріщинами,
 * кам'яні стіни з тінню, смолоскипи з кешованим ореолом і мерехтінням 2-3 кадри на спільній фазі, гриби й кристали в нішах,
 * кристал-фініш із променями). Без shadowBlur, без одного величезного полотна, без перестворення спрайтів на кадрі.
 * Палітра не залежить від теми застосунку. При «зменшити рух» мерехтіння й пульсації вимкнено.
 */
import { OPEN_E, OPEN_N, OPEN_S, OPEN_W, cellCenter, type MazeGrid, type MazeView } from "./flockMaze";
import { prefersReducedMotion } from "./flockSprites";

const TAU = Math.PI * 2;

const C = {
  void: "#0b0c15",
  floorA: "#33364d",
  floorB: "#2b2e43",
  floorGrid: "rgba(12,13,24,0.55)",
  floorHi: "rgba(160,170,220,0.10)",
  crack: "rgba(10,11,20,0.5)",
  wallTop: "#7a80a6",
  wallMid: "#555b7e",
  wallLow: "#3b3f5c",
  wallJoint: "rgba(14,15,28,0.55)",
  wallHi: "rgba(220,225,255,0.28)",
  shadow: "rgba(4,5,12,0.5)",
  torch: "#ffb347",
  torchHot: "#fff1a8",
  ember: "#8a6a4a",
  shroom: "#45e6c8",
  shroomCap: "#2bbfa5",
  crystalA: "#8fe9ff",
  crystalB: "#a58bff",
  finish: "#7ff0ff",
  start: "#ffd978",
  mini: { bg: "rgba(10,11,22,0.9)", cell: "rgba(120,128,170,0.55)", wall: "rgba(190,196,235,0.9)", fin: "#7ff0ff", me: "#ffd24a" },
} as const;

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
/** Стабільний хеш клітини (для варіантів плит і декору): не залежить від ГПСЧ сітки. */
const cellHash = (x: number, y: number) => {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

const sprites = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement) {
  let s = sprites.get(key);
  if (!s) {
    s = make();
    sprites.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------- підлога
const FLOOR_VARIANTS = 4;
function floorTile(variant: number, cell: number, q: number) {
  return cached(`floor|${variant}|${cell}|${q}`, () => {
    const cv = canvas(cell * q, cell * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    const g = c.createLinearGradient(0, 0, cell, cell);
    g.addColorStop(0, C.floorA);
    g.addColorStop(1, C.floorB);
    c.fillStyle = g;
    c.fillRect(0, 0, cell, cell);
    // плитка 2x2 всередині клітини з видимою сіткою швів
    const half = cell / 2;
    c.strokeStyle = C.floorGrid;
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, cell - 3, cell - 3);
    c.beginPath();
    c.moveTo(half, 0);
    c.lineTo(half, cell);
    c.moveTo(0, half);
    c.lineTo(cell, half);
    c.stroke();
    // м'який блік на верхньо-лівих гранях плит
    c.strokeStyle = C.floorHi;
    c.lineWidth = 2;
    c.beginPath();
    for (const [ox, oy] of [[0, 0], [half, 0], [0, half], [half, half]]) {
      c.moveTo(ox + 4, oy + half - 4);
      c.lineTo(ox + 4, oy + 4);
      c.lineTo(ox + half - 4, oy + 4);
    }
    c.stroke();
    // тріщини й крапки різні за варіантом
    const r = rng(1000 + variant * 77);
    c.strokeStyle = C.crack;
    c.lineWidth = 1.6;
    c.lineCap = "round";
    for (let k = 0; k < 2 + (variant % 2); k++) {
      let x = r() * cell;
      let y = r() * cell;
      c.beginPath();
      c.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (r() - 0.5) * 46;
        y += (r() - 0.5) * 46;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = "rgba(10,11,22,0.25)";
    for (let k = 0; k < 14; k++) {
      c.beginPath();
      c.arc(r() * cell, r() * cell, 1 + r() * 2.2, 0, TAU);
      c.fill();
    }
    return cv;
  });
}

// ---------------------------------------------------------------- стіни
const SH = 20; // поля під м'яку тінь навколо стіни (одиниць світу)

function wallBody(horizontal: boolean, len: number, thick: number, q: number) {
  return cached(`wall|${horizontal ? "h" : "v"}|${len}|${thick}|${q}`, () => {
    const w = horizontal ? len : thick;
    const h = horizontal ? thick : len;
    const cv = canvas(w * q, h * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    // тіло: світла верхня грань, темна нижня
    const g = horizontal ? c.createLinearGradient(0, 0, 0, h) : c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, C.wallTop);
    g.addColorStop(0.35, C.wallMid);
    g.addColorStop(1, C.wallLow);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // цегляна кладка: стики
    c.strokeStyle = C.wallJoint;
    c.lineWidth = 2;
    const brick = 52;
    c.beginPath();
    if (horizontal) {
      c.moveTo(0, h / 2);
      c.lineTo(w, h / 2);
      for (let x = 0; x < w; x += brick) {
        c.moveTo(x + 6, 0);
        c.lineTo(x + 6, h / 2);
        c.moveTo(x + 6 + brick / 2, h / 2);
        c.lineTo(x + 6 + brick / 2, h);
      }
    } else {
      c.moveTo(w / 2, 0);
      c.lineTo(w / 2, h);
      for (let y = 0; y < h; y += brick) {
        c.moveTo(0, y + 6);
        c.lineTo(w / 2, y + 6);
        c.moveTo(w / 2, y + 6 + brick / 2);
        c.lineTo(w, y + 6 + brick / 2);
      }
    }
    c.stroke();
    // блік по верхній/лівій кромці й темний кант
    c.fillStyle = C.wallHi;
    if (horizontal) c.fillRect(0, 0, w, 3);
    else c.fillRect(0, 0, 3, h);
    c.strokeStyle = "rgba(8,9,18,0.7)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, w - 2, h - 2);
    return cv;
  });
}

function wallShadow(horizontal: boolean, len: number, thick: number, q: number) {
  return cached(`wsh|${horizontal ? "h" : "v"}|${len}|${thick}|${q}`, () => {
    const w = (horizontal ? len : thick) + SH * 2;
    const h = (horizontal ? thick : len) + SH * 2;
    const cv = canvas(w * q, h * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    // дві смуги градієнта по боках (без blur)
    const make = (x0: number, y0: number, x1: number, y1: number, gx0: number, gy0: number, gx1: number, gy1: number) => {
      const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, C.shadow);
      g.addColorStop(1, "rgba(4,5,12,0)");
      c.fillStyle = g;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    };
    if (horizontal) {
      make(SH, 0, SH + len, SH, 0, SH, 0, 0);
      make(SH, SH + thick, SH + len, h, 0, SH + thick, 0, h);
    } else {
      make(0, SH, SH, SH + len, SH, 0, 0, 0);
      make(SH + thick, SH, w, SH + len, SH + thick, 0, w, 0);
    }
    return cv;
  });
}

// ---------------------------------------------------------------- смолоскипи, гриби, кристали, фініш, старт
const FLAME_SEQ = [0, 1, 2, 1];

function halo(rad: number, color: string, q: number, key: string, alpha = 1) {
  return cached(`halo|${key}|${rad}|${q}`, () => {
    const cv = canvas(rad * 2 * q, rad * 2 * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    const g = c.createRadialGradient(rad, rad, 0, rad, rad, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.globalAlpha = alpha;
    c.fillStyle = g;
    c.fillRect(0, 0, rad * 2, rad * 2);
    return cv;
  });
}

const TORCH_W = 90;
const TORCH_H = 150;
function torchSprite(lit: boolean, frame: number, q: number) {
  return cached(`torch|${lit ? 1 : 0}|${frame}|${q}`, () => {
    const cv = canvas(TORCH_W * q, TORCH_H * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    const cx = TORCH_W / 2;
    // чаша-жаровня на стійці
    c.fillStyle = "#4a3b33";
    c.fillRect(cx - 5, 78, 10, 62);
    c.fillStyle = "#6b5849";
    c.beginPath();
    c.moveTo(cx - 22, 66);
    c.lineTo(cx + 22, 66);
    c.lineTo(cx + 13, 90);
    c.lineTo(cx - 13, 90);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(10,8,12,0.8)";
    c.lineWidth = 2;
    c.stroke();
    // полум'я: три кадри різної форми
    const sway = [-4, 3, 0][frame];
    const hgt = lit ? [46, 40, 52][frame] : 14;
    const wid = lit ? [15, 17, 14][frame] : 9;
    const outer = lit ? C.torch : C.ember;
    c.fillStyle = outer;
    c.beginPath();
    c.moveTo(cx - wid, 68);
    c.quadraticCurveTo(cx - wid * 1.1, 68 - hgt * 0.5, cx + sway, 68 - hgt);
    c.quadraticCurveTo(cx + wid * 1.1, 68 - hgt * 0.5, cx + wid, 68);
    c.closePath();
    c.fill();
    if (lit) {
      c.fillStyle = C.torchHot;
      c.beginPath();
      c.moveTo(cx - wid * 0.5, 68);
      c.quadraticCurveTo(cx - wid * 0.6, 68 - hgt * 0.35, cx + sway * 0.6, 68 - hgt * 0.62);
      c.quadraticCurveTo(cx + wid * 0.6, 68 - hgt * 0.35, cx + wid * 0.5, 68);
      c.closePath();
      c.fill();
    }
    return cv;
  });
}

function mushroomSprite(variant: number, q: number) {
  return cached(`shroom|${variant}|${q}`, () => {
    const S = 90;
    const cv = canvas(S * q, S * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    const caps: [number, number, number][] = [
      [30, 58, 16],
      [54, 64, 12],
      [44, 44, 20],
    ];
    for (const [x, y, r] of caps) {
      c.fillStyle = "#cfe9e4";
      c.fillRect(x - 3, y, 6, 22);
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r * 1.2);
      g.addColorStop(0, "#9ffbe9");
      g.addColorStop(1, variant % 2 ? C.shroomCap : "#4aa8f0");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, r, r * 0.7, 0, Math.PI, TAU);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.beginPath();
      c.arc(x - r * 0.3, y - r * 0.3, 2, 0, TAU);
      c.arc(x + r * 0.25, y - r * 0.15, 1.5, 0, TAU);
      c.fill();
    }
    return cv;
  });
}

function crystalSprite(variant: number, q: number) {
  return cached(`crystal|${variant}|${q}`, () => {
    const S = 96;
    const cv = canvas(S * q, S * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    const shards: [number, number, number, number][] = [
      [34, 80, 18, 56],
      [56, 84, 22, 70],
      [74, 78, 14, 40],
    ];
    for (const [x, y, w, h] of shards) {
      const g = c.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
      g.addColorStop(0, "#d8f8ff");
      g.addColorStop(1, variant % 2 ? C.crystalB : C.crystalA);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - w / 2, y);
      c.lineTo(x - w / 3, y - h * 0.7);
      c.lineTo(x, y - h);
      c.lineTo(x + w / 3, y - h * 0.7);
      c.lineTo(x + w / 2, y);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(10,12,30,0.65)";
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.beginPath();
      c.moveTo(x - w / 4, y - 4);
      c.lineTo(x - w / 8, y - h * 0.65);
      c.stroke();
    }
    return cv;
  });
}

function finishSprite(cell: number, q: number) {
  return cached(`finish|${cell}|${q}`, () => {
    const S = cell * 1.5;
    const cv = canvas(S * q, S * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    const cx = S / 2;
    const cy = S / 2;
    // промені
    const rays = 14;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      const g = c.createLinearGradient(cx, cy, cx + Math.cos(a) * S * 0.48, cy + Math.sin(a) * S * 0.48);
      g.addColorStop(0, "rgba(160,245,255,0.55)");
      g.addColorStop(1, "rgba(160,245,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, S * 0.48, a - 0.07, a + 0.07);
      c.closePath();
      c.fill();
    }
    // великий кристал
    const h = cell * 0.62;
    const w = cell * 0.34;
    const g = c.createLinearGradient(cx - w, cy - h, cx + w, cy + h * 0.6);
    g.addColorStop(0, "#f0fdff");
    g.addColorStop(0.5, C.finish);
    g.addColorStop(1, "#6c8cff");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx, cy - h);
    c.lineTo(cx + w, cy - h * 0.25);
    c.lineTo(cx + w * 0.7, cy + h * 0.55);
    c.lineTo(cx, cy + h * 0.7);
    c.lineTo(cx - w * 0.7, cy + h * 0.55);
    c.lineTo(cx - w, cy - h * 0.25);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(10,14,40,0.75)";
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx, cy - h);
    c.lineTo(cx - w * 0.2, cy + h * 0.65);
    c.moveTo(cx - w, cy - h * 0.25);
    c.lineTo(cx + w * 0.7, cy + h * 0.55);
    c.stroke();
    return cv;
  });
}

function runeSprite(size: number, q: number) {
  return cached(`rune|${size}|${q}`, () => {
    const cv = canvas(size * q, size * q);
    const c = cv.getContext("2d");
    if (!c) return cv;
    c.scale(q, q);
    const cx = size / 2;
    c.strokeStyle = "rgba(255,217,120,0.55)";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(cx, cx, size * 0.42, 0, TAU);
    c.stroke();
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(cx, cx, size * 0.32, 0, TAU);
    c.stroke();
    // зарубки по колу
    c.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * size * 0.32, cx + Math.sin(a) * size * 0.32);
      c.lineTo(cx + Math.cos(a) * size * 0.42, cx + Math.sin(a) * size * 0.42);
      c.stroke();
    }
    return cv;
  });
}

// ---------------------------------------------------------------- допоміжне (геометрія контракту: стіна - смуга `wall`, ліва/верхня межа лінії i на o + i*cell)
const ctr = (g: MazeGrid, i: number) => {
  const [x, y] = cellCenter(g, i);
  return { x, y };
};
const openCount = (m: number) => (m & OPEN_N ? 1 : 0) + (m & OPEN_E ? 1 : 0) + (m & OPEN_S ? 1 : 0) + (m & OPEN_W ? 1 : 0);

// ---------------------------------------------------------------- декор у нішах (детерміновано за сіткою)
interface Deco {
  kind: "shroom" | "crystal";
  x: number;
  y: number;
  v: number;
}
const decoCache = new WeakMap<MazeGrid, Deco[]>();
function decoFor(g: MazeGrid): Deco[] {
  let d = decoCache.get(g);
  if (d) return d;
  d = [];
  const off = (g.cell - g.wall) * 0.27;
  const isRoom = new Set(g.startRoom);
  const onPath = new Set(g.path);
  for (let i = 0; i < g.cols * g.rows; i++) {
    if (isRoom.has(i)) continue;
    const m = g.open[i];
    const n = openCount(m);
    const x = i % g.cols;
    const y = Math.floor(i / g.cols);
    const h = cellHash(x, y);
    const c = ctr(g, i);
    if (n === 1) {
      // глухий кут: декор біля закритого кінця (протилежно до єдиного відкритого проходу)
      let ox = 0;
      let oy = 0;
      if (m & OPEN_N) oy = off;
      else if (m & OPEN_S) oy = -off;
      else if (m & OPEN_E) ox = -off;
      else ox = off;
      d.push({ kind: h % 3 === 0 ? "crystal" : "shroom", x: c.x + ox, y: c.y + oy, v: h >> 4 });
    } else if (n === 2 && !onPath.has(i) && h % 3 === 0) {
      // ніша в куті
      d.push({ kind: h % 2 ? "shroom" : "crystal", x: c.x + ((h >> 3) & 1 ? off : -off), y: c.y + ((h >> 5) & 1 ? off : -off), v: h >> 4 });
    }
  }
  decoCache.set(g, d);
  return d;
}

// ---------------------------------------------------------------- малювання світу
/**
 * Печера під клітинами, їжею й гравцями: підлога, розмітка старту, ніші, тіні й тіла стін, смолоскипи, кристал-фініш.
 * px - пікселів на одиницю світу (scale * dpr); x0..y1 - видима область у світових координатах (ctx уже у світових).
 */
export function drawMazeWorld(ctx: CanvasRenderingContext2D, v: MazeView, x0: number, x1: number, y0: number, y1: number, px: number, time: number) {
  const g = v.grid;
  const q = quant(px);
  const animate = !prefersReducedMotion();
  const cell = g.cell;
  const wall = g.wall;
  ctx.fillStyle = C.void;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const cx0 = Math.max(0, Math.floor((x0 - g.ox) / cell) - 1);
  const cx1 = Math.min(g.cols - 1, Math.floor((x1 - g.ox) / cell) + 1);
  const cy0 = Math.max(0, Math.floor((y0 - g.oy) / cell) - 1);
  const cy1 = Math.min(g.rows - 1, Math.floor((y1 - g.oy) / cell) + 1);
  if (cx1 < cx0 || cy1 < cy0) return;

  // 1. підлога: блок клітини (внутрішність + ліва/верхня смуга стіни; стіни лягають поверх)
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      ctx.drawImage(floorTile(cellHash(cx, cy) % FLOOR_VARIANTS, cell, q), g.ox + cx * cell, g.oy + cy * cell, cell, cell);
    }
  }
  // 2. кімната старту: тепле підсвічення й руна по центру
  {
    const rw = cell * 2 - wall;
    const rx = g.ox + wall + rw / 2;
    const ry = g.oy + wall + rw / 2;
    if (rx > x0 - cell * 2 && rx < x1 + cell * 2 && ry > y0 - cell * 2 && ry < y1 + cell * 2) {
      ctx.fillStyle = "rgba(255,217,120,0.07)";
      ctx.fillRect(g.ox + wall, g.oy + wall, rw, rw);
      const rs = cell * 1.7;
      ctx.drawImage(runeSprite(Math.round(rs), q), rx - rs / 2, ry - rs / 2, rs, rs);
    }
  }
  // 3. ніші: гриби й кристали (з ореолом)
  for (const d of decoFor(g)) {
    if (d.x < x0 - 80 || d.x > x1 + 80 || d.y < y0 - 80 || d.y > y1 + 80) continue;
    const S = 92;
    ctx.drawImage(halo(70, d.kind === "shroom" ? "rgba(69,230,200,0.40)" : "rgba(143,233,255,0.38)", q, d.kind), d.x - 70, d.y - 62, 140, 140);
    ctx.drawImage(d.kind === "shroom" ? mushroomSprite(d.v & 1, q) : crystalSprite(d.v & 1, q), d.x - S / 2, d.y - S * 0.7, S, S);
  }
  // 4. тіні стін, потім тіла (щоб тінь не лягала на сусідні стіни). Стіна - смуга `wall`: горизонтальна
  // над клітиною (c,r) закрита, якщо r == 0 або нема проходу на північ; вертикальна ліворуч - якщо c == 0 або нема проходу на захід.
  // Нижня й права межа малюються для останнього ряду / стовпця.
  const len = cell + wall;
  const hBar = (c: number, r: number) => (r <= 0 || r >= g.rows ? true : !(g.open[r * g.cols + c] & OPEN_N));
  const vBar = (c: number, r: number) => (c <= 0 || c >= g.cols ? true : !(g.open[r * g.cols + c] & OPEN_W));
  for (let pass = 0; pass < 2; pass++) {
    for (let cy = cy0; cy <= cy1 + 1; cy++) {
      for (let cx = cx0; cx <= cx1 + 1; cx++) {
        const bx = g.ox + cx * cell;
        const by = g.oy + cy * cell;
        const h = cx < g.cols && cy <= g.rows && hBar(cx, cy);
        const vv = cy < g.rows && cx <= g.cols && vBar(cx, cy);
        if (pass === 0) {
          if (h) ctx.drawImage(wallShadow(true, len, wall, q), bx - SH, by - SH, len + SH * 2, wall + SH * 2);
          if (vv) ctx.drawImage(wallShadow(false, len, wall, q), bx - SH, by - SH, wall + SH * 2, len + SH * 2);
        } else {
          if (h) ctx.drawImage(wallBody(true, len, wall, q), bx, by, len, wall);
          if (vv) ctx.drawImage(wallBody(false, len, wall, q), bx, by, wall, len);
          // стовп на перетині ліній (є завжди, навіть без сусідніх смуг)
          ctx.drawImage(wallBody(true, wall, wall, q), bx, by, wall, wall);
        }
      }
    }
  }
  // 5. смолоскипи-чекпоінти (одна фаза мерехтіння на всіх)
  const frame = animate ? FLAME_SEQ[Math.floor(time * 8) % FLAME_SEQ.length] : 0;
  for (let k = 0; k < g.checkpoints.length; k++) {
    const c = ctr(g, g.checkpoints[k]);
    if (c.x < x0 - 200 || c.x > x1 + 200 || c.y < y0 - 200 || c.y > y1 + 200) continue;
    const lit = v.lit[k] === true;
    const hr = lit ? 190 : 80;
    ctx.drawImage(halo(hr, lit ? "rgba(255,179,71,0.55)" : "rgba(160,170,220,0.22)", q, lit ? "torchOn" : "torchOff"), c.x - hr, c.y - hr - 34, hr * 2, hr * 2);
    ctx.drawImage(torchSprite(lit, frame, q), c.x - TORCH_W / 2, c.y - TORCH_H * 0.7, TORCH_W, TORCH_H);
  }
  // 6. кристал-фініш (пульс лише коли можна рухатись)
  {
    const fx = g.finishX;
    const fy = g.finishY;
    if (fx > x0 - cell * 2 && fx < x1 + cell * 2 && fy > y0 - cell * 2 && fy < y1 + cell * 2) {
      const pulse = animate ? 1 + Math.sin(time * 2.2) * 0.04 : 1;
      const inner = cell - wall;
      ctx.fillStyle = "rgba(127,240,255,0.10)";
      ctx.fillRect(fx - inner / 2, fy - inner / 2, inner, inner);
      ctx.drawImage(halo(cell * 0.9, "rgba(127,240,255,0.5)", q, "finish"), fx - cell * 0.9, fy - cell * 0.9, cell * 1.8, cell * 1.8);
      const s = cell * 1.5 * pulse;
      ctx.drawImage(finishSprite(cell, q), fx - s / 2, fy - s / 2, s, s);
    }
  }
}

// ---------------------------------------------------------------- ефекти клітин (розчинення, захист)
/** Розчинення з'їденої клітини: кільце, що розходиться, і зменшувана світла пляма (t - вік анімації в мс). */
export function drawMazeDissolve(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ageMs: number, dissolveMs: number) {
  const k = Math.min(1, ageMs / Math.max(1, dissolveMs));
  ctx.save();
  ctx.globalAlpha = (1 - k) * 0.8;
  ctx.strokeStyle = "#e9f6ff";
  ctx.lineWidth = Math.max(2, r * 0.12 * (1 - k));
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + k * 0.9), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = "#cfe8ff";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + k * 1.2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * (0.5 + k * 1.1), y + Math.sin(a) * r * (0.5 + k * 1.1), Math.max(1.5, r * 0.1 * (1 - k)), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Мигаючий контур захисту після відродження (≈3 Гц); при «зменшити рух» - постійний тонкий контур. */
export function drawMazeShield(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, scale: number) {
  const blink = prefersReducedMotion() ? true : Math.floor(time * 6) % 2 === 0;
  ctx.save();
  ctx.globalAlpha = blink ? 0.95 : 0.35;
  ctx.strokeStyle = "#9fe8ff";
  ctx.lineWidth = Math.max(2.5 / scale, r * 0.09);
  ctx.setLineDash([r * 0.45, r * 0.25]);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.28, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- мінікарта з туманом
/**
 * Мінікарта: тільки власна позиція, відвідані клітини (з їхніми стінами) і фініш. Інших учасників не показуємо взагалі.
 * Викликати після того, як мінікарта вже залита фоном.
 */
export function drawMazeMinimap(ctx: CanvasRenderingContext2D, v: MazeView, size: number, ownX: number, ownY: number) {
  const g = v.grid;
  const k = size / v.params.world;
  ctx.fillStyle = C.mini.bg;
  ctx.fillRect(0, 0, size, size);
  const cs = g.cell * k;
  const wk = Math.max(1, g.wall * k);
  // відвідані клітини (блок клітини)
  ctx.fillStyle = C.mini.cell;
  for (let i = 0; i < g.cols * g.rows; i++) {
    if (!v.visited[i]) continue;
    ctx.fillRect((g.ox + (i % g.cols) * g.cell) * k, (g.oy + Math.floor(i / g.cols) * g.cell) * k, cs, cs);
  }
  // їхні стіни: по осях смуг (верх, ліво, низ, право)
  ctx.strokeStyle = C.mini.wall;
  ctx.lineWidth = wk;
  ctx.lineCap = "square";
  ctx.beginPath();
  const half = wk / 2;
  for (let i = 0; i < g.cols * g.rows; i++) {
    if (!v.visited[i]) continue;
    const m = g.open[i];
    const c = i % g.cols;
    const r = Math.floor(i / g.cols);
    const x = (g.ox + c * g.cell) * k;
    const y = (g.oy + r * g.cell) * k;
    if (!(m & OPEN_N)) {
      ctx.moveTo(x, y + half);
      ctx.lineTo(x + cs + wk, y + half);
    }
    if (!(m & OPEN_W)) {
      ctx.moveTo(x + half, y);
      ctx.lineTo(x + half, y + cs + wk);
    }
    if (!(m & OPEN_S)) {
      ctx.moveTo(x, y + cs + half);
      ctx.lineTo(x + cs + wk, y + cs + half);
    }
    if (!(m & OPEN_E)) {
      ctx.moveTo(x + cs + half, y);
      ctx.lineTo(x + cs + half, y + cs + wk);
    }
  }
  ctx.stroke();
  // фініш завжди видно: ромб
  ctx.fillStyle = C.mini.fin;
  ctx.beginPath();
  const fr = Math.max(3.2, cs * 0.45);
  const fx = g.finishX * k;
  const fy = g.finishY * k;
  ctx.moveTo(fx, fy - fr);
  ctx.lineTo(fx + fr, fy);
  ctx.lineTo(fx, fy + fr);
  ctx.lineTo(fx - fr, fy);
  ctx.closePath();
  ctx.fill();
  // своя позиція
  ctx.fillStyle = C.mini.me;
  ctx.beginPath();
  ctx.arc(ownX * k, ownY * k, 3.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** Стрілка до фінішу біля краю екрана (лише коли фініш за межами видимого й минув hintArrowAfterMs; 0 - вимкнена). */
export function drawMazeFinishArrow(ctx: CanvasRenderingContext2D, v: MazeView, W: number, H: number, scale: number, camX: number, camY: number, time: number) {
  const after = v.extras.hintArrowAfterMs;
  if (after <= 0 || v.roundMs < after) return;
  const fx = v.grid.finishX;
  const fy = v.grid.finishY;
  const sx = W / 2 + (fx - camX) * scale;
  const sy = H / 2 + (fy - camY) * scale;
  const pad = 36;
  if (sx > pad && sx < W - pad && sy > pad && sy < H - pad) return;
  const ang = Math.atan2(fy - camY, fx - camX);
  const ex = Math.max(pad, Math.min(W - pad, sx));
  const ey = Math.max(pad, Math.min(H - pad, sy));
  const bob = prefersReducedMotion() ? 0 : Math.sin(time * 5) * 2;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(ang);
  ctx.translate(bob, 0);
  ctx.fillStyle = C.finish;
  ctx.strokeStyle = "rgba(8,12,30,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
