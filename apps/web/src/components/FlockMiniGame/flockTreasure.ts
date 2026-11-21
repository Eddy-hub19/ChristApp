/**
 * Карта «Острів скарбів» (id 9): клієнтська геометрія (дзеркало flock.treasure.ts), пісок, вода з мерехтінням, береги, мости,
 * декор, їжа-корали/кокоси/скриня, плавник акули й мініатюра. Усе малюється один раз у кешовані тайли й спрайти (без shadowBlur
 * на кадрі й backdrop-filter); палітра не залежить від теми застосунку. Сервер авторитетний: вода й міст рахуються тими самими формулами.
 */
export const TREASURE_MAP_ID = 9;
const TAU = Math.PI * 2;

/** Острів із welcome: коло, річка [y0, y1], мости [x0, x1] і правила (maxMass - міст витримує не більше, shark - мс до акули, shore - відступ від води). */
export interface TreasureCfg {
  cx: number;
  cy: number;
  r: number;
  y0: number;
  y1: number;
  b: [number, number][];
  maxMass: number;
  shark: number;
  shore: number;
  /** Швидкість зсуву важкої клітини з моста (од./с). */
  push: number;
}

export function twOnBridge(c: TreasureCfg, x: number): boolean {
  for (const b of c.b) if (x >= b[0] && x <= b[1]) return true;
  return false;
}

/** Вода: поза колом або в річці поза мостом (центр клітини). */
export function twInWater(c: TreasureCfg, x: number, y: number): boolean {
  if (Math.hypot(x - c.cx, y - c.cy) >= c.r) return true;
  return y > c.y0 && y < c.y1 && !twOnBridge(c, x);
}

/** Відстань від точки до найближчої води (0 - у воді): коло, берег річки або бічний край мосту. */
export function twDistanceToWater(c: TreasureCfg, x: number, y: number): number {
  if (twInWater(c, x, y)) return 0;
  const toCircle = c.r - Math.hypot(x - c.cx, y - c.cy);
  let toRiver: number;
  if (y > c.y0 && y < c.y1) {
    let edge = Infinity;
    for (const b of c.b) if (x >= b[0] && x <= b[1]) edge = Math.min(edge, x - b[0], b[1] - x);
    toRiver = edge;
  } else {
    toRiver = y <= c.y0 ? c.y0 - y : y - c.y1;
  }
  return Math.min(toCircle, toRiver);
}

/**
 * Важка клітина (маса більша за maxMass) у створі моста: нова y після зсуву до найближчого берега (як на сервері), інакше null.
 * hint: true - клітину відштовхнуло (показати «Міст не витримає»).
 */
export function twBridgeAdjust(c: TreasureCfg, x: number, y: number, mass: number, step: number): number | null {
  if (mass <= c.maxMass) return null;
  if (!(y > c.y0 && y < c.y1) || !twOnBridge(c, x) || Math.hypot(x - c.cx, y - c.cy) >= c.r) return null;
  const mid = (c.y0 + c.y1) / 2;
  return y < mid ? Math.max(c.y0 - 1, y - step) : Math.min(c.y1 + 1, y + step);
}

// ---------- службове ----------
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function canvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}
const quant = (px: number) => Math.max(0.25, Math.min(2, Math.round(px * 4) / 4));
const circle = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
};

// ---------- пісок (тайл землі: ракушки, камінці, сліди, плями мокрого піску) ----------
function wrapped(span: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [0, -span, span]) {
    if (dx < 0 && x + r < span) continue;
    if (dx > 0 && x - r > 0) continue;
    for (const dy of [0, -span, span]) {
      if (dy < 0 && y + r < span) continue;
      if (dy > 0 && y - r > 0) continue;
      draw(x + dx, y + dy);
    }
  }
}

export function paintTreasureGround(c: CanvasRenderingContext2D, span: number, r: () => number) {
  // плями мокрого й сухого піску
  for (let i = 0; i < 26; i++) {
    const x = r() * span;
    const y = r() * span;
    const w = 40 + r() * 90;
    c.fillStyle = r() < 0.55 ? "rgba(170,130,70,0.10)" : "rgba(255,246,214,0.22)";
    wrapped(span, x, y, w, (px, py) => {
      c.beginPath();
      c.ellipse(px, py, w, w * (0.4 + r() * 0.25), r() * 3, 0, TAU);
      c.fill();
    });
  }
  // піщані зернята
  for (let i = 0; i < 420; i++) {
    const x = r() * span;
    const y = r() * span;
    c.fillStyle = r() < 0.5 ? "rgba(150,110,55,0.28)" : "rgba(255,250,225,0.4)";
    c.fillRect(x, y, 1.6, 1.6);
  }
  // хвилясті складки піску
  c.strokeStyle = "rgba(160,120,60,0.16)";
  c.lineWidth = 2;
  c.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const x = r() * span;
    const y = r() * span;
    const len = 50 + r() * 90;
    wrapped(span, x, y, len, (px, py) => {
      c.beginPath();
      c.moveTo(px, py);
      c.bezierCurveTo(px + len * 0.3, py - 8, px + len * 0.6, py + 8, px + len, py);
      c.stroke();
    });
  }
  // камінці
  for (let i = 0; i < 18; i++) {
    const x = r() * span;
    const y = r() * span;
    const s = 4 + r() * 6;
    wrapped(span, x, y, s, (px, py) => {
      c.fillStyle = "rgba(120,100,80,0.45)";
      c.beginPath();
      c.ellipse(px + 1, py + 1.5, s, s * 0.75, r() * 3, 0, TAU);
      c.fill();
      c.fillStyle = r() < 0.5 ? "#b9a88e" : "#a89880";
      c.beginPath();
      c.ellipse(px, py, s, s * 0.75, r() * 3, 0, TAU);
      c.fill();
    });
  }
  // ракушки: віяло з прожилками й спіральні равлики
  for (let i = 0; i < 9; i++) {
    const x = r() * span;
    const y = r() * span;
    const s = 9 + r() * 6;
    const rot = r() * TAU;
    const pink = r() < 0.5;
    wrapped(span, x, y, s * 1.4, (px, py) => {
      c.save();
      c.translate(px, py);
      c.rotate(rot);
      c.fillStyle = pink ? "#f5c6c0" : "#f7e4c2";
      c.strokeStyle = pink ? "#c98a86" : "#b99a62";
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(0, s * 0.6);
      c.arc(0, 0, s, Math.PI * 1.05, Math.PI * 1.95);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) {
        c.moveTo(0, s * 0.55);
        c.lineTo(Math.sin(a) * s * 0.95, -Math.cos(a) * s * 0.95);
      }
      c.stroke();
      c.restore();
    });
  }
  // морські зірки
  for (let i = 0; i < 3; i++) {
    const x = r() * span;
    const y = r() * span;
    const s = 12 + r() * 4;
    const rot = r() * TAU;
    wrapped(span, x, y, s, (px, py) => {
      c.save();
      c.translate(px, py);
      c.rotate(rot);
      c.fillStyle = "#f08a55";
      c.strokeStyle = "#c2603a";
      c.lineWidth = 1.2;
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        const rr = k % 2 === 0 ? s : s * 0.42;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    });
  }
  // сліди босих ніг: пара відбитків
  for (let i = 0; i < 4; i++) {
    const x = r() * span;
    const y = r() * span;
    const rot = r() * TAU;
    wrapped(span, x, y, 40, (px, py) => {
      c.save();
      c.translate(px, py);
      c.rotate(rot);
      c.fillStyle = "rgba(130,95,45,0.22)";
      for (let k = 0; k < 4; k++) {
        const fx = k * 20;
        const sd = k % 2 ? 5 : -5;
        c.beginPath();
        c.ellipse(fx, sd, 5, 8, 0.2, 0, TAU);
        c.fill();
        for (let t = 0; t < 4; t++) {
          c.beginPath();
          c.arc(fx + 6, sd - 5 + t * 3.4, 1.4, 0, TAU);
          c.fill();
        }
      }
      c.restore();
    });
  }
}

// ---------- вода: 3 кадри мерехтіння з однією спільною фазою ----------
const WATER_TILE = 256;
const FRAMES = 3;
const SEQ = [0, 1, 2, 1];
const FPS = 3;
const waterFrames = new Map<string, HTMLCanvasElement>();
const waterPatterns = new Map<string, CanvasPattern>();

function waterFrame(frame: number, q: number) {
  const key = `${frame}|${q}`;
  let cv = waterFrames.get(key);
  if (cv) return cv;
  cv = canvas(WATER_TILE * q, WATER_TILE * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    const g = c.createLinearGradient(0, 0, WATER_TILE, WATER_TILE);
    g.addColorStop(0, "#0b3558");
    g.addColorStop(1, "#0a4468");
    c.fillStyle = g;
    c.fillRect(0, 0, WATER_TILE, WATER_TILE);
    const r = rng(311); // однакові для всіх кадрів позиції, зсувається лише фаза
    c.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      const x = r() * WATER_TILE;
      const y = r() * WATER_TILE;
      const len = 26 + r() * 40;
      const ph = r() * TAU + (frame * TAU) / FRAMES;
      c.strokeStyle = i % 3 === 0 ? "rgba(80,220,215,0.5)" : "rgba(40,150,190,0.38)";
      c.lineWidth = 2;
      for (const ox of [-WATER_TILE, 0, WATER_TILE]) {
        for (const oy of [-WATER_TILE, 0, WATER_TILE]) {
          c.beginPath();
          c.moveTo(x + ox, y + oy);
          c.quadraticCurveTo(x + ox + len * 0.5, y + oy + Math.sin(ph) * 7, x + ox + len, y + oy);
          c.stroke();
        }
      }
    }
    // блікі
    for (let i = 0; i < 18; i++) {
      const x = r() * WATER_TILE;
      const y = r() * WATER_TILE;
      c.fillStyle = `rgba(170,245,240,${0.1 + 0.16 * ((i + frame) % 3) / 2})`;
      c.beginPath();
      c.ellipse(x, y, 3 + r() * 3, 1.4, 0, 0, TAU);
      c.fill();
    }
  }
  waterFrames.set(key, cv);
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

// ---------- береги: мокрий пісок, піна й бірюзове мілководдя ----------
const shoreCache = new Map<string, HTMLCanvasElement>();
function ringSprite(name: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  let cv = shoreCache.get(name);
  if (!cv) {
    cv = canvas(size, size);
    const c = cv.getContext("2d");
    if (c) draw(c, size);
    shoreCache.set(name, cv);
  }
  return cv;
}

/** Береговий пояс острова (радіальна заливка): мокрий пісок усередині, піна на краю, бірюза мілководдя зовні. */
function islandShoreSprite(r: number) {
  const pad = 140;
  const size = 1024;
  return ringSprite(`shore|${Math.round(r)}`, size, (c, s) => {
    const k = s / (2 * (r + pad));
    const h = s / 2;
    const R = r * k;
    const g = c.createRadialGradient(h, h, R - 90 * k, h, h, R + pad * k);
    g.addColorStop(0, "rgba(150,115,60,0)");
    g.addColorStop(0.28, "rgba(150,115,60,0.34)");
    g.addColorStop(0.36, "rgba(235,222,170,0.0)");
    g.addColorStop(0.39, "rgba(255,255,255,0.85)");
    g.addColorStop(0.43, "rgba(110,235,225,0.75)");
    g.addColorStop(0.7, "rgba(40,170,200,0.32)");
    g.addColorStop(1, "rgba(20,110,170,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** Берег річки: смуга (ширина вздовж x довільна, тут одиничний градієнт по y). */
function bankSprite(north: boolean) {
  return ringSprite(`bank|${north ? "n" : "s"}`, 128, (c, s) => {
    // зверху вниз: для північного берега пісок зверху, вода знизу
    const g = c.createLinearGradient(0, 0, 0, s);
    const stops: [number, string][] = north
      ? [[0, "rgba(150,115,60,0)"], [0.3, "rgba(150,115,60,0.32)"], [0.5, "rgba(255,255,255,0.85)"], [0.58, "rgba(110,235,225,0.75)"], [1, "rgba(30,150,190,0)"]]
      : [[0, "rgba(30,150,190,0)"], [0.42, "rgba(110,235,225,0.75)"], [0.5, "rgba(255,255,255,0.85)"], [0.7, "rgba(150,115,60,0.32)"], [1, "rgba(150,115,60,0)"]];
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

// ---------- міст із дощок ----------
function bridgeSprite(w: number) {
  return ringSprite(`bridge|${Math.round(w)}`, 256, (c, s) => {
    // вид зверху: міст іде зверху вниз; дошки впоперек. Спрайт 256x256 розтягується на (w x довжина)
    c.fillStyle = "rgba(10,30,50,0.4)";
    c.fillRect(10, 4, s - 14, s - 4);
    const planks = 12;
    for (let i = 0; i < planks; i++) {
      const y = (i / planks) * s;
      const h = s / planks;
      c.fillStyle = i % 2 ? "#b98a50" : "#c99a5c";
      c.fillRect(6, y + 1, s - 12, h - 2);
      c.strokeStyle = "#7a5530";
      c.lineWidth = 2;
      c.strokeRect(6, y + 1, s - 12, h - 2);
      c.strokeStyle = "rgba(90,60,30,0.35)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(14 + (i * 37) % 60, y + h * 0.4);
      c.lineTo(80 + (i * 53) % 100, y + h * 0.45);
      c.stroke();
      c.fillStyle = "#5a3a1c";
      circle(c, 16, y + h / 2, 2.2);
      c.fill();
      circle(c, s - 16, y + h / 2, 2.2);
      c.fill();
    }
    // бокові канати й стовпчики
    for (const x of [4, s - 4]) {
      c.strokeStyle = "#e6d3a8";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, s);
      c.stroke();
      c.strokeStyle = "#8a6a3a";
      c.lineWidth = 1.5;
      c.stroke();
      for (let i = 0; i <= 4; i++) {
        c.fillStyle = "#6b4423";
        circle(c, x, (i / 4) * s, 6);
        c.fill();
        c.strokeStyle = "#e8d6ab";
        c.lineWidth = 1.5;
        c.stroke();
      }
    }
  });
}

// ---------- декор: кораблі-руїни, пальми, скрині, якорі, бочки ----------
export type DecorKind = "wreck" | "palm" | "chest" | "anchor" | "barrel";
export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  rot: number;
  s: number;
  v: number;
}

const decorCache = new Map<string, Decor[]>();

/** Розкладка декору (детермінована від геометрії острова): на твердому березі, не ближче за 240 до води й мостів, без перетинів. */
export function treasureDecor(c: TreasureCfg): Decor[] {
  const key = `${c.cx}|${c.r}|${c.y0}|${c.y1}|${c.b.map((b) => b.join("-")).join(",")}`;
  const hit = decorCache.get(key);
  if (hit) return hit;
  const r = rng(4242);
  const out: Decor[] = [];
  const plan: [DecorKind, number, number, number][] = [
    // пальм у декорі нема: кущі-укриття на цій карті самі пальми (thornStyle 'palm'), щоб їх не плутали з декором
    ["wreck", 7, 150, 230],
    ["chest", 7, 40, 56],
    ["anchor", 6, 44, 60],
    ["barrel", 12, 28, 38],
  ];
  const free = (x: number, y: number, rad: number) => {
    if (Math.hypot(x - c.cx, y - c.cy) > c.r - 240 - rad) return false;
    if (y > c.y0 - 240 - rad && y < c.y1 + 240 + rad) return false;
    for (const o of out) if (Math.hypot(o.x - x, o.y - y) < (o.s + rad) * 0.9 + 60) return false;
    return true;
  };
  for (const [kind, n, smin, smax] of plan) {
    for (let placed = 0, tries = 0; placed < n && tries < 400; tries++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * (c.r - 240);
      const x = c.cx + Math.cos(a) * d;
      const y = c.cy + Math.sin(a) * d;
      const s = smin + r() * (smax - smin);
      if (!free(x, y, s)) continue;
      out.push({ kind, x, y, rot: r() * TAU, s, v: Math.floor(r() * 3) });
      placed++;
    }
  }
  decorCache.set(key, out);
  return out;
}

function paintWreck(c: CanvasRenderingContext2D, s: number, v: number) {
  const h = s / 2;
  c.save();
  c.translate(h, h);
  const L = s * 0.46;
  const W = s * 0.2;
  // тінь
  c.fillStyle = "rgba(90,60,25,0.28)";
  c.beginPath();
  c.ellipse(5, 8, L, W * 1.15, 0, 0, TAU);
  c.fill();
  // корпус: борти з дощок і напівзруйнований ніс
  c.fillStyle = "#8a6034";
  c.strokeStyle = "#4e3318";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-L, -W * 0.7);
  c.quadraticCurveTo(-L * 0.2, -W * 1.25, L * 0.55, -W * 0.95);
  c.lineTo(L, -W * 0.15 + v * 4);
  c.lineTo(L * 0.82, W * 0.35);
  c.quadraticCurveTo(L * 0.2, W * 1.2, -L * 0.7, W * 0.95);
  c.lineTo(-L, W * 0.55);
  c.closePath();
  c.fill();
  c.stroke();
  // палуба: дошки
  c.fillStyle = "#b98a50";
  c.beginPath();
  c.moveTo(-L * 0.9, -W * 0.45);
  c.quadraticCurveTo(-L * 0.1, -W * 0.9, L * 0.45, -W * 0.65);
  c.lineTo(L * 0.62, -W * 0.05);
  c.quadraticCurveTo(L * 0.1, W * 0.85, -L * 0.65, W * 0.62);
  c.lineTo(-L * 0.9, W * 0.3);
  c.closePath();
  c.fill();
  c.strokeStyle = "#6a4726";
  c.lineWidth = 1.6;
  for (let i = -4; i <= 6; i++) {
    const x = (i / 6) * L * 0.9;
    c.beginPath();
    c.moveTo(x, -W * 0.9);
    c.lineTo(x + 6, W * 0.85);
    c.stroke();
  }
  // пробоїна
  c.fillStyle = "#3b2a18";
  c.beginPath();
  c.ellipse(L * 0.18, W * 0.05, W * 0.38, W * 0.26, 0.3, 0, TAU);
  c.fill();
  c.strokeStyle = "#d8b27a";
  c.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    c.beginPath();
    c.moveTo(L * 0.18 + Math.cos(a) * W * 0.3, W * 0.05 + Math.sin(a) * W * 0.2);
    c.lineTo(L * 0.18 + Math.cos(a) * W * 0.55, W * 0.05 + Math.sin(a) * W * 0.4);
    c.stroke();
  }
  // зламана щогла: пеньок і повалений стовбур із реєю та рваним вітрилом
  c.fillStyle = "#6b4423";
  circle(c, -L * 0.25, -W * 0.05, W * 0.22);
  c.fill();
  c.strokeStyle = "#3c2612";
  c.lineWidth = 2;
  c.stroke();
  c.save();
  c.rotate(-0.35 + v * 0.2);
  c.fillStyle = "#e7dcc0";
  c.strokeStyle = "#a89873";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-L * 0.1, -W * 1.6);
  c.lineTo(L * 0.55, -W * 1.55);
  c.lineTo(L * 0.5, -W * 0.85);
  c.lineTo(L * 0.3, -W * 1.0);
  c.lineTo(L * 0.18, -W * 0.8);
  c.lineTo(-L * 0.05, -W * 1.05);
  c.closePath();
  c.fill();
  c.stroke();
  c.strokeStyle = "#5a3a1c";
  c.lineWidth = 5;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-L * 0.25, -W * 0.05);
  c.lineTo(-L * 0.1, -W * 1.65);
  c.stroke();
  c.beginPath();
  c.moveTo(-L * 0.2, -W * 1.62);
  c.lineTo(L * 0.6, -W * 1.55);
  c.stroke();
  c.restore();
  c.restore();
}

function paintPalm(c: CanvasRenderingContext2D, s: number, v: number) {
  const h = s / 2;
  c.save();
  c.translate(h, h);
  c.fillStyle = "rgba(70,60,20,0.26)";
  c.beginPath();
  c.ellipse(6, 8, h * 0.9, h * 0.8, 0, 0, TAU);
  c.fill();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + v * 0.2;
    const L = h * (0.82 + ((i * 7) % 3) * 0.06);
    c.save();
    c.rotate(a);
    const g = c.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, "#2f7a35");
    g.addColorStop(1, "#6cc060");
    c.fillStyle = g;
    c.strokeStyle = "#1e5a28";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(L * 0.5, -h * 0.22, L, -h * 0.02);
    c.quadraticCurveTo(L * 0.5, h * 0.2, 0, 0);
    c.fill();
    c.stroke();
    // зубчики листя
    c.strokeStyle = "rgba(20,80,30,0.55)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(L * 0.05, 0);
    c.lineTo(L * 0.95, -h * 0.01);
    for (let k = 1; k < 6; k++) {
      const x = (k / 6) * L;
      c.moveTo(x, 0);
      c.lineTo(x + L * 0.08, -h * 0.11 * (1 - k / 7));
      c.moveTo(x, 0);
      c.lineTo(x + L * 0.08, h * 0.11 * (1 - k / 7));
    }
    c.stroke();
    c.restore();
  }
  c.fillStyle = "#7a4b22";
  c.strokeStyle = "#4a2b10";
  c.lineWidth = 1.5;
  for (const [x, y] of [[-6, -4], [5, -6], [3, 6]]) {
    circle(c, x, y, 5.5);
    c.fill();
    c.stroke();
  }
  c.restore();
}

/** Пальма-укриття (замість куща) для спрайта куща: фронти радіусом r навколо центра, що в (0, 0). */
export function drawPalmBush(c: CanvasRenderingContext2D, r: number) {
  c.save();
  c.translate(-r * 1.05, -r * 1.05);
  paintPalm(c, r * 2.1, 1);
  c.restore();
}

function paintChest(c: CanvasRenderingContext2D, s: number, v: number) {
  const h = s / 2;
  c.save();
  c.translate(h, h);
  c.fillStyle = "rgba(80,55,20,0.28)";
  c.beginPath();
  c.ellipse(3, 5, h * 0.8, h * 0.6, 0, 0, TAU);
  c.fill();
  const w = h * 0.78;
  const hh = h * 0.56;
  c.fillStyle = "#8a5a2a";
  c.strokeStyle = "#4a2d12";
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(-w, -hh, w * 2, hh * 2, 6);
  c.fill();
  c.stroke();
  c.strokeStyle = "#5e3a18";
  c.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(-w + 4, i * hh * 0.4);
    c.lineTo(w - 4, i * hh * 0.4);
    c.stroke();
  }
  c.fillStyle = "#f0c030";
  c.strokeStyle = "#a47a10";
  c.lineWidth = 1.5;
  for (const x of [-w * 0.6, w * 0.6]) {
    c.fillRect(x - 5, -hh, 10, hh * 2);
    c.strokeRect(x - 5, -hh, 10, hh * 2);
  }
  circle(c, 0, 0, 6.5);
  c.fill();
  c.stroke();
  c.fillStyle = "#4a2d12";
  c.fillRect(-1.4, -2, 2.8, 5);
  if (v === 0) {
    // розсип монет поруч
    c.fillStyle = "#ffd84a";
    c.strokeStyle = "#a47a10";
    c.lineWidth = 1;
    for (const [x, y] of [[w + 6, 4], [w + 12, -4], [w + 2, 14]]) {
      circle(c, x, y, 3.5);
      c.fill();
      c.stroke();
    }
  }
  c.restore();
}

function paintAnchor(c: CanvasRenderingContext2D, s: number) {
  const h = s / 2;
  c.save();
  c.translate(h, h);
  c.fillStyle = "rgba(60,60,60,0.22)";
  c.beginPath();
  c.ellipse(3, 4, h * 0.7, h * 0.8, 0, 0, TAU);
  c.fill();
  c.strokeStyle = "#4b5663";
  c.fillStyle = "#4b5663";
  c.lineCap = "round";
  c.lineWidth = h * 0.16;
  c.beginPath();
  c.moveTo(0, -h * 0.6);
  c.lineTo(0, h * 0.62);
  c.moveTo(-h * 0.36, -h * 0.3);
  c.lineTo(h * 0.36, -h * 0.3);
  c.stroke();
  c.beginPath();
  c.arc(0, h * 0.18, h * 0.55, Math.PI * 0.05, Math.PI * 0.95);
  c.stroke();
  c.lineWidth = h * 0.1;
  circle(c, 0, -h * 0.74, h * 0.15);
  c.stroke();
  c.fillStyle = "#6a7684";
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.moveTo(sx * h * 0.55, h * 0.18);
    c.lineTo(sx * h * 0.78, h * 0.05);
    c.lineTo(sx * h * 0.66, h * 0.36);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function paintBarrel(c: CanvasRenderingContext2D, s: number) {
  const h = s / 2;
  c.save();
  c.translate(h, h);
  c.fillStyle = "rgba(80,55,20,0.28)";
  c.beginPath();
  c.ellipse(3, 4, h * 0.85, h * 0.85, 0, 0, TAU);
  c.fill();
  c.fillStyle = "#9a6a34";
  c.strokeStyle = "#4e3318";
  c.lineWidth = 3;
  circle(c, 0, 0, h * 0.8);
  c.fill();
  c.stroke();
  c.strokeStyle = "#6d4720";
  c.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    c.beginPath();
    c.moveTo(Math.cos(a) * h * 0.78, Math.sin(a) * h * 0.78);
    c.lineTo(-Math.cos(a) * h * 0.78, -Math.sin(a) * h * 0.78);
    c.stroke();
  }
  c.strokeStyle = "#3a4048";
  c.lineWidth = 3;
  circle(c, 0, 0, h * 0.55);
  c.stroke();
  c.fillStyle = "#5a3a1c";
  circle(c, 0, 0, h * 0.18);
  c.fill();
  c.restore();
}

const decorSprites = new Map<string, HTMLCanvasElement>();
function decorSprite(kind: DecorKind, v: number) {
  const key = `${kind}|${kind === "palm" || kind === "wreck" || kind === "chest" ? v : 0}`;
  let cv = decorSprites.get(key);
  if (cv) return cv;
  const size = kind === "wreck" ? 384 : 256;
  cv = canvas(size, size);
  const c = cv.getContext("2d");
  if (c) {
    c.lineCap = "round";
    c.lineJoin = "round";
    if (kind === "wreck") paintWreck(c, size, v);
    else if (kind === "palm") paintPalm(c, size, v);
    else if (kind === "chest") paintChest(c, size, v);
    else if (kind === "anchor") paintAnchor(c, size);
    else paintBarrel(c, size);
  }
  decorSprites.set(key, cv);
  return cv;
}

// ---------- плавник акули ----------
let finCv: HTMLCanvasElement | null = null;
function finSprite() {
  if (finCv) return finCv;
  const cv = canvas(128, 128);
  const c = cv.getContext("2d");
  if (c) {
    c.translate(64, 64);
    // хвилі навколо
    c.strokeStyle = "rgba(210,245,250,0.85)";
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(0, 18, 42, 12, 0, 0, TAU);
    c.stroke();
    c.strokeStyle = "rgba(210,245,250,0.4)";
    c.beginPath();
    c.ellipse(0, 18, 54, 17, 0, 0, TAU);
    c.stroke();
    // тінь під водою
    c.fillStyle = "rgba(5,25,45,0.4)";
    c.beginPath();
    c.ellipse(4, 22, 38, 11, 0, 0, TAU);
    c.fill();
    // плавник: зігнутий трикутник
    const g = c.createLinearGradient(-20, -40, 20, 20);
    g.addColorStop(0, "#9aa8b4");
    g.addColorStop(1, "#4f5d6b");
    c.fillStyle = g;
    c.strokeStyle = "#2f3a45";
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-22, 20);
    c.quadraticCurveTo(-8, -6, 8, -44);
    c.quadraticCurveTo(14, -10, 26, 20);
    c.quadraticCurveTo(2, 14, -22, 20);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-4, 10);
    c.quadraticCurveTo(2, -10, 8, -34);
    c.stroke();
  }
  finCv = cv;
  return cv;
}

// ---------- їжа: корали, кокоси, скриня (координати 40×40, центр у 0,0) ----------
export function drawTreasureFood(c: CanvasRenderingContext2D, kind: number) {
  c.lineCap = "round";
  c.lineJoin = "round";
  if (kind === 5) {
    drawTreasureChestFood(c);
    return;
  }
  if (kind === 0 || kind === 2) {
    // корал-гілочка: рожевий (0) або помаранчевий (2)
    const dark = kind === 0 ? "#c2406a" : "#c45a1a";
    const light = kind === 0 ? "#ff8fb0" : "#ffb35a";
    for (const [col, lw] of [[dark, 6.2], [light, 3.4]] as [string, number][]) {
      c.strokeStyle = col;
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(0, 15);
      c.lineTo(0, -2);
      c.moveTo(0, 7);
      c.lineTo(-9, -4);
      c.lineTo(-11, -13);
      c.moveTo(0, 3);
      c.lineTo(9, -6);
      c.lineTo(12, -14);
      c.moveTo(0, -2);
      c.lineTo(1, -16);
      c.stroke();
    }
    c.fillStyle = "#fff3f6";
    for (const [x, y] of [[-11, -13], [12, -14], [1, -16]]) {
      circle(c, x, y, 2.2);
      c.fill();
    }
    return;
  }
  // кокос: бурий горіх із трьома «очками»
  c.fillStyle = "rgba(70,40,10,0.28)";
  c.beginPath();
  c.ellipse(1, 3, 15, 14, 0, 0, TAU);
  c.fill();
  const g = c.createRadialGradient(-5, -6, 2, 0, 0, 16);
  g.addColorStop(0, "#a0683a");
  g.addColorStop(1, "#5e3716");
  c.fillStyle = g;
  c.strokeStyle = "#3a200a";
  c.lineWidth = 2.2;
  circle(c, 0, 0, 14);
  c.fill();
  c.stroke();
  c.strokeStyle = "rgba(60,30,8,0.45)";
  c.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.arc(0, 0, 4 + i * 2.2, 0.4 + i, 1.6 + i);
    c.stroke();
  }
  c.fillStyle = "#2a1606";
  for (const [x, y] of [[-3.5, -3], [3.5, -3], [0, 3]]) {
    circle(c, x, y, 2);
    c.fill();
  }
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.ellipse(-6, -8, 4, 2, -0.7, 0, TAU);
  c.fill();
}

/** Скриня зі скарбом (цінна їжа, kind 5): дерев'яна, із золотими смугами, замком і монетами; та сама система 40×40. */
export function drawTreasureChestFood(c: CanvasRenderingContext2D) {
  c.lineCap = "round";
  c.lineJoin = "round";
  c.fillStyle = "rgba(60,40,10,0.3)";
  c.beginPath();
  c.ellipse(1, 7, 17, 8, 0, 0, TAU);
  c.fill();
  // золоте сяйво
  const gl = c.createRadialGradient(0, -2, 4, 0, -2, 24);
  gl.addColorStop(0, "rgba(255,224,110,0.7)");
  gl.addColorStop(1, "rgba(255,224,110,0)");
  c.fillStyle = gl;
  circle(c, 0, -2, 24);
  c.fill();
  c.fillStyle = "#8a5a2a";
  c.strokeStyle = "#4a2d12";
  c.lineWidth = 2.2;
  c.beginPath();
  c.roundRect(-15, -2, 30, 15, 3);
  c.fill();
  c.stroke();
  // кришка-півкруг із монетами
  c.fillStyle = "#a06a30";
  c.beginPath();
  c.moveTo(-15, -2);
  c.quadraticCurveTo(0, -22, 15, -2);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = "#ffd84a";
  c.strokeStyle = "#a47a10";
  c.lineWidth = 1;
  for (const [x, y] of [[-6, -6], [0, -9], [6, -6], [-2, -4]]) {
    circle(c, x, y, 2.6);
    c.fill();
    c.stroke();
  }
  c.fillStyle = "#f0c030";
  c.strokeStyle = "#a47a10";
  c.lineWidth = 1.4;
  for (const x of [-9, 9]) {
    c.fillRect(x - 2.4, -4, 4.8, 17);
    c.strokeRect(x - 2.4, -4, 4.8, 17);
  }
  circle(c, 0, 4, 3.4);
  c.fill();
  c.stroke();
  c.fillStyle = "#4a2d12";
  c.fillRect(-0.8, 3, 1.6, 3);
}

// ---------- малювання світу ----------
const waterPhase = (time: number) => SEQ[Math.floor(time * FPS) % SEQ.length];

/**
 * Вода навколо острова й річка, береги, мости. Контекст у світових координатах; видима область [x0..x1]×[y0..y1].
 * Спершу вода (поза колом й смуга річки поверх піску), далі пояси берегів, мости.
 */
export function drawTreasureWorld(ctx: CanvasRenderingContext2D, c: TreasureCfg, world: number, x0: number, x1: number, y0: number, y1: number, time: number, pxPerUnit: number) {
  const q = quant(pxPerUnit);
  const pat = waterPattern(ctx, waterPhase(time), q);
  const lo = Math.max(-600, x0);
  const hi = Math.min(world + 600, x1);
  const top = Math.max(-600, y0);
  const bot = Math.min(world + 600, y1);
  ctx.fillStyle = pat ?? "#0b3558";
  // вода зовні острова: прямокутник видимої області мінус коло (evenodd)
  ctx.beginPath();
  ctx.rect(lo, top, hi - lo, bot - top);
  ctx.moveTo(c.cx + c.r, c.cy);
  ctx.arc(c.cx, c.cy, c.r, 0, TAU);
  ctx.fill("evenodd");
  // берегова смуга острова
  const pad = 140;
  const rr = c.r + pad;
  if (!(c.cx + rr < x0 || c.cx - rr > x1 || c.cy + rr < y0 || c.cy - rr > y1)) {
    ctx.drawImage(islandShoreSprite(c.r), c.cx - rr, c.cy - rr, rr * 2, rr * 2);
  }
  // річка: смуга води в колі
  if (!(c.y1 < y0 - 120 || c.y0 > y1 + 120)) {
    const chord = Math.sqrt(Math.max(0, c.r * c.r - ((c.y0 + c.y1) / 2 - c.cy) ** 2));
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r + 2, 0, TAU);
    ctx.clip();
    ctx.fillStyle = pat ?? "#0b3558";
    ctx.fillRect(c.cx - chord - 4, c.y0, chord * 2 + 8, c.y1 - c.y0);
    // береги річки (тонкі смуги вздовж x): північний і південний
    const bh = 120;
    ctx.drawImage(bankSprite(true), c.cx - chord - 4, c.y0 - bh / 2 - 20, chord * 2 + 8, bh);
    ctx.drawImage(bankSprite(false), c.cx - chord - 4, c.y1 - bh / 2 + 20, chord * 2 + 8, bh);
    ctx.restore();
    // мости (дошки впоперек; трохи довші за річку, щоб лягти на обидва береги)
    for (const b of c.b) {
      if (b[1] < x0 - 40 || b[0] > x1 + 40) continue;
      const w = b[1] - b[0];
      ctx.drawImage(bridgeSprite(w), b[0], c.y0 - 26, w, c.y1 - c.y0 + 52);
    }
  }
}

/** Декор на піску (кешовані спрайти): кораблі-руїни, пальми, скрині, якорі, бочки. */
export function drawTreasureDecor(ctx: CanvasRenderingContext2D, c: TreasureCfg, x0: number, x1: number, y0: number, y1: number) {
  for (const d of treasureDecor(c)) {
    const R = d.s * 1.1;
    if (d.x + R < x0 || d.x - R > x1 || d.y + R < y0 || d.y - R > y1) continue;
    const size = d.kind === "wreck" ? d.s * 2.2 : d.s * 2;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.kind === "palm" ? d.rot : d.kind === "wreck" ? d.rot * 0.35 : d.rot);
    ctx.drawImage(decorSprite(d.kind, d.v), -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

/** Плавник акули біля кожної клітини у воді: кружляє навколо клітини (позиція від часу й id, без стану й без сутностей на сервері). */
export function drawSharkFin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, id: number, time: number) {
  const a = time * 1.3 + id * 2.1;
  const d = r * 1.1 + 12;
  const size = Math.max(96, r * 1.35);
  ctx.save();
  ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8);
  ctx.rotate(a + Math.PI / 2);
  ctx.drawImage(finSprite(), -size / 2, -size * 0.78, size, size);
  ctx.restore();
}

/** Кільце-попередження біля води (як у лави): червоне пунктирне коло навколо своєї клітини. */
export function drawWaterWarning(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, scale: number) {
  const pulse = 0.55 + 0.45 * Math.sin(time * 9);
  ctx.strokeStyle = `rgba(255,70,50,${0.45 + 0.45 * pulse})`;
  ctx.lineWidth = Math.max(3 / scale, r * 0.1);
  ctx.setLineDash([r * 0.35, r * 0.2]);
  ctx.beginPath();
  ctx.arc(x, y, r * (1.12 + 0.06 * pulse), 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
}

let glowCv: HTMLCanvasElement | null = null;
/** Червоне сяйво по краях екрана, коли своя клітина близько до води (0..1). */
export function drawWaterGlow(ctx: CanvasRenderingContext2D, W: number, H: number, level: number, time: number) {
  if (level <= 0.02) return;
  if (!glowCv) {
    glowCv = canvas(8, 128);
    const c = glowCv.getContext("2d");
    if (c) {
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, "rgba(255,40,30,0.55)");
      g.addColorStop(1, "rgba(255,40,30,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 8, 128);
    }
  }
  const k = Math.min(1, level) * (0.75 + 0.25 * Math.sin(time * 5));
  const h = Math.min(H * 0.22, 150);
  ctx.globalAlpha = k;
  ctx.drawImage(glowCv, 0, 0, W, h);
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);
  ctx.drawImage(glowCv, 0, 0, W, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Мініатюра: вода, острів (пісок), річка, мости. size - сторона мініатюри в px, world - сторона світу. */
export function drawTreasureMinimap(ctx: CanvasRenderingContext2D, c: TreasureCfg, size: number, world: number) {
  const k = size / world;
  ctx.fillStyle = "#0e4a72";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ead7a0";
  ctx.beginPath();
  ctx.arc(c.cx * k, c.cy * k, c.r * k, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#6fe0dc";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.cx * k, c.cy * k, c.r * k, 0, TAU);
  ctx.clip();
  ctx.fillStyle = "#0e4a72";
  ctx.fillRect(0, c.y0 * k, size, Math.max(2, (c.y1 - c.y0) * k));
  ctx.fillStyle = "#b98a50";
  for (const b of c.b) ctx.fillRect(b[0] * k, c.y0 * k - 0.5, Math.max(2, (b[1] - b[0]) * k), Math.max(2, (c.y1 - c.y0) * k) + 1);
  ctx.restore();
}

export function resetTreasureCache() {
  waterFrames.clear();
  waterPatterns.clear();
  shoreCache.clear();
  decorSprites.clear();
  decorCache.clear();
  finCv = null;
  glowCv = null;
}
