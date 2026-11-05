import type { Skin, SkinDeco } from "./flockSkins";

/**
 * «Легендарні» скіни (12 штук, статичні, без бонусів): перлинна мушля, орігамі, порцелянова, кленова, аметист, вітраж
 * і небесний ряд - ангельська, небесна синь, райські врата, сяйво, призма, лілії.
 *
 * Малюються кодом, у тому самому кеш-спрайті, що й решта скінів: жодного shadowBlur і нічого на кадр.
 * Вівця тут повністю «своя» (вовна + візерунок), а мордочка, очі й вушка малюються поверх звичайним кодом `drawCreature`.
 * Візерунок задано в «опорній» системі координат: радіус тіла = 1, мордочка дивиться у правий нижній кут (45°);
 * перед малюванням систему повертають так, щоб цей кут збігався з напрямком руху вівці.
 */
export const LEGENDARY_DECOS: readonly SkinDeco[] = [
  "lgShell",
  "lgOrigami",
  "lgPorcelain",
  "lgMaple",
  "lgAmethyst",
  "lgGlass",
  "lgAngel",
  "lgSky",
  "lgGate",
  "lgRays",
  "lgPrism",
  "lgLily",
];

export const isLegendaryDeco = (d: SkinDeco | undefined): boolean => !!d && LEGENDARY_DECOS.includes(d);

const TAU = Math.PI * 2;
const REF_ANG = Math.PI / 4;

// ---------- загальні примітиви (одиниці = радіус тіла) ----------

interface FluffOpts {
  n?: number;
  ring?: number;
  br?: number;
  disc?: number;
  rot?: number;
}

/** Контур кучерявої вовни: кільце куль + диск; усе в одному шляху (об'єднання - для заливки й кліпа). */
function fluffPath(c: CanvasRenderingContext2D, grow = 0, o: FluffOpts = {}) {
  const n = o.n ?? 11;
  const ring = o.ring ?? 0.74;
  const br = (o.br ?? 0.27) + grow;
  const disc = (o.disc ?? 0.82) + grow;
  const rot = o.rot ?? 0.2;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rot;
    const x = Math.cos(a) * ring;
    const y = Math.sin(a) * ring;
    c.moveTo(x + br, y);
    c.arc(x, y, br, 0, TAU);
  }
  c.moveTo(disc, 0);
  c.arc(0, 0, disc, 0, TAU);
}

function fluff(c: CanvasRenderingContext2D, fill: string | CanvasGradient, rim?: string, rimW = 0.05, o: FluffOpts = {}) {
  if (rim) {
    fluffPath(c, rimW, o);
    c.fillStyle = rim;
    c.fill();
  }
  fluffPath(c, 0, o);
  c.fillStyle = fill;
  c.fill();
}

function lin(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

function rad(c: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | CanvasGradient) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}

/** М'яке світле плямо на вовні (як у решти скінів). */
function sheen(c: CanvasRenderingContext2D, alpha = 0.3) {
  c.globalAlpha = alpha;
  disc(c, -0.25, -0.3, 0.5, "#ffffff");
  c.globalAlpha = 1;
}

function poly(c: CanvasRenderingContext2D, pts: ArrayLike<readonly [number, number]>) {
  c.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i) c.lineTo(pts[i][0], pts[i][1]);
    else c.moveTo(pts[i][0], pts[i][1]);
  }
  c.closePath();
}

/** Чотирикутна іскра з увігнутими боками. */
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, stroke?: string) {
  const k = s * 0.16;
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x + k, y - k, x + s, y);
  c.quadraticCurveTo(x + k, y + k, x, y + s);
  c.quadraticCurveTo(x - k, y + k, x - s, y);
  c.quadraticCurveTo(x - k, y - k, x, y - s);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 0.025;
    c.stroke();
  }
}

/** Пухка хмаринка: три кулі й плоский низ; `shade` - тінь знизу. */
function puff(c: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, shade: string) {
  const shape = (dy: number, col: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x - 0.5 * s, y + 0.1 * s + dy, 0.34 * s, 0, TAU);
    c.arc(x - 0.08 * s, y - 0.12 * s + dy, 0.46 * s, 0, TAU);
    c.arc(x + 0.46 * s, y + 0.06 * s + dy, 0.36 * s, 0, TAU);
    c.moveTo(x - 0.5 * s, y + 0.44 * s + dy);
    c.arc(x - 0.5 * s, y + 0.1 * s + dy, 0.34 * s, Math.PI / 2, Math.PI * 1.5);
    c.rect(x - 0.5 * s, y + 0.1 * s + dy - 0.0, 0.96 * s, 0.34 * s);
    c.fill();
  };
  shape(0.07 * s, shade);
  shape(0, fill);
}

/** Золота пелюстка-крапля / листок: основа (0,0), кінчик на +x. */
function leafShape(c: CanvasRenderingContext2D, x: number, y: number, rot: number, len: number, wid: number, fill: string, vein?: string) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.45, -wid, len, 0);
  c.quadraticCurveTo(len * 0.45, wid, 0, 0);
  c.fillStyle = fill;
  c.fill();
  if (vein) {
    c.strokeStyle = vein;
    c.lineWidth = 0.02;
    c.beginPath();
    c.moveTo(len * 0.08, 0);
    c.lineTo(len * 0.85, 0);
    c.stroke();
  }
  c.restore();
}

// ---------- 1. Перлинна мушля ----------
function drawShell(c: CanvasRenderingContext2D) {
  fluff(c, "#d7c4f0", "#f7e8d8", 0.05, { n: 9, ring: 0.72, br: 0.3, disc: 0.8 });
  c.save();
  fluffPath(c, 0, { n: 9, ring: 0.72, br: 0.3, disc: 0.8 });
  c.clip();
  const hx = 0.5;
  const hy = 0.5;
  const R = 1.7;
  const lobes = 7;
  const a0 = Math.PI * 0.62;
  const a1 = Math.PI * 1.98;
  for (let i = 0; i < lobes; i++) {
    const t0 = a0 + ((a1 - a0) * i) / lobes;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / lobes;
    c.beginPath();
    c.moveTo(hx, hy);
    c.arc(hx, hy, R, t0, t1);
    c.closePath();
    const m = (t0 + t1) / 2;
    c.fillStyle = lin(c, hx, hy, hx + Math.cos(m) * R, hy + Math.sin(m) * R, i % 2 ? [[0, "#cdb6ee"], [1, "#e9dcfa"]] : [[0, "#c2a8e8"], [1, "#dccbf5"]]);
    c.fill();
    c.strokeStyle = "rgba(255,246,236,0.9)";
    c.lineWidth = 0.035;
    c.stroke();
  }
  // перламутровий відблиск
  c.globalAlpha = 0.35;
  disc(c, -0.2, -0.25, 0.65, "#ffffff");
  c.globalAlpha = 1;
  c.restore();
  // жемчужина
  disc(c, -0.32, -0.4, 0.34, "rgba(120,90,170,0.28)");
  disc(c, -0.33, -0.42, 0.3, rad(c, -0.42, -0.52, 0.02, 0.34, [[0, "#ffffff"], [0.45, "#fff4e2"], [1, "#efd7b8"]]));
  disc(c, -0.43, -0.53, 0.06, "rgba(255,255,255,0.95)");
}

// ---------- 2. Орігамі ----------
function drawOrigami(c: CanvasRenderingContext2D) {
  const V: [number, number][] = [
    [-0.28, -1.0],
    [0.34, -0.98],
    [0.9, -0.55],
    [1.0, 0.1],
    [0.78, 0.78],
    [0.16, 1.0],
    [-0.52, 0.86],
    [-0.98, 0.3],
    [-1.0, -0.4],
    [-0.72, -0.82],
  ];
  const K: [number, number] = [-0.08, -0.05];
  const shades = ["#fffaf0", "#ece1cf", "#faf3e6", "#e3d8c6", "#fffdf8", "#efe5d4", "#f7efe0", "#e8dccb", "#fffaf0", "#f0e6d5"];
  c.lineJoin = "round";
  // тінь-контур
  poly(c, V.map(([x, y]) => [x * 1.05, y * 1.05] as [number, number]));
  c.fillStyle = "#d9cdb8";
  c.fill();
  for (let i = 0; i < V.length; i++) {
    const a = V[i];
    const b = V[(i + 1) % V.length];
    poly(c, [K, a, b]);
    c.fillStyle = shades[i];
    c.fill();
  }
  // додаткові згини: другий шар трикутників
  poly(c, [V[8], V[9], V[0], K]);
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.fill();
  poly(c, [V[2], V[3], V[4], K]);
  c.fillStyle = "rgba(160,140,110,0.18)";
  c.fill();
  // сині лінії згинів
  c.strokeStyle = "#2f5fd6";
  c.lineWidth = 0.06;
  c.lineCap = "round";
  const line = (p: [number, number], q: [number, number]) => {
    c.beginPath();
    c.moveTo(p[0], p[1]);
    c.lineTo(q[0], q[1]);
    c.stroke();
  };
  line(V[0], K);
  line(V[1], V[0]);
  line(V[8], V[9]);
  line(K, V[7]);
  line(K, V[4]);
  line(V[9], V[8]);
  c.lineWidth = 0.035;
  line(V[2], V[3]);
  line(K, V[1]);
  c.strokeStyle = "rgba(120,100,70,0.35)";
  c.lineWidth = 0.02;
  line(K, V[5]);
  line(K, V[3]);
}

// ---------- 3. Порцелянова ----------
function swirl(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, flip: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s * flip, s);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = "#2f5fd0";
  c.fillStyle = "#2f5fd0";
  // S-подібна лоза із завитком на кінці й листком
  c.lineWidth = 0.1;
  c.beginPath();
  c.moveTo(-0.7, 0.2);
  c.bezierCurveTo(-0.4, -0.35, 0.15, 0.35, 0.45, -0.1);
  c.bezierCurveTo(0.65, -0.4, 0.3, -0.62, 0.15, -0.42);
  c.bezierCurveTo(0.05, -0.28, 0.2, -0.18, 0.28, -0.26);
  c.stroke();
  disc(c, -0.72, 0.2, 0.09, "#2f5fd0");
  leafShape(c, -0.2, -0.02, -0.9, 0.5, 0.16, "#3b6fe0");
  leafShape(c, 0.1, 0.08, 0.7, 0.42, 0.14, "#3b6fe0");
  c.restore();
}

function drawPorcelain(c: CanvasRenderingContext2D) {
  fluff(c, lin(c, -1, -1, 1, 1, [[0, "#ffffff"], [1, "#e9eefb"]]), "#2f5fd0", 0.045);
  c.save();
  fluffPath(c);
  c.clip();
  // внутрішній тонкий синій обідок по бульбашках
  c.strokeStyle = "rgba(47,95,208,0.35)";
  c.lineWidth = 0.025;
  c.stroke();
  swirl(c, -0.42, -0.5, 0.72, -0.4, 1);
  swirl(c, 0.38, -0.55, 0.55, 0.5, -1);
  swirl(c, -0.62, 0.35, 0.55, 0.9, 1);
  swirl(c, 0.05, 0.02, 0.4, 2.2, -1);
  swirl(c, 0.2, 0.78, 0.45, 0.2, -1);
  c.globalAlpha = 0.18;
  disc(c, -0.25, -0.3, 0.5, "#ffffff");
  c.globalAlpha = 1;
  c.restore();
}

// ---------- 4. Кленова ----------
const MAPLE_R: [number, number][] = [
  [0, -1],
  [0.13, -0.72],
  [0.34, -0.8],
  [0.3, -0.45],
  [0.66, -0.6],
  [0.55, -0.25],
  [0.98, -0.12],
  [0.7, 0.1],
  [0.82, 0.4],
  [0.38, 0.3],
  [0.1, 0.5],
  [0.06, 0.6],
];

function mapleLeaf(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, fill: string, vein: string) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  c.lineJoin = "round";
  c.beginPath();
  for (let i = 0; i < MAPLE_R.length; i++) c[i ? "lineTo" : "moveTo"](MAPLE_R[i][0], MAPLE_R[i][1]);
  for (let i = MAPLE_R.length - 1; i >= 0; i--) c.lineTo(-MAPLE_R[i][0], MAPLE_R[i][1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = vein;
  c.lineWidth = 0.07;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0, -0.85);
  c.lineTo(0, 1.0);
  c.moveTo(0, 0.25);
  c.lineTo(0.7, -0.15);
  c.moveTo(0, 0.25);
  c.lineTo(-0.7, -0.15);
  c.moveTo(0, -0.2);
  c.lineTo(0.45, -0.55);
  c.moveTo(0, -0.2);
  c.lineTo(-0.45, -0.55);
  c.stroke();
  c.restore();
}

function drawMaple(c: CanvasRenderingContext2D) {
  // зубчаста червона вовна
  fluff(c, "#d2382a", "#9c2218", 0.045, { n: 12, ring: 0.76, br: 0.25, disc: 0.84, rot: 0.1 });
  c.save();
  fluffPath(c, 0, { n: 12, ring: 0.76, br: 0.25, disc: 0.84, rot: 0.1 });
  c.clip();
  // темніші й світліші дрібні листочки на тлі
  mapleLeaf(c, 0.7, -0.55, 0.3, 0.9, "#b8281c", "#8d1c13");
  mapleLeaf(c, -0.05, 0.75, 0.3, -0.6, "#e0502c", "#a82a18");
  mapleLeaf(c, 0.72, 0.1, 0.24, 1.9, "#a8231a", "#7d1810");
  mapleLeaf(c, -0.8, 0.12, 0.28, -1.8, "#c93222", "#8d1c13");
  c.restore();
  // нижні помаранчеві листочки
  mapleLeaf(c, -0.62, 0.55, 0.32, -0.3, "#f0752a", "#b94d17");
  mapleLeaf(c, 0.55, -0.6, 0.27, 0.8, "#f08a34", "#b94d17");
  // головний листок
  mapleLeaf(c, -0.28, -0.22, 0.78, -0.35, "#f6a763", "#c9692a");
}

// ---------- 5. Аметист ----------
function prism(c: CanvasRenderingContext2D, bx: number, by: number, ang: number, w: number, len: number, cols: [string, string, string]) {
  c.save();
  c.translate(bx, by);
  c.rotate(ang);
  c.lineJoin = "round";
  const top: [number, number][] = [[0, -w], [len * 0.72, -w * 0.92], [len, 0], [0, 0]];
  const bot: [number, number][] = [[0, w], [len * 0.72, w * 0.92], [len, 0], [0, 0]];
  poly(c, top);
  c.fillStyle = cols[0];
  c.fill();
  poly(c, bot);
  c.fillStyle = cols[1];
  c.fill();
  // світла грань уздовж верхнього ребра
  poly(c, [[0, -w], [len * 0.72, -w * 0.92], [len * 0.72, -w * 0.3], [0, -w * 0.3]]);
  c.fillStyle = cols[2];
  c.globalAlpha = 0.6;
  c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = "rgba(60,30,100,0.35)";
  c.lineWidth = 0.02;
  poly(c, [[0, -w], [len * 0.72, -w * 0.92], [len, 0], [len * 0.72, w * 0.92], [0, w]]);
  c.stroke();
  c.beginPath();
  c.moveTo(len * 0.72, -w * 0.92);
  c.lineTo(len * 0.72, w * 0.92);
  c.moveTo(0, 0);
  c.lineTo(len, 0);
  c.stroke();
  c.restore();
}

function drawAmethyst(c: CanvasRenderingContext2D) {
  fluff(c, "#7a559f", "#5b3b80", 0.05, { n: 11, ring: 0.74, br: 0.27, disc: 0.82 });
  c.save();
  fluffPath(c);
  c.clip();
  c.globalAlpha = 0.35;
  disc(c, -0.3, -0.4, 0.6, "#a47fd0");
  c.globalAlpha = 1;
  c.restore();
  const cols: [string, string, string][] = [
    ["#c8a6f2", "#9a6fd4", "#efe0ff"],
    ["#b98ced", "#8a5cc6", "#e6d2fb"],
    ["#d6b8f8", "#a77ede", "#f6ecff"],
  ];
  const base: [number, number, number, number, number, number][] = [
    // x, y, кут, піврозмір, довжина, колір
    [0.2, 0.3, -2.75, 0.13, 0.95, 0],
    [0.3, 0.25, -2.25, 0.2, 1.3, 1],
    [0.3, 0.2, -1.75, 0.22, 1.4, 2],
    [0.3, 0.15, -1.3, 0.17, 1.15, 0],
    [0.4, 0.4, -3.05, 0.12, 0.8, 1],
  ];
  for (const [x, y, a, w, len, ci] of base) prism(c, x, y, a, w, len, cols[ci]);
  // дрібні кристали біля підніжжя
  prism(c, -0.5, 0.65, -2.3, 0.07, 0.3, cols[2]);
  prism(c, -0.15, 0.78, -1.9, 0.06, 0.26, cols[0]);
}

// ---------- 6. Вітраж ----------
function drawGlass(c: CanvasRenderingContext2D) {
  const o: FluffOpts = { n: 8, ring: 0.7, br: 0.34, disc: 0.82, rot: 0.3 };
  fluff(c, "#2a2230", "#6f5a6a", 0.05, o);
  c.save();
  fluffPath(c, -0.02, o);
  c.clip();
  const C: [number, number] = [-0.18, -0.12];
  const cols = ["#1fa56a", "#d92f3b", "#2459d6", "#d92f3b", "#2459d6", "#1fa56a", "#d92f3b", "#2459d6"];
  const lite = ["#43cf8b", "#ff6573", "#4f86f2", "#ff6573", "#4f86f2", "#43cf8b", "#ff6573", "#4f86f2"];
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * TAU - Math.PI * 0.4;
    const t1 = ((i + 1) / n) * TAU - Math.PI * 0.4;
    c.beginPath();
    c.moveTo(C[0], C[1]);
    c.arc(C[0], C[1], 1.7, t0, t1);
    c.closePath();
    const m = (t0 + t1) / 2;
    c.fillStyle = lin(c, C[0], C[1], C[0] + Math.cos(m) * 1.1, C[1] + Math.sin(m) * 1.1, [[0, lite[i]], [1, cols[i]]]);
    c.fill();
  }
  // свинцеві перемички: радіальні й по бульбашках
  c.strokeStyle = "#2a2230";
  c.lineWidth = 0.055;
  c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU - Math.PI * 0.4;
    c.beginPath();
    c.moveTo(C[0], C[1]);
    c.lineTo(C[0] + Math.cos(t) * 1.6, C[1] + Math.sin(t) * 1.6);
    c.stroke();
  }
  for (const rr of [0.55, 0.95]) {
    c.beginPath();
    c.arc(C[0], C[1], rr, 0, TAU);
    c.stroke();
  }
  disc(c, C[0], C[1], 0.3, "#2a2230");
  c.restore();
  sparkle(c, C[0], C[1], 0.3, "#f6c445", "#a97a14");
}

// ---------- 7. Ангельська ----------
function wing(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, flip: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s * flip, s);
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(0.2, -0.5, 0.75, -0.72, 1.15, -0.5);
  c.bezierCurveTo(1.2, -0.38, 1.12, -0.3, 1.04, -0.26);
  c.bezierCurveTo(1.08, -0.14, 0.98, -0.06, 0.88, -0.04);
  c.bezierCurveTo(0.9, 0.08, 0.78, 0.14, 0.66, 0.12);
  c.bezierCurveTo(0.62, 0.22, 0.46, 0.24, 0.34, 0.18);
  c.bezierCurveTo(0.22, 0.2, 0.08, 0.12, 0, 0);
  c.closePath();
  c.fillStyle = lin(c, 0, -0.6, 0.6, 0.2, [[0, "#fffdf6"], [1, "#fbe9c4"]]);
  c.fill();
  c.strokeStyle = "#e8b34a";
  c.lineWidth = 0.065;
  c.stroke();
  // перо-лінії
  c.lineWidth = 0.035;
  c.beginPath();
  c.moveTo(0.35, -0.12);
  c.quadraticCurveTo(0.7, -0.28, 1.0, -0.3);
  c.moveTo(0.3, 0.02);
  c.quadraticCurveTo(0.6, -0.08, 0.86, -0.08);
  c.stroke();
  c.restore();
}

function drawAngel(c: CanvasRenderingContext2D) {
  fluff(c, lin(c, -1, -1, 1, 1, [[0, "#fffaf0"], [1, "#fbeccf"]]), "#e8b34a", 0.045);
  c.save();
  fluffPath(c);
  c.clip();
  c.globalAlpha = 0.5;
  disc(c, -0.25, -0.3, 0.55, "#ffffff");
  c.globalAlpha = 1;
  c.restore();
  wing(c, 0.0, -0.7, 0.82, -2.5, 1);
  wing(c, -0.1, -0.55, 0.86, -3.35, -1);
  sparkle(c, -0.45, -0.08, 0.26, "#f0b32e");
  sparkle(c, -0.05, -0.1, 0.18, "#f0b32e");
  sparkle(c, -0.25, 0.28, 0.12, "#f6cc62");
  sparkle(c, 0.3, -0.52, 0.1, "#f6cc62");
}

// ---------- 8. Небесна синь ----------
function drawSky(c: CanvasRenderingContext2D) {
  fluff(c, lin(c, 0, -1, 0, 1, [[0, "#1d6fd8"], [1, "#2d86e8"]]), "#f1c14c", 0.055);
  c.save();
  fluffPath(c);
  c.clip();
  puff(c, 0.0, 0.88, 0.7, "#5fa2ef", "#3d82d8");
  puff(c, -0.32, -0.55, 0.62, "#fbf4e6", "#ddd0ba");
  puff(c, -0.78, 0.0, 0.42, "#fbf4e6", "#ddd0ba");
  puff(c, 0.62, -0.28, 0.44, "#fbf4e6", "#ddd0ba");
  c.restore();
}

// ---------- 9. Райські врата ----------
function drawGate(c: CanvasRenderingContext2D) {
  fluff(c, lin(c, 0, -1, 0, 1, [[0, "#b496e0"], [1, "#a98acf"]]), "#8f72bd", 0.04);
  c.save();
  fluffPath(c);
  c.clip();
  c.globalAlpha = 0.3;
  disc(c, -0.25, -0.35, 0.55, "#ffffff");
  c.globalAlpha = 1;
  puff(c, -0.5, 0.65, 0.62, "#e4d6f7", "#c4aee6");
  puff(c, 0.1, 0.92, 0.55, "#e4d6f7", "#c4aee6");
  c.restore();
  // арка
  c.save();
  c.translate(0, -0.15);
  c.scale(0.94, 0.94);
  c.lineJoin = "round";
  const arch = () => {
    c.beginPath();
    c.moveTo(-0.4, 0.6);
    c.lineTo(-0.4, -0.12);
    c.quadraticCurveTo(-0.4, -0.5, 0, -0.78);
    c.quadraticCurveTo(0.4, -0.5, 0.4, -0.12);
    c.lineTo(0.4, 0.6);
    c.closePath();
  };
  arch();
  c.fillStyle = "#a88ad8";
  c.fill();
  c.strokeStyle = "#f0c248";
  c.lineWidth = 0.09;
  c.stroke();
  c.lineWidth = 0.05;
  for (const x of [-0.24, -0.08, 0.08, 0.24]) {
    c.beginPath();
    c.moveTo(x, 0.56);
    c.lineTo(x, -0.38 - (0.2 - Math.abs(x)) * 0.8);
    c.stroke();
  }
  // верхній вінець
  c.beginPath();
  c.moveTo(0, -0.78);
  c.lineTo(0, -0.92);
  c.moveTo(-0.14, -0.7);
  c.quadraticCurveTo(-0.2, -0.88, -0.06, -0.92);
  c.moveTo(0.14, -0.7);
  c.quadraticCurveTo(0.2, -0.88, 0.06, -0.92);
  c.stroke();
  sparkle(c, 0, 0.0, 0.17, "#ffffff");
  c.restore();
  // перлини
  for (const [x, y] of [[-0.74, -0.28], [0.74, -0.3]]) {
    disc(c, x, y, 0.13, "rgba(90,60,140,0.3)");
    disc(c, x, y, 0.115, rad(c, x - 0.04, y - 0.04, 0.01, 0.12, [[0, "#ffffff"], [1, "#efdcc6"]]));
  }
}

// ---------- 10. Сяйво ----------
function drawRays(c: CanvasRenderingContext2D) {
  const o: FluffOpts = { n: 9, ring: 0.72, br: 0.3, disc: 0.8 };
  fluff(c, "#f7cf68", "#e4a626", 0.05, o);
  c.save();
  fluffPath(c, 0, o);
  c.clip();
  const hx = 0.4;
  const hy = 0.45;
  const n = 8;
  const a0 = Math.PI * 0.64;
  const a1 = Math.PI * 1.9;
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    c.beginPath();
    c.moveTo(hx, hy);
    c.arc(hx, hy, 1.9, t0, t1);
    c.closePath();
    c.fillStyle = i % 2 ? "#fff0b8" : "#f9d878";
    c.fill();
  }
  c.globalAlpha = 0.5;
  disc(c, hx, hy, 0.5, "#fffbe8");
  c.globalAlpha = 1;
  c.restore();
  sparkle(c, -0.12, -0.38, 0.3, "#e89a12", "#b9740a");
  sparkle(c, -0.62, 0.0, 0.17, "#ffffff");
  sparkle(c, 0.38, -0.44, 0.15, "#ffffff");
}

// ---------- 11. Призма ----------
function drawPrism(c: CanvasRenderingContext2D) {
  fluff(c, "#a9d8f4", "#7fb8e0", 0.045);
  c.save();
  fluffPath(c);
  c.clip();
  c.globalAlpha = 0.4;
  disc(c, -0.3, -0.35, 0.55, "#ffffff");
  c.globalAlpha = 1;
  c.restore();
  // великий перламутровий кристал із золотими гранями
  const P: [number, number][] = [
    [-0.28, -0.82],
    [0.32, -0.74],
    [0.66, -0.28],
    [0.58, 0.28],
    [0.1, 0.6],
    [-0.5, 0.52],
    [-0.8, 0.0],
    [-0.74, -0.5],
  ];
  const Q: [number, number] = [-0.08, -0.12];
  const fills = [
    ["#f7c8ea", "#d8c9fa"],
    ["#c9d4fb", "#a9e3f4"],
    ["#b9f0e0", "#a8d8f6"],
    ["#a8dcf6", "#c6c6f7"],
    ["#d9c4f6", "#f6c4e2"],
    ["#f9d0e4", "#c9e4f9"],
    ["#c0ecf4", "#bfd2f8"],
    ["#e8c8f2", "#f7d6e6"],
  ];
  c.lineJoin = "round";
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    poly(c, [Q, a, b]);
    c.fillStyle = lin(c, a[0], a[1], b[0], b[1], [[0, fills[i][0]], [1, fills[i][1]]]);
    c.fill();
  }
  c.strokeStyle = "#e2aa3c";
  c.lineWidth = 0.05;
  poly(c, P);
  c.stroke();
  c.lineWidth = 0.035;
  c.beginPath();
  for (const i of [0, 2, 3, 5, 6]) {
    c.moveTo(Q[0], Q[1]);
    c.lineTo(P[i][0], P[i][1]);
  }
  c.stroke();
  c.globalAlpha = 0.6;
  poly(c, [P[7], P[0], Q]);
  c.fillStyle = "#ffffff";
  c.fill();
  c.globalAlpha = 1;
}

// ---------- 12. Лілії ----------
function lily(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  const petal = (a: number, len: number, wid: number, fill: string) => {
    c.save();
    c.rotate(a);
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(wid, -len * 0.3, wid * 0.8, -len * 0.75, 0, -len);
    c.bezierCurveTo(-wid * 0.8, -len * 0.75, -wid, -len * 0.3, 0, 0);
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = "rgba(214,176,98,0.7)";
    c.lineWidth = 0.025;
    c.stroke();
    c.beginPath();
    c.moveTo(0, -len * 0.1);
    c.lineTo(0, -len * 0.7);
    c.strokeStyle = "rgba(232,196,110,0.8)";
    c.stroke();
    c.restore();
  };
  // задні пелюстки темніші
  for (const a of [-2.3, 2.3, Math.PI]) petal(a, 0.9, 0.26, "#f2e6cc");
  for (const a of [-1.25, 1.25, 0]) petal(a, 1.0, 0.3, "#fffaf0");
  // тичинки
  c.strokeStyle = "#e0a93a";
  c.lineWidth = 0.025;
  for (const a of [-0.7, -0.3, 0.05, 0.4, 0.75]) {
    const ex = Math.sin(a) * 0.62;
    const ey = -Math.cos(a) * 0.62;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(ex, ey);
    c.stroke();
    disc(c, ex, ey, 0.05, "#d9962a");
  }
  c.restore();
}

function drawLily(c: CanvasRenderingContext2D) {
  fluff(c, lin(c, 0, -1, 0, 1, [[0, "#6a9be6"], [1, "#8db4ee"]]), "#4a7ccc", 0.045);
  c.save();
  fluffPath(c);
  c.clip();
  c.globalAlpha = 0.28;
  disc(c, -0.25, -0.35, 0.55, "#ffffff");
  c.globalAlpha = 1;
  puff(c, -0.35, 0.85, 0.55, "#b8d0f7", "#98b8ee");
  // золоті стебла й листя
  c.strokeStyle = "#f0c248";
  c.lineWidth = 0.05;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0.1, -0.2);
  c.bezierCurveTo(0.15, 0.2, 0.0, 0.4, -0.15, 0.85);
  c.moveTo(-0.55, 0.2);
  c.bezierCurveTo(-0.5, 0.45, -0.4, 0.6, -0.3, 0.85);
  c.stroke();
  leafShape(c, 0.05, 0.3, -0.5, 0.62, 0.17, "#f2c552");
  leafShape(c, 0.0, 0.5, 0.35 + Math.PI, 0.52, 0.15, "#f2c552");
  leafShape(c, -0.1, 0.7, -2.4, 0.5, 0.14, "#f2c552");
  leafShape(c, 0.55, 0.2, -0.5, 0.45, 0.13, "#f2c552");
  c.restore();
  lily(c, -0.1, -0.38, 0.68, 0.25);
  lily(c, -0.6, 0.08, 0.44, -0.9);
}

// ---------- вхід ----------
interface LegendDef {
  draw: (c: CanvasRenderingContext2D) => void;
  /** Колір вушок (у референсі вони світлі й відрізняються від чорної мордочки). */
  ear: string;
}

const LEGEND: Partial<Record<SkinDeco, LegendDef>> = {
  lgShell: { draw: drawShell, ear: "#f1d6c8" },
  lgOrigami: { draw: drawOrigami, ear: "#f7dcc4" },
  lgPorcelain: { draw: drawPorcelain, ear: "#c9dcfa" },
  lgMaple: { draw: drawMaple, ear: "#f2845c" },
  lgAmethyst: { draw: drawAmethyst, ear: "#b996ee" },
  lgGlass: { draw: drawGlass, ear: "#f2a2b6" },
  lgAngel: { draw: drawAngel, ear: "#f7c6b0" },
  lgSky: { draw: drawSky, ear: "#fbd2c0" },
  lgGate: { draw: drawGate, ear: "#f5cdb9" },
  lgRays: { draw: drawRays, ear: "#f8d2b4" },
  lgPrism: { draw: drawPrism, ear: "#bcd8f8" },
  lgLily: { draw: drawLily, ear: "#bcd2f6" },
};

/** Вся «вовна» легендарної вівці з візерунком; мордочку й очі малює `drawCreature` поверх. */
export function drawLegendaryBody(c: CanvasRenderingContext2D, skin: Skin, r: number, ang: number) {
  const def = skin.deco ? LEGEND[skin.deco] : undefined;
  if (!def) return;
  c.save();
  // м'яка тінь, як у решти скінів
  c.fillStyle = "rgba(0,0,0,0.16)";
  c.beginPath();
  c.arc(r * 0.05, r * 0.07, r * 0.98, 0, TAU);
  c.fill();
  c.rotate(ang - REF_ANG);
  c.scale(r, r);
  def.draw(c);
  c.restore();
}

/** Світлі вушка поверх чорних (ті самі місця, що й у звичайних скінів). */
export function drawLegendaryEars(c: CanvasRenderingContext2D, skin: Skin, r: number, ang: number) {
  const def = skin.deco ? LEGEND[skin.deco] : undefined;
  if (!def) return;
  c.fillStyle = def.ear;
  for (const side of [-1, 1]) {
    const a = ang + side * 1.75;
    c.beginPath();
    c.ellipse(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, r * 0.25, r * 0.15, a, 0, TAU);
    c.fill();
  }
}
