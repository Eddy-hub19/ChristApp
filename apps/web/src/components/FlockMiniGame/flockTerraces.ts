/**
 * Карта «Небесні тераси» (командний режим «Замки»): небо з хмарами, острови з травою й обривами, дощані мости, водоспади, вітряки й
 * руїни, мінікарта. Усе малюється один раз у кешовані спрайти (без shadowBlur на кадрі); палітра не залежить від теми застосунку.
 * Геометрія (острови, мости) приходить із welcome (CastleCfg.terraces) і збігається з серверною (flock.terraces.ts).
 */
import { circleOnTerrace, terraceBridgeAt, terraceOnLand, type CastleCfg, type TerracesCfg } from "./flockCastles";
import type { Decor } from "./flockCastles";

const TAU = Math.PI * 2;

function rng(seed: number) {
  let s = (Math.floor(seed) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function canvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

// ---------- небо й хмари ----------
let skyCv: HTMLCanvasElement | null = null;
const cloudCache = new Map<number, HTMLCanvasElement>();

function cloudSprite(v: number) {
  let cv = cloudCache.get(v);
  if (cv) return cv;
  cv = canvas(360, 180);
  const c = cv.getContext("2d");
  if (c) {
    const r = rng(40 + v);
    const puffs = 7 + v * 2;
    // тінь знизу, тіло, світлий верх
    for (const [col, dy, shrink] of [["rgba(140,175,215,0.55)", 16, 1], ["#ffffff", 0, 1], ["rgba(255,255,255,0.85)", -10, 0.7]] as [string, number, number][]) {
      c.fillStyle = col;
      for (let i = 0; i < puffs; i++) {
        const x = 70 + (i / (puffs - 1)) * 220 + (r() - 0.5) * 20;
        const rad = (34 + r() * 30 + Math.sin((i / puffs) * Math.PI) * 26) * shrink;
        c.beginPath();
        c.arc(x, 105 + dy - Math.sin((i / puffs) * Math.PI) * 18, rad, 0, TAU);
        c.fill();
      }
    }
  }
  cloudCache.set(v, cv);
  return cv;
}

function skyGradient() {
  if (skyCv) return skyCv;
  skyCv = canvas(8, 512);
  const c = skyCv.getContext("2d");
  if (c) {
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#7fc4f4");
    g.addColorStop(0.55, "#b5def8");
    g.addColorStop(1, "#d8eefb");
    c.fillStyle = g;
    c.fillRect(0, 0, 8, 512);
  }
  return skyCv;
}

/** Небо на всю видиму область (світ + запас за краєм) і хмари, що повільно пливуть вздовж x. */
function drawSky(ctx: CanvasRenderingContext2D, world: number, x0: number, x1: number, y0: number, y1: number, time: number) {
  const lo = Math.max(-1200, x0);
  const hi = Math.min(world + 1200, x1);
  const top = Math.max(-1200, y0);
  const bot = Math.min(world + 1200, y1);
  ctx.drawImage(skyGradient(), lo, top, hi - lo, bot - top);
  const r = rng(7);
  const span = world + 1200;
  for (let i = 0; i < 46; i++) {
    const baseX = r() * span - 600;
    const y = r() * (world + 800) - 400;
    const s = 0.9 + r() * 1.5;
    const speed = 5 + r() * 9;
    const v = Math.floor(r() * 3);
    const x = ((baseX + time * speed) % span + span) % span - 600;
    const w = 360 * s;
    const h = 180 * s;
    if (x + w < x0 || x > x1 || y + h < y0 || y > y1) continue;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(cloudSprite(v), x, y, w, h);
  }
  ctx.globalAlpha = 1;
}

// ---------- острови ----------
const islandCache = new Map<string, { cv: HTMLCanvasElement; ox: number; oy: number; k: number }>();
const CLIFF = 96;

function islandSprite(g: TerracesCfg, idx: number, seed: number) {
  const key = `${seed}|${idx}`;
  const hit = islandCache.get(key);
  if (hit) return hit;
  const circles = g.islands[idx];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [cx, cy, r] of circles) {
    x0 = Math.min(x0, cx - r - 30);
    y0 = Math.min(y0, cy - r - 30);
    x1 = Math.max(x1, cx + r + 30);
    y1 = Math.max(y1, cy + r + CLIFF + 60);
  }
  const k = 0.7; // пікселів на світову одиницю
  const cv = canvas((x1 - x0) * k, (y1 - y0) * k);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(k, k);
    c.translate(-x0, -y0);
    const fillUnion = (fill: string | CanvasGradient, dy: number, grow = 0) => {
      c.fillStyle = fill;
      for (const [cx, cy, r] of circles) {
        c.beginPath();
        c.arc(cx, cy + dy, r + grow, 0, TAU);
        c.fill();
      }
    };
    // тінь на небі
    fillUnion("rgba(90,120,170,0.22)", CLIFF + 30, 10);
    // обрив: скеля, що звужується вниз (кілька шарів), із прожилками
    const rock = c.createLinearGradient(0, y0, 0, y1);
    rock.addColorStop(0, "#a79c8e");
    rock.addColorStop(1, "#6a6058");
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      fillUnion(i % 2 ? "#9b8f82" : (rock as CanvasGradient), CLIFF * (1 - t) + 6, -t * 42);
    }
    // бурульки скелі знизу
    const rr = rng(idx * 17 + seed);
    c.fillStyle = "#7a7067";
    for (const [cx, cy, r] of circles) {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.25 + rr() * 0.5);
        const px = cx + Math.cos(a) * r * (0.5 + rr() * 0.4);
        const py = cy + CLIFF * 0.9 + Math.sin(a) * r * 0.25;
        c.beginPath();
        c.moveTo(px - 12, py);
        c.lineTo(px + 12, py);
        c.lineTo(px + (rr() - 0.5) * 12, py + 30 + rr() * 40);
        c.closePath();
        c.fill();
      }
    }
    // ґрунт і краєчок трави
    fillUnion("#8a6a45", 12, 2);
    fillUnion("#79b83f", 0, 0);
    const gg = c.createRadialGradient(circles[0][0], circles[0][1], 10, circles[0][0], circles[0][1], circles[0][2] * 1.3);
    gg.addColorStop(0, "#9fdc5f");
    gg.addColorStop(1, "#6ab43a");
    fillUnion(gg, 0, -8);
    // світла кромка зверху
    c.strokeStyle = "rgba(220,255,170,0.55)";
    c.lineWidth = 6;
    for (const [cx, cy, r] of circles) {
      c.beginPath();
      c.arc(cx, cy - 2, r - 6, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
    // плитки-стежка, трава, квіти
    const r2 = rng(idx * 91 + seed);
    for (let i = 0; i < 220; i++) {
      const [cx, cy, rad] = circles[Math.floor(r2() * circles.length)];
      const a = r2() * TAU;
      const d = Math.sqrt(r2()) * (rad - 26);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (i % 4 === 0) {
        c.strokeStyle = "rgba(60,130,40,0.55)";
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(x - 4, y + 4);
        c.lineTo(x - 5, y - 6);
        c.moveTo(x, y + 4);
        c.lineTo(x + 1, y - 8);
        c.moveTo(x + 4, y + 4);
        c.lineTo(x + 6, y - 5);
        c.stroke();
      } else if (i % 4 === 1) {
        c.fillStyle = ["#ffffff", "#ffd8e6", "#ffe98a", "#d9c4ff"][i % 3 | 0] ?? "#fff";
        c.beginPath();
        c.arc(x, y, 3.2, 0, TAU);
        c.fill();
        c.fillStyle = "#f5b82e";
        c.beginPath();
        c.arc(x, y, 1.2, 0, TAU);
        c.fill();
      } else {
        c.fillStyle = "rgba(255,255,255,0.12)";
        c.beginPath();
        c.ellipse(x, y, 14, 6, r2() * 3, 0, TAU);
        c.fill();
      }
    }
  }
  const out = { cv, ox: x0, oy: y0, k };
  islandCache.set(key, out);
  return out;
}

// ---------- міст ----------
const bridgeCache = new Map<string, HTMLCanvasElement>();
function bridgeSprite(len: number, bw: number) {
  const key = `${Math.round(len)}|${Math.round(bw)}`;
  let cv = bridgeCache.get(key);
  if (cv) return cv;
  const k = 0.8;
  const L = len + 40;
  cv = canvas(L * k, (bw + 40) * k);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(k, k);
    c.translate(20, 20);
    c.fillStyle = "rgba(60,80,120,0.25)";
    c.fillRect(8, 14, len, bw);
    const n = Math.max(6, Math.round(len / 30));
    for (let i = 0; i < n; i++) {
      const x = (i / n) * len;
      c.fillStyle = i % 2 ? "#b88a50" : "#c99b5c";
      c.fillRect(x, 0, len / n + 1, bw);
      c.strokeStyle = "#7a5530";
      c.lineWidth = 2;
      c.strokeRect(x, 0, len / n + 1, bw);
      c.strokeStyle = "rgba(90,60,30,0.3)";
      c.beginPath();
      c.moveTo(x + 5, bw * 0.3);
      c.lineTo(x + len / n - 5, bw * 0.34);
      c.moveTo(x + 5, bw * 0.7);
      c.lineTo(x + len / n - 5, bw * 0.66);
      c.stroke();
    }
    // канати й стовпчики з боків
    for (const y of [-4, bw + 4]) {
      c.strokeStyle = "#e6d3a8";
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(len, y);
      c.stroke();
      c.strokeStyle = "#8a6a3a";
      c.lineWidth = 1.6;
      c.stroke();
      for (let i = 0; i <= 5; i++) {
        c.fillStyle = "#6b4423";
        c.beginPath();
        c.arc((i / 5) * len, y, 7, 0, TAU);
        c.fill();
        c.strokeStyle = "#e8d6ab";
        c.lineWidth = 1.6;
        c.stroke();
      }
    }
  }
  bridgeCache.set(key, cv);
  return cv;
}

// ---------- водоспади ----------
let fallCv: HTMLCanvasElement | null = null;
function waterfallSprite() {
  if (fallCv) return fallCv;
  fallCv = canvas(120, 360);
  const c = fallCv.getContext("2d");
  if (c) {
    const g = c.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, "#c8f0ff");
    g.addColorStop(0.5, "#7cc8f0");
    g.addColorStop(1, "rgba(124,200,240,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(20, 0);
    c.lineTo(100, 0);
    c.lineTo(90, 360);
    c.lineTo(30, 360);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const x = 28 + i * 13;
      c.beginPath();
      c.moveTo(x, 6);
      c.lineTo(x + (i - 2.5) * 2, 300);
      c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.ellipse(60, 6, 46, 12, 0, 0, TAU);
    c.fill();
  }
  return fallCv;
}

// ---------- декор: вітряки, руїни, дерева, квіти ----------
let windmillCv: HTMLCanvasElement | null = null;
function windmillSprite() {
  if (windmillCv) return windmillCv;
  windmillCv = canvas(256, 256);
  const c = windmillCv.getContext("2d");
  if (c) {
    c.translate(128, 150);
    c.fillStyle = "rgba(60,70,40,0.25)";
    c.beginPath();
    c.ellipse(14, 78, 62, 20, 0, 0, TAU);
    c.fill();
    // вежа
    const g = c.createLinearGradient(-40, 0, 40, 0);
    g.addColorStop(0, "#e9dfc9");
    g.addColorStop(1, "#bfb298");
    c.fillStyle = g;
    c.strokeStyle = "#8f8268";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-34, 78);
    c.lineTo(-22, -40);
    c.lineTo(22, -40);
    c.lineTo(34, 78);
    c.closePath();
    c.fill();
    c.stroke();
    // дах
    c.fillStyle = "#5a7ab8";
    c.beginPath();
    c.moveTo(-30, -38);
    c.lineTo(0, -78);
    c.lineTo(30, -38);
    c.closePath();
    c.fill();
    c.stroke();
    // двері, прапорець
    c.fillStyle = "#7b5530";
    c.fillRect(-9, 40, 18, 38);
    c.fillStyle = "#4a8fe0";
    c.fillRect(-9, -20, 18, 34);
    // лопаті
    c.translate(0, -40);
    c.fillStyle = "#f3ead3";
    c.strokeStyle = "#8f8268";
    c.lineWidth = 2.4;
    for (let i = 0; i < 4; i++) {
      c.save();
      c.rotate((i * TAU) / 4 + 0.4);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(10, -14);
      c.lineTo(14, -92);
      c.lineTo(-6, -90);
      c.lineTo(-8, -14);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
    c.fillStyle = "#7b5530";
    c.beginPath();
    c.arc(0, 0, 9, 0, TAU);
    c.fill();
  }
  return windmillCv;
}

let ruinCv: HTMLCanvasElement | null = null;
function ruinSprite() {
  if (ruinCv) return ruinCv;
  ruinCv = canvas(256, 200);
  const c = ruinCv.getContext("2d");
  if (c) {
    c.translate(128, 150);
    c.fillStyle = "rgba(60,70,40,0.25)";
    c.beginPath();
    c.ellipse(8, 36, 110, 20, 0, 0, TAU);
    c.fill();
    const stone = (x: number, w: number, h: number, broken: boolean) => {
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#d8d2c2");
      g.addColorStop(1, "#aaa392");
      c.fillStyle = g;
      c.strokeStyle = "#7f786a";
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(x, 36);
      c.lineTo(x, -h);
      if (broken) {
        c.lineTo(x + w * 0.4, -h + 14);
        c.lineTo(x + w * 0.7, -h - 6);
      }
      c.lineTo(x + w, -h + (broken ? 18 : 0));
      c.lineTo(x + w, 36);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = "rgba(100,95,80,0.5)";
      c.lineWidth = 1.4;
      for (let y = 20; y > -h; y -= 22) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + w, y);
        c.stroke();
      }
    };
    stone(-100, 34, 110, false);
    stone(66, 34, 70, true);
    // арка
    c.strokeStyle = "#7f786a";
    c.lineWidth = 2.4;
    c.fillStyle = "#cfc9b8";
    c.beginPath();
    c.moveTo(-100, -100);
    c.quadraticCurveTo(-18, -190, 40, -100);
    c.lineTo(40, -76);
    c.quadraticCurveTo(-18, -160, -100, -76);
    c.closePath();
    c.fill();
    c.stroke();
    // плющ
    c.strokeStyle = "#4f9a3a";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-94, -90);
    c.quadraticCurveTo(-90, -20, -80, 20);
    c.stroke();
    c.fillStyle = "#5fb04a";
    for (const [x, y] of [[-92, -60], [-86, -30], [-82, 0], [-78, 18]]) {
      c.beginPath();
      c.ellipse(x, y, 7, 4, 0.6, 0, TAU);
      c.fill();
    }
    c.fillStyle = "#ff9cb8";
    for (const [x, y] of [[-90, -75], [-84, -42]]) {
      c.beginPath();
      c.arc(x, y, 3.4, 0, TAU);
      c.fill();
    }
  }
  return ruinCv;
}

/** Розкладка декору (дерева, камені, квіти, пучки трави) на островах: детермінована; не на мостах, не біля замків, не в кущах. */
const decorCache = new Map<number, Decor[]>();
export function terraceDecor(cfg: CastleCfg, thorns: { x: number; y: number; mass: number }[], radiusK: number): Decor[] {
  const key = cfg.seed * 31 + thorns.length;
  const hit = decorCache.get(key);
  if (hit) return hit;
  const g = cfg.terraces as TerracesCfg;
  const r = rng(cfg.seed + 3);
  const out: Decor[] = [];
  const free = (x: number, y: number, rad: number) => {
    if (!circleOnTerrace(g, x, y, rad + 12)) return false;
    for (const b of g.bridges) if (Math.hypot(x - b.x1, y - b.y1) < rad + 170 || Math.hypot(x - b.x2, y - b.y2) < rad + 170) return false;
    for (const k of cfg.castles) if (Math.hypot(x - k.x, y - k.y) < k.r + rad + 40) return false;
    for (const t of thorns) if (Math.hypot(x - t.x, y - t.y) < radiusK * Math.sqrt(t.mass) + rad + 14) return false;
    for (const d of out) {
      if (d.kind === "flower" || d.kind === "tuft") continue;
      if (Math.hypot(x - d.x, y - d.y) < d.s + rad + 12) return false;
    }
    return true;
  };
  const place = (kind: Decor["kind"], n: number, smin: number, smax: number) => {
    let tries = n * 40;
    let left = n;
    while (left > 0 && tries-- > 0) {
      const s = smin + r() * (smax - smin);
      const x = r() * cfg.world;
      const y = r() * cfg.world;
      if (!free(x, y, kind === "flower" || kind === "tuft" ? 4 : s)) continue;
      out.push({ kind, x, y, s, v: r() });
      left--;
    }
  };
  place("tree", 34, 40, 64);
  place("rock", 22, 20, 38);
  place("flower", 60, 8, 12);
  place("tuft", 50, 10, 16);
  decorCache.set(key, out);
  return out;
}

/** Постійні «особливі» об'єкти карти: вітряки на бічних островах і руїни на центральному острові (за геометрією, без seed). */
function landmarks(g: TerracesCfg): { kind: "windmill" | "ruin"; x: number; y: number; s: number }[] {
  const out: { kind: "windmill" | "ruin"; x: number; y: number; s: number }[] = [];
  const half = (g.islands.length - 1) / 2;
  const mirror = half + 1;
  for (const i of [1, 2, mirror + 1, mirror + 2]) {
    const [cx, cy, r] = g.islands[i][0];
    out.push({ kind: "windmill", x: cx, y: cy - r * 0.05, s: 260 });
  }
  const [cx, cy] = g.islands[half][0];
  out.push({ kind: "ruin", x: cx - 10, y: cy - 190, s: 330 }, { kind: "ruin", x: cx + 120, y: cy + 190, s: 300 });
  return out;
}

/** Небо, хмари, острови, мости, водоспади, вітряки й руїни (під замками, кущами й клітинами). */
export function drawTerracesWorld(ctx: CanvasRenderingContext2D, cfg: CastleCfg, x0: number, x1: number, y0: number, y1: number, time: number) {
  const g = cfg.terraces;
  if (!g) return;
  drawSky(ctx, cfg.world, x0, x1, y0, y1, time);
  const seed = cfg.seed;
  // острови (разом з обривом); водоспади під ними
  for (let i = 0; i < g.islands.length; i++) {
    const sp = islandSprite(g, i, seed);
    const w = sp.cv.width / sp.k;
    const h = sp.cv.height / sp.k;
    if (sp.ox + w < x0 || sp.ox > x1 || sp.oy + h < y0 || sp.oy > y1) continue;
    // водоспад: з нижнього краю головного кола, що не завадить мостам (лише бічні острови й проміжні)
    if (i !== 0 && i !== g.islands.length - (g.islands.length - 1) / 2 - 1) {
      const [cx, cy, r] = g.islands[i][0];
      const a = Math.PI * (0.42 + ((i * 37) % 10) / 40);
      const fx = cx + Math.cos(a) * (r - 20);
      const fy = cy + Math.sin(a) * (r - 20);
      const wave = 0.85 + 0.15 * Math.sin(time * 3 + i);
      ctx.globalAlpha = wave;
      ctx.drawImage(waterfallSprite(), fx - 50, fy - 6, 100, 300);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(sp.cv, sp.ox, sp.oy, w, h);
  }
  // мости
  for (const b of g.bridges) {
    const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
    const ang = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    if (cx + len < x0 || cx - len > x1 || cy + len < y0 || cy - len > y1) continue;
    ctx.save();
    ctx.translate(b.x1, b.y1);
    ctx.rotate(ang);
    ctx.drawImage(bridgeSprite(len, g.bw), -20, -g.bw / 2 - 20, len + 40, g.bw + 40);
    ctx.restore();
  }
  // вітряки й руїни
  for (const m of landmarks(g)) {
    if (m.x + m.s < x0 || m.x - m.s > x1 || m.y + m.s < y0 || m.y - m.s > y1) continue;
    const spr = m.kind === "windmill" ? windmillSprite() : ruinSprite();
    const w = m.s;
    const h = (m.s * spr.height) / spr.width;
    ctx.drawImage(spr, m.x - w / 2, m.y - h * 0.7, w, h);
  }
}

/** Мінікарта терас: небо, острови (зелені), мости (бурі). */
export function drawTerracesMinimap(ctx: CanvasRenderingContext2D, cfg: CastleCfg, size: number) {
  const g = cfg.terraces;
  if (!g) return;
  const k = size / cfg.world;
  ctx.fillStyle = "#9fd0f5";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#b88a50";
  ctx.lineWidth = Math.max(2, g.bw * k);
  ctx.lineCap = "butt";
  for (const b of g.bridges) {
    ctx.beginPath();
    ctx.moveTo(b.x1 * k, b.y1 * k);
    ctx.lineTo(b.x2 * k, b.y2 * k);
    ctx.stroke();
  }
  ctx.fillStyle = "#7cc443";
  for (const isl of g.islands) {
    for (const [x, y, r] of isl) {
      ctx.beginPath();
      ctx.arc(x * k, y * k, Math.max(2, r * k), 0, TAU);
      ctx.fill();
    }
  }
}

export function resetTerracesCache() {
  islandCache.clear();
  bridgeCache.clear();
  decorCache.clear();
  cloudCache.clear();
  skyCv = fallCv = windmillCv = ruinCv = null;
}

export { terraceOnLand, terraceBridgeAt };
