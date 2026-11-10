import { COLISEUM, type ColiseumGeo } from "./flockColiseum";

/**
 * Малювання карти «Арена»: піщана арена (патерн-тайл у кеші), кам'яна стіна по колу замість загорожі, яруси трибун із силуетами
 * глядачів і прапорами, четверо воріт, колони й камені (лише вигляд). Усе - з кешованих спрайтів, без shadowBlur на кадр; палітра
 * не залежить від теми. Викликати у світових координатах (камера вже застосована), `pxPerUnit` - масштаб камери з урахуванням dpr.
 */
const TAU = Math.PI * 2;
/** Товщина стіни й ширина трибун (світові одиниці). */
export const WALL_W = 54;
export const TRIBUNE_W = 300;

function mk(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

const quant = (pxPerUnit: number) => Math.max(0.15, Math.min(1.5, Math.round(pxPerUnit * 4) / 4));
const hash = (a: number, b: number) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

// ---------- пісок ----------
const SAND_SPAN = 270;
const sand = new Map<number, { cv: HTMLCanvasElement; pattern: CanvasPattern | null }>();

function sandPattern(ctx: CanvasRenderingContext2D, pxPerUnit: number): CanvasPattern | null {
  const q = quant(pxPerUnit);
  let hit = sand.get(q);
  if (!hit) {
    const size = Math.round(SAND_SPAN * q);
    const cv = mk(size, size);
    const c = cv.getContext("2d");
    if (c) {
      c.scale(size / SAND_SPAN, size / SAND_SPAN);
      c.fillStyle = COLISEUM.sand;
      c.fillRect(0, 0, SAND_SPAN, SAND_SPAN);
      // плями світлішого й темнішого піску
      // елементи малюються з обгорткою по краях, щоб тайл стикувався без швів
      for (let i = 0; i < 26; i++) {
        c.fillStyle = i % 2 ? "rgba(255,240,200,0.20)" : "rgba(170,125,60,0.12)";
        for (const ox of [-SAND_SPAN, 0, SAND_SPAN])
          for (const oy of [-SAND_SPAN, 0, SAND_SPAN]) {
            c.beginPath();
            c.ellipse(hash(i, 1) * SAND_SPAN + ox, hash(i, 2) * SAND_SPAN + oy, 14 + hash(i, 3) * 26, 8 + hash(i, 4) * 14, hash(i, 5) * TAU, 0, TAU);
            c.fill();
          }
      }
      // борозни від граблів (короткі дуги) і піщинки
      c.strokeStyle = "rgba(150,105,50,0.20)";
      c.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const x = hash(i, 7) * SAND_SPAN;
        const y = hash(i, 8) * SAND_SPAN;
        for (const ox of [-SAND_SPAN, 0, SAND_SPAN])
          for (const oy of [-SAND_SPAN, 0, SAND_SPAN]) {
            c.beginPath();
            c.arc(x + ox, y + oy, 30 + hash(i, 9) * 40, 0.2, 1.1 + hash(i, 10));
            c.stroke();
          }
      }
      c.fillStyle = COLISEUM.sandSpeck;
      for (let i = 0; i < 90; i++) c.fillRect(hash(i, 11) * SAND_SPAN, hash(i, 12) * SAND_SPAN, 2.2, 2.2);
    }
    const pattern = ctx.createPattern(cv, "repeat");
    pattern?.setTransform(new DOMMatrix([SAND_SPAN / size, 0, 0, SAND_SPAN / size, 0, 0]));
    hit = { cv, pattern };
    sand.set(q, hit);
  }
  return hit.pattern;
}

// ---------- глядачі, прапори, колони, камені (спрайти) ----------
const SPECT_COLORS = ["#d8433c", "#3f7fd0", "#e9b93a", "#46a56b", "#9a5fc0", "#ececec", "#e07a3a", "#3a3a48"];
const SKINS = ["#f1c9a0", "#d9a577", "#a8764d", "#f6dcc0"];
const spectCache = new Map<number, HTMLCanvasElement>();

/** Глядач зверху: плечі (еліпс) і голова; вигляд у світі ~26 x 18. */
function spectatorSprite(i: number): HTMLCanvasElement {
  let cv = spectCache.get(i);
  if (cv) return cv;
  const S = 4; // пікселів на одиницю
  cv = mk(30 * S, 30 * S);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(S, S);
    c.translate(15, 15);
    c.fillStyle = "rgba(0,0,0,0.22)";
    c.beginPath();
    c.ellipse(1.5, 2, 12, 8, 0, 0, TAU);
    c.fill();
    c.fillStyle = SPECT_COLORS[i % SPECT_COLORS.length];
    c.strokeStyle = "rgba(30,20,12,0.7)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(0, 0, 11, 7, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = SKINS[(i >> 3) % SKINS.length];
    c.beginPath();
    c.arc(0, 0, 5.2, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = i % 5 === 0 ? "#e8e8e8" : "#2a1c12";
    c.beginPath();
    c.arc(-0.8, 0, 3.6, 0.6, TAU - 0.6);
    c.fill();
  }
  spectCache.set(i, cv);
  return cv;
}

const FLAG_COLORS: [string, string][] = [
  ["#d8433c", "#f4d35e"],
  ["#2f6fcf", "#f2f2f2"],
  ["#e9b93a", "#7a1f1a"],
];
const flagCache = new Map<number, HTMLCanvasElement>();
/** Прапор на жердині зверху: жердина (кружок із тінню) і довгий вимпел, що майорить назовні. */
function flagSprite(i: number): HTMLCanvasElement {
  let cv = flagCache.get(i);
  if (cv) return cv;
  const S = 3;
  cv = mk(90 * S, 60 * S);
  const c = cv.getContext("2d");
  if (c) {
    const [a, b] = FLAG_COLORS[i % FLAG_COLORS.length];
    c.scale(S, S);
    c.translate(12, 30);
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(3, 3, 9, 7, 0, 0, TAU);
    c.fill();
    c.strokeStyle = "#2a1c12";
    c.lineWidth = 1.2;
    c.fillStyle = a;
    c.beginPath();
    c.moveTo(0, -14);
    c.quadraticCurveTo(30, -20, 66, -6);
    c.lineTo(48, 2);
    c.lineTo(66, 10);
    c.quadraticCurveTo(30, 18, 0, 14);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = b;
    c.beginPath();
    c.moveTo(0, -5);
    c.quadraticCurveTo(26, -8, 46, -2);
    c.lineTo(36, 1);
    c.quadraticCurveTo(22, 6, 0, 5);
    c.closePath();
    c.fill();
    c.fillStyle = "#4a3320";
    c.beginPath();
    c.arc(0, 0, 4.5, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = "#f1d77a";
    c.beginPath();
    c.arc(-1, -1, 1.6, 0, TAU);
    c.fill();
  }
  flagCache.set(i, cv);
  return cv;
}

const decorCache = new Map<string, HTMLCanvasElement>();
/** Основа колони зверху (світла кам'яна шайба з канелюрами й тінню). */
function pillarSprite(r: number, q: number): HTMLCanvasElement {
  const key = `p${r}|${q}`;
  let cv = decorCache.get(key);
  if (cv) return cv;
  const half = r * 1.5;
  cv = mk(half * 2 * q, half * 2 * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    c.translate(half, half);
    c.fillStyle = "rgba(60,38,12,0.30)";
    c.beginPath();
    c.ellipse(r * 0.28, r * 0.34, r * 1.12, r * 1.0, 0, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#efe4c8");
    g.addColorStop(1, "#b9a780");
    c.fillStyle = g;
    c.strokeStyle = "#5e5035";
    c.lineWidth = Math.max(1.5, r * 0.07);
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(94,80,53,0.55)";
    c.lineWidth = Math.max(1, r * 0.05);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.beginPath();
      c.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      c.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
      c.stroke();
    }
    c.fillStyle = "#d8c9a4";
    c.beginPath();
    c.arc(0, 0, r * 0.42, 0, TAU);
    c.fill();
    c.stroke();
  }
  decorCache.set(key, cv);
  return cv;
}

function stoneSprite(r: number, q: number, seed: number): HTMLCanvasElement {
  const key = `s${r}|${q}|${seed}`;
  let cv = decorCache.get(key);
  if (cv) return cv;
  const half = r * 1.6;
  cv = mk(half * 2 * q, half * 2 * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    c.translate(half, half);
    c.fillStyle = "rgba(60,38,12,0.28)";
    c.beginPath();
    c.ellipse(r * 0.3, r * 0.4, r * 1.15, r * 0.9, 0, 0, TAU);
    c.fill();
    c.fillStyle = "#a59a8a";
    c.strokeStyle = "#4f463a";
    c.lineWidth = Math.max(1, r * 0.1);
    c.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const rr = r * (0.8 + hash(seed, i) * 0.35);
      if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.beginPath();
    c.ellipse(-r * 0.25, -r * 0.3, r * 0.35, r * 0.2, -0.6, 0, TAU);
    c.fill();
  }
  decorCache.set(key, cv);
  return cv;
}

// ---------- розкладка глядачів і прапорів (раз на геометрію) ----------
interface Spot {
  x: number;
  y: number;
  ang: number;
  v: number;
}
const layoutCache = new WeakMap<ColiseumGeo, { spect: Spot[]; flags: Spot[] }>();

function layout(g: ColiseumGeo) {
  let l = layoutCache.get(g);
  if (l) return l;
  const spect: Spot[] = [];
  const flags: Spot[] = [];
  const rings = [WALL_W + 38, WALL_W + 38 + 46, WALL_W + 38 + 92, WALL_W + 38 + 138];
  rings.forEach((off, ri) => {
    const rr = g.r + off;
    const n = Math.floor((TAU * rr) / 30);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + hash(ri, i) * 0.01;
      // ворота: у проходах глядачів нема
      let gate = false;
      for (const deg of g.gates) {
        let d = Math.abs(a - (deg * Math.PI) / 180) % TAU;
        if (d > Math.PI) d = TAU - d;
        if (d * rr < g.gateWidth * 0.75 && ri < 3) gate = true;
      }
      if (gate || hash(ri * 31 + i, 5) < 0.12) continue; // трохи порожніх місць
      spect.push({ x: g.cx + Math.cos(a) * rr, y: g.cy + Math.sin(a) * rr + (hash(i, ri) - 0.5) * 4, ang: a, v: Math.floor(hash(i, ri + 9) * 64) });
    }
  });
  const nf = 28;
  for (let i = 0; i < nf; i++) {
    const a = ((i + 0.5) / nf) * TAU;
    const rr = g.r + WALL_W + TRIBUNE_W - 70;
    flags.push({ x: g.cx + Math.cos(a) * rr, y: g.cy + Math.sin(a) * rr, ang: a, v: i });
  }
  l = { spect, flags };
  layoutCache.set(g, l);
  return l;
}

const inView = (x: number, y: number, pad: number, v: View) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Весь фон «Арени» під істотами: темна земля поза стінами, яруси трибун із глядачами, стіна, ворота, піщане коло, колони й камені.
 * `time` (секунди) лише хитає прапори. Прапори й глядачів малюють у `drawColiseumTop` (поверх істот їх нема: вони за стіною).
 */
export function drawColiseumBack(ctx: CanvasRenderingContext2D, g: ColiseumGeo, v: View, pxPerUnit: number, time = 0) {
  const { cx, cy, r } = g;
  ctx.save();
  // 1. земля за трибунами
  ctx.fillStyle = COLISEUM.out;
  ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  // 2. яруси трибун: концентричні кільця від стіни назовні
  const tiers = COLISEUM.tribune;
  const tw = (TRIBUNE_W - WALL_W) / tiers.length;
  for (let i = 0; i < tiers.length; i++) {
    const rin = r + WALL_W + i * tw;
    ctx.beginPath();
    ctx.arc(cx, cy, rin + tw / 2, 0, TAU);
    ctx.lineWidth = tw + 0.5;
    ctx.strokeStyle = tiers[i];
    ctx.stroke();
    // світла кромка ярусу
    ctx.beginPath();
    ctx.arc(cx, cy, rin, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,240,205,0.22)";
    ctx.stroke();
  }
  // проходи між секторами (радіальні сходи) раз на 15°
  ctx.strokeStyle = "rgba(30,22,14,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    const x0 = cx + Math.cos(a) * (r + WALL_W);
    const y0 = cy + Math.sin(a) * (r + WALL_W);
    if (!inView(x0, y0, TRIBUNE_W + 40, v)) continue;
    ctx.moveTo(x0, y0);
    ctx.lineTo(cx + Math.cos(a) * (r + TRIBUNE_W), cy + Math.sin(a) * (r + TRIBUNE_W));
  }
  ctx.stroke();
  // 3. стіна: кільце з блоками
  ctx.beginPath();
  ctx.arc(cx, cy, r + WALL_W / 2, 0, TAU);
  ctx.lineWidth = WALL_W;
  ctx.strokeStyle = COLISEUM.wall;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, TAU);
  ctx.lineWidth = 6;
  ctx.strokeStyle = COLISEUM.wallDark;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r + WALL_W - 5, 0, TAU);
  ctx.lineWidth = 8;
  ctx.strokeStyle = COLISEUM.wallLight;
  ctx.stroke();
  ctx.strokeStyle = "rgba(70,56,36,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const jn = 180;
  for (let k = 0; k < jn; k++) {
    const a = (k / jn) * TAU;
    const x0 = cx + Math.cos(a) * (r + 6);
    const y0 = cy + Math.sin(a) * (r + 6);
    if (!inView(x0, y0, WALL_W + 20, v)) continue;
    ctx.moveTo(x0, y0);
    ctx.lineTo(cx + Math.cos(a) * (r + WALL_W - 8), cy + Math.sin(a) * (r + WALL_W - 8));
  }
  ctx.stroke();
  // 4. піщане коло
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = sandPattern(ctx, pxPerUnit) ?? COLISEUM.sand;
  ctx.fill();
  // тінь від стіни на піску й темніший пояс біля неї
  ctx.beginPath();
  ctx.arc(cx, cy, r - 30, 0, TAU);
  ctx.lineWidth = 60;
  ctx.strokeStyle = "rgba(110,70,25,0.16)";
  ctx.stroke();
  // 5. ворота: арка в стіні й темний прохід
  for (const deg of g.gates) {
    const a = (deg * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    const hw = g.gateWidth / 2;
    ctx.fillStyle = COLISEUM.gateDark;
    ctx.fillRect(r - 6, -hw, WALL_W + 14, hw * 2);
    // кам'яна рамка й решітка
    ctx.strokeStyle = COLISEUM.wallLight;
    ctx.lineWidth = 9;
    ctx.strokeRect(r - 6, -hw, WALL_W + 14, hw * 2);
    ctx.strokeStyle = "#4a3f33";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      ctx.moveTo(r + 4, (i / 3.4) * hw);
      ctx.lineTo(r + WALL_W - 4, (i / 3.4) * hw);
    }
    ctx.stroke();
    ctx.restore();
  }
  // 6. колони й камені
  const q = quant(pxPerUnit);
  for (const [x, y, pr] of g.stones) {
    if (!inView(x, y, pr * 2, v)) continue;
    const s = stoneSprite(pr, q, Math.round(x + y));
    const w = s.width / q;
    ctx.drawImage(s, x - w / 2, y - w / 2, w, w);
  }
  for (const [x, y, pr] of g.pillars) {
    if (!inView(x, y, pr * 2, v)) continue;
    const s = pillarSprite(pr, q);
    const w = s.width / q;
    ctx.drawImage(s, x - w / 2, y - w / 2, w, w);
  }
  // 7. глядачі й прапори (за стіною)
  const l = layout(g);
  for (const sp of l.spect) {
    if (!inView(sp.x, sp.y, 30, v)) continue;
    const s = spectatorSprite(sp.v);
    const w = s.width / 4;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    // голова дивиться до арени, плечі вздовж ряду; легке коливання (вболівальники підстрибують)
    ctx.rotate(sp.ang + Math.PI / 2);
    const bob = Math.sin(time * 3 + sp.v) * 1.2;
    ctx.drawImage(s, -w / 2, -w / 2 + bob, w, w);
    ctx.restore();
  }
  for (const fl of l.flags) {
    if (!inView(fl.x, fl.y, 100, v)) continue;
    const s = flagSprite(fl.v);
    const w = s.width / 3;
    const h = s.height / 3;
    ctx.save();
    ctx.translate(fl.x, fl.y);
    ctx.rotate(fl.ang + Math.PI / 2 + Math.sin(time * 2 + fl.v) * 0.08);
    ctx.drawImage(s, -12, -h / 2, w, h);
    ctx.restore();
  }
  ctx.restore();
}

/** Скидання кешів (зміна карти / теми не потрібна, але тест і HMR). */
export function clearColiseumCaches() {
  sand.clear();
  spectCache.clear();
  flagCache.clear();
  decorCache.clear();
}
