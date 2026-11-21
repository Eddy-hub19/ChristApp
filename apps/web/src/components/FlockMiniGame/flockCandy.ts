/**
 * Карта «Цукеркова країна» (id 8): пастельна земля з цукерковим декором, їжа-цукерки, мармеладні зарості, зони карамелі
 * й мініатюра. Усе малюється один раз у кешований тайл / спрайт; кольори не залежать від теми застосунку.
 * Сервер: flock.candy.ts (зони, формула уповільнення), FLOCK_MAPS[8] (кущі), welcome.candy.
 */

export const CANDY_MAP_ID = 8;

const TAU = Math.PI * 2;

/** Зони карамелі з welcome: p - калюжі, s - липка карамель ([x, y, r]), pf / sf - частка уповільнення. */
export interface CandyCfg {
  /** «Цукерковий дощ»: r - радіус цукерки, br - радіус ударної хвилі; pending - цукерки, що вже падають на момент входу (fall - мс до удару). */
  rain?: { r: number; br: number; pending: { id: number; x: number; y: number; fall: number }[] };
  /** Шоколадна ріка: смуга [y0, y1] на всю ширину, d - бік течії по x (1 / -1), c - печеньки-плоти [x, y, r], v0 і mh - формула швидкості течії. */
  river?: { y0: number; y1: number; d: 1 | -1; c: [number, number, number][]; v0: number; mh: number; ed?: number };
  p: [number, number, number][];
  s: [number, number, number][];
  pf: number;
  sf: number;
}

/** Множник швидкості в точці (дзеркало серверного candyFactor): 1 - чисто, 1 - sf у липкій карамелі, 1 - pf у калюжі. */
export function candyFactorOf(cfg: CandyCfg | undefined, x: number, y: number): number {
  if (!cfg) return 1;
  for (const z of cfg.s) {
    const dx = x - z[0];
    const dy = y - z[1];
    if (dx * dx + dy * dy < z[2] * z[2]) return 1 - cfg.sf;
  }
  for (const z of cfg.p) {
    const dx = x - z[0];
    const dy = y - z[1];
    if (dx * dx + dy * dy < z[2] * z[2]) return 1 - cfg.pf;
  }
  return 1;
}

/** Скільки центр клітини може зайти за край світу в руслі ріки (там загорожі нема; далі її відносить). 0 - не в руслі. */
export function riverExitDepthAt(cfg: CandyCfg | undefined, y: number): number {
  const rv = cfg?.river;
  return rv && y > rv.y0 && y < rv.y1 ? (rv.ed ?? 0) : 0;
}

/** Швидкість течії (од./с, зі знаком по x) у точці для клітини маси mass; 0 - не в руслі або на печеньці. Дзеркало серверного inCurrent + riverSpeedFor. */
export function riverDriftAt(cfg: CandyCfg | undefined, x: number, y: number, mass: number): number {
  const rv = cfg?.river;
  if (!rv || y <= rv.y0 || y >= rv.y1) return 0;
  for (const c of rv.c) {
    const dx = x - c[0];
    const dy = y - c[1];
    if (dx * dx + dy * dy < c[2] * c[2]) return 0;
  }
  return (rv.d * rv.v0) / (1 + mass / rv.mh);
}

/** Малює фігуру ще й зі зсувом на період біля краю тайла - візерунок стикується без швів. */
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

const SPRINKLES = ["#ff6f91", "#ffd166", "#5fd0e8", "#9be58a", "#b894ff", "#ffffff", "#ff9a5a"];
const GLAZE = ["rgba(255,255,255,0.42)", "rgba(176,232,208,0.26)", "rgba(190,214,255,0.26)", "rgba(255,232,160,0.28)", "rgba(255,176,208,0.28)"];
const LOLLY: [string, string][] = [
  ["#ff5d8f", "#ffe3ec"],
  ["#2fc4a0", "#dcfbf1"],
  ["#ff9f3d", "#fff0d6"],
  ["#8a78ff", "#e8e4ff"],
];
const GUMMY = ["#ff5a6e", "#ffa43a", "#58d27f", "#ffd84a", "#7fb8ff"];

/** Зефірка (вигляд зверху): м'який кремовий квадрат із легкою тінню. */
function marshmallow(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, pink: boolean) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = "rgba(160,90,110,0.16)";
  c.beginPath();
  c.roundRect(-s / 2 + 2, -s / 2 + 3, s, s, s * 0.32);
  c.fill();
  const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, pink ? "#ffeaf1" : "#fffaf3");
  g.addColorStop(1, pink ? "#ffc4d8" : "#f6e3d4");
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-s / 2, -s / 2, s, s, s * 0.32);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.8)";
  c.lineWidth = 1.4;
  c.beginPath();
  c.roundRect(-s / 2 + 2.5, -s / 2 + 2.5, s - 5, s - 5, s * 0.26);
  c.stroke();
  c.restore();
}

/** Льодяник-спіралька (вигляд зверху): біла основа, закручена смуга кольору, блиск. */
function lollipop(c: CanvasRenderingContext2D, x: number, y: number, R: number, rot: number, pal: [string, string]) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = "rgba(150,80,100,0.16)";
  c.beginPath();
  c.arc(2, 3, R, 0, TAU);
  c.fill();
  c.fillStyle = pal[1];
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.fill();
  c.strokeStyle = pal[0];
  c.lineWidth = R * 0.2;
  c.lineCap = "round";
  c.beginPath();
  const turns = 3.2;
  for (let a = 0; a <= turns * TAU; a += 0.18) {
    const rr = (a / (turns * TAU)) * R * 0.86;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (a === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(0, 0, R - 1, 0, TAU);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.beginPath();
  c.ellipse(-R * 0.4, -R * 0.45, R * 0.28, R * 0.12, -0.7, 0, TAU);
  c.fill();
  c.restore();
}

/** Мармеладний ведмедик (вигляд зверху, напівпрозорий). */
function gummyBear(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, color: string) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.globalAlpha = 0.92;
  c.fillStyle = "rgba(90,40,60,0.18)";
  c.beginPath();
  c.ellipse(2, 3, s * 0.4, s * 0.5, 0, 0, TAU);
  c.fill();
  c.fillStyle = color;
  const blob = (bx: number, by: number, rx: number, ry: number, a = 0) => {
    c.beginPath();
    c.ellipse(bx, by, rx, ry, a, 0, TAU);
    c.fill();
  };
  blob(0, s * 0.1, s * 0.3, s * 0.36); // тіло
  blob(-s * 0.36, s * 0.0, s * 0.11, s * 0.2, 0.5); // лапи
  blob(s * 0.36, s * 0.0, s * 0.11, s * 0.2, -0.5);
  blob(-s * 0.18, s * 0.46, s * 0.12, s * 0.17, 0.2); // ноги
  blob(s * 0.18, s * 0.46, s * 0.12, s * 0.17, -0.2);
  blob(0, -s * 0.3, s * 0.24, s * 0.22); // голова
  blob(-s * 0.18, -s * 0.46, s * 0.09, s * 0.09); // вуха
  blob(s * 0.18, -s * 0.46, s * 0.09, s * 0.09);
  c.fillStyle = "rgba(255,255,255,0.5)";
  c.beginPath();
  c.ellipse(-s * 0.1, -s * 0.34, s * 0.09, s * 0.05, -0.5, 0, TAU);
  c.fill();
  c.beginPath();
  c.ellipse(-s * 0.1, s * 0.0, s * 0.1, s * 0.06, -0.4, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(60,25,40,0.55)";
  for (const dx of [-0.08, 0.08]) {
    c.beginPath();
    c.arc(s * dx, -s * 0.3, s * 0.025, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** Мармеладний черв'ячок: смугастий вигнутий відрізок. */
function gummyWorm(c: CanvasRenderingContext2D, x: number, y: number, len: number, rot: number, color: string, bend: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineCap = "round";
  const path = () => {
    c.beginPath();
    c.moveTo(-len / 2, 0);
    c.quadraticCurveTo(0, bend, len / 2, 0);
  };
  c.strokeStyle = "rgba(90,40,60,0.2)";
  c.lineWidth = 12;
  c.save();
  c.translate(2, 3);
  path();
  c.stroke();
  c.restore();
  c.strokeStyle = color;
  c.lineWidth = 10;
  path();
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.4)";
  c.lineWidth = 10;
  c.setLineDash([2.5, 6]);
  path();
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.lineWidth = 2.2;
  c.save();
  c.translate(0, -2.6);
  path();
  c.stroke();
  c.restore();
  c.restore();
}

/** Земля тайла: пастельні плями глазурі, посипка, зефірки, льодяники, мармеладні ведмедики й черв'ячки (контекст уже в одиницях світу, span x span). */
export function paintCandyGround(c: CanvasRenderingContext2D, span: number, r: () => number) {
  // плями глазурі: м'які великі краплі з білою кромкою
  for (let i = 0; i < 13; i++) {
    const x = r() * span;
    const y = r() * span;
    const w = 46 + r() * 74;
    const rot = r() * 3;
    const fill = GLAZE[i % GLAZE.length];
    wrapped(span, x, y, w, (px, py) => {
      c.fillStyle = fill;
      c.beginPath();
      c.ellipse(px, py, w, w * (0.5 + r() * 0.2), rot, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(px, py, w - 3, w * 0.55 - 3, rot, 0.4, 2.2);
      c.stroke();
    });
  }
  // посипка
  c.lineCap = "round";
  c.globalAlpha = 0.75;
  for (let i = 0; i < 150; i++) {
    const x = r() * span;
    const y = r() * span;
    const a = r() * TAU;
    const len = 5 + r() * 4;
    c.strokeStyle = SPRINKLES[i % SPRINKLES.length];
    c.lineWidth = 3;
    wrapped(span, x, y, 8, (px, py) => {
      c.beginPath();
      c.moveTo(px - Math.cos(a) * len * 0.5, py - Math.sin(a) * len * 0.5);
      c.lineTo(px + Math.cos(a) * len * 0.5, py + Math.sin(a) * len * 0.5);
      c.stroke();
    });
  }
  c.globalAlpha = 0.8;
  // черв'ячки
  for (let i = 0; i < 4; i++) {
    const x = r() * span;
    const y = r() * span;
    const len = 56 + r() * 30;
    const rot = r() * TAU;
    const bend = (r() - 0.5) * 36;
    const col = GUMMY[i % GUMMY.length];
    wrapped(span, x, y, len, (px, py) => gummyWorm(c, px, py, len, rot, col, bend));
  }
  // зефірки
  for (let i = 0; i < 6; i++) {
    const x = r() * span;
    const y = r() * span;
    const s = 26 + r() * 14;
    const rot = (r() - 0.5) * 0.9;
    const pink = r() < 0.5;
    wrapped(span, x, y, s, (px, py) => marshmallow(c, px, py, s, rot, pink));
  }
  // льодяники-спіральки
  for (let i = 0; i < 4; i++) {
    const x = r() * span;
    const y = r() * span;
    const R = 24 + r() * 12;
    const rot = r() * TAU;
    const pal = LOLLY[i % LOLLY.length];
    wrapped(span, x, y, R, (px, py) => lollipop(c, px, py, R, rot, pal));
  }
  // мармеладні ведмедики
  for (let i = 0; i < 4; i++) {
    const x = r() * span;
    const y = r() * span;
    const s = 38 + r() * 12;
    const rot = r() * TAU;
    const col = GUMMY[(i + 2) % GUMMY.length];
    wrapped(span, x, y, s, (px, py) => gummyBear(c, px, py, s, rot, col));
  }
  c.globalAlpha = 1;
}

/** Їжа «Цукеркової країни» (координати 40×40, центр у 0,0): kind 0 - цукерка в обгортці, 1 - драже, 2 - ягідка в глазурі. Цінність однакова. */
export function drawCandyFood(c: CanvasRenderingContext2D, kind: number) {
  c.lineCap = "round";
  c.lineJoin = "round";
  if (kind === 0) {
    c.save();
    c.rotate(-0.45);
    // кінчики обгортки
    c.fillStyle = "#ff8fb4";
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(sx * 9, 0);
      c.lineTo(sx * 17, -7);
      c.lineTo(sx * 17, 7);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = "#b8426b";
    c.lineWidth = 1.6;
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(sx * 9, 0);
      c.lineTo(sx * 17, -7);
      c.lineTo(sx * 17, 7);
      c.closePath();
      c.stroke();
    }
    const g = c.createLinearGradient(0, -8, 0, 8);
    g.addColorStop(0, "#ffd0e0");
    g.addColorStop(1, "#ff7fa8");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, 11, 8, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 2.2;
    for (const dx of [-5, 0, 5]) {
      c.beginPath();
      c.moveTo(dx - 2, -6);
      c.lineTo(dx + 2, 6);
      c.stroke();
    }
    c.restore();
  } else if (kind === 1) {
    c.fillStyle = "rgba(60,90,100,0.28)";
    c.beginPath();
    c.arc(1, 2, 11.5, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(-4, -4, 1, 0, 0, 12);
    g.addColorStop(0, "#c9fff2");
    g.addColorStop(1, "#2fc4a0");
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 11, 0, TAU);
    c.fill();
    c.strokeStyle = "#1c8d70";
    c.lineWidth = 1.6;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.beginPath();
    c.ellipse(-4.2, -4.6, 3.6, 2.2, -0.6, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.9)";
    for (const [x, y] of [[4, 3], [-1, 5.5], [5.5, -3]]) {
      c.beginPath();
      c.arc(x, y, 0.9, 0, TAU);
      c.fill();
    }
  } else {
    c.fillStyle = "rgba(90,30,50,0.28)";
    c.beginPath();
    c.arc(1, 2.5, 10.5, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(-3, -3, 1, 0, 1, 11);
    g.addColorStop(0, "#ff8a9e");
    g.addColorStop(1, "#d92f55");
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 1, 10, 0, TAU);
    c.fill();
    // глазур: біла шапочка зі стіками
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#e8c9d6";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-9.5, -2);
    c.quadraticCurveTo(-8, -10, 0, -10.5);
    c.quadraticCurveTo(8, -10, 9.5, -2);
    c.quadraticCurveTo(7, 1.5, 5, -1);
    c.quadraticCurveTo(3, 3.5, 0.5, -0.5);
    c.quadraticCurveTo(-2.5, 4, -4.5, -0.5);
    c.quadraticCurveTo(-7, 2, -9.5, -2);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#5fcb6f";
    c.beginPath();
    c.ellipse(1.5, -11.5, 4, 2, -0.5, 0, TAU);
    c.fill();
  }
}

/** Мармеладні кущі: колір за id куща (детерміновано, однаково на всіх клієнтах). */
export const JELLY_KINDS = ["jellyRed", "jellyGreen", "jellyOrange", "jellyPurple"] as const;
export type JellyKind = (typeof JELLY_KINDS)[number];

const JELLY_COLORS: Record<JellyKind, [string, string, string]> = {
  jellyRed: ["255,90,110", "255,196,204", "190,36,64"],
  jellyGreen: ["82,209,122", "196,246,212", "30,150,80"],
  jellyOrange: ["255,164,58", "255,222,170", "206,112,22"],
  jellyPurple: ["165,107,255", "224,206,255", "106,50,198"],
};

export const isJellyKind = (k: string): k is JellyKind => (JELLY_KINDS as readonly string[]).includes(k);

/** Мармеладний кущ у спрайті (центр 0,0, радіус r): напівпрозорий гумовий «купол» із зубчастим краєм, блиском і цукровою крихтою. */
export function drawJellyBush(c: CanvasRenderingContext2D, r: number, kind: JellyKind) {
  const [base, light, deep] = JELLY_COLORS[kind];
  const lobes = 9;
  const blob = (k: number) => {
    c.beginPath();
    for (let i = 0; i <= 90; i++) {
      const a = (i / 90) * TAU;
      const rr = r * k * (0.95 + 0.05 * Math.cos(a * lobes));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  };
  c.fillStyle = "rgba(60,20,40,0.2)";
  c.save();
  c.translate(r * 0.04, r * 0.07);
  blob(0.98);
  c.fill();
  c.restore();
  const g = c.createRadialGradient(-r * 0.3, -r * 0.34, r * 0.05, 0, 0, r);
  g.addColorStop(0, `rgba(${light},0.9)`);
  g.addColorStop(0.55, `rgba(${base},0.78)`);
  g.addColorStop(1, `rgba(${deep},0.82)`);
  c.fillStyle = g;
  blob(1);
  c.fill();
  c.strokeStyle = `rgba(${deep},0.95)`;
  c.lineWidth = r * 0.055;
  c.lineJoin = "round";
  blob(1);
  c.stroke();
  // внутрішнє кільце-«ядро»
  c.strokeStyle = `rgba(${light},0.55)`;
  c.lineWidth = r * 0.04;
  blob(0.62);
  c.stroke();
  // блиск
  c.fillStyle = "rgba(255,255,255,0.6)";
  c.beginPath();
  c.ellipse(-r * 0.34, -r * 0.4, r * 0.27, r * 0.12, -0.65, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(-r * 0.06, -r * 0.58, r * 0.04, 0, TAU);
  c.fill();
  // цукрова крихта
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  c.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 38; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * r * 0.82;
    c.fillRect(Math.cos(a) * d, Math.sin(a) * d, r * 0.03, r * 0.03);
  }
}

/** Зона карамелі в спрайті s×s (круг із легким «пливом» краю; seed - щоб зони відрізнялися): калюжа - бурштин, липка - темна тоффі з бульбашками. */
export function paintCandyZone(c: CanvasRenderingContext2D, s: number, sticky: boolean, seed: number) {
  const half = s / 2;
  const phase = (seed * 2.399) % TAU;
  const blob = (k: number) => {
    c.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * TAU;
      const wob = 1 + 0.045 * Math.sin(a * 3 + phase) + 0.03 * Math.sin(a * 5 - phase * 1.7);
      const px = half + Math.cos(a) * (half - 3) * k * wob;
      const py = half + Math.sin(a) * (half - 3) * k * wob;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  };
  const g = c.createRadialGradient(half * 0.85, half * 0.8, s * 0.04, half, half, half);
  if (sticky) {
    g.addColorStop(0, "rgba(176,100,40,0.86)");
    g.addColorStop(0.7, "rgba(128,66,22,0.84)");
    g.addColorStop(1, "rgba(96,46,14,0.7)");
  } else {
    g.addColorStop(0, "rgba(255,196,84,0.74)");
    g.addColorStop(0.75, "rgba(240,150,48,0.68)");
    g.addColorStop(1, "rgba(220,128,34,0.45)");
  }
  c.fillStyle = g;
  blob(1);
  c.fill();
  c.strokeStyle = sticky ? "rgba(255,206,130,0.7)" : "rgba(255,226,150,0.8)";
  c.lineWidth = Math.max(2, s * 0.018);
  blob(0.94);
  c.stroke();
  if (sticky) {
    // бульбашки та тягучі нитки тоффі
    let sd = seed * 7 + 3;
    const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * half * 0.62;
      const rr = s * (0.025 + rnd() * 0.035);
      c.fillStyle = "rgba(255,214,150,0.5)";
      c.beginPath();
      c.arc(half + Math.cos(a) * d, half + Math.sin(a) * d, rr, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(255,240,200,0.7)";
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(half + Math.cos(a) * d - rr * 0.3, half + Math.sin(a) * d - rr * 0.3, rr * 0.45, 3.4, 5);
      c.stroke();
    }
  }
  // відблиск
  c.fillStyle = "rgba(255,255,255,0.4)";
  c.beginPath();
  c.ellipse(half * 0.62, half * 0.55, s * 0.17, s * 0.07, -0.55, 0, TAU);
  c.fill();
}

/** Мініатюра: зони карамелі й мармеладні кущі (small dots); size - сторона мініатюри в px, world - сторона світу. */
export function drawCandyMinimap(
  ctx: CanvasRenderingContext2D,
  candy: CandyCfg | undefined,
  thorns: Iterable<{ id: number; x: number; y: number; mass: number }>,
  radiusOf: (mass: number) => number,
  size: number,
  world: number,
) {
  const k = size / world;
  if (candy) {
    ctx.fillStyle = "rgba(240,160,56,0.5)";
    for (const z of candy.p) {
      ctx.beginPath();
      ctx.arc(z[0] * k, z[1] * k, Math.max(1.5, z[2] * k), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(150,82,30,0.72)";
    for (const z of candy.s) {
      ctx.beginPath();
      ctx.arc(z[0] * k, z[1] * k, Math.max(1.8, z[2] * k), 0, TAU);
      ctx.fill();
    }
  }
  const dots = ["#ff6a80", "#58d27f", "#ffa43a", "#a56bff"];
  for (const t of thorns) {
    ctx.fillStyle = dots[t.id % dots.length];
    ctx.beginPath();
    ctx.arc(t.x * k, t.y * k, Math.max(1.6, radiusOf(t.mass) * k), 0, TAU);
    ctx.fill();
  }
}

const TILE = 256;

/** Тайл шоколаду 256x256 для течії: тонкі хвилі й глянцеві відблиски; стикується по обох осях. */
export function paintChocolateTile(c: CanvasRenderingContext2D) {
  c.fillStyle = "#5a3220";
  c.fillRect(0, 0, TILE, TILE);
  let sd = 71;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 7; i++) {
    const y = (i + 0.5) * (TILE / 7) + (rnd() - 0.5) * 8;
    const amp = 5 + rnd() * 4;
    const ph = rnd() * TAU;
    c.strokeStyle = i % 2 === 0 ? "rgba(255,206,150,0.22)" : "rgba(30,12,6,0.32)";
    c.lineWidth = 3 + rnd() * 2;
    c.lineCap = "round";
    c.beginPath();
    for (let x = 0; x <= TILE; x += 8) {
      const yy = y + Math.sin((x / TILE) * TAU * 2 + ph) * amp;
      if (x === 0) c.moveTo(x, yy);
      else c.lineTo(x, yy);
    }
    c.stroke();
  }
  c.fillStyle = "rgba(255,230,200,0.3)";
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.ellipse(rnd() * TILE, rnd() * TILE, 10 + rnd() * 10, 2.5, 0, 0, TAU);
    c.fill();
  }
}

/** Печенька-пліт r: шоколадна крихта на золотистій основі, з тінню й відблиском (спрайт 2.4r, малюється один раз). */
export function paintCookie(c: CanvasRenderingContext2D, s: number, seed: number) {
  const half = s / 2;
  const r = s * 0.4;
  let sd = seed * 13 + 5;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const blob = (R: number) => {
    c.beginPath();
    const ph = seed * 1.7;
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU;
      const w = 1 + 0.03 * Math.sin(a * 5 + ph) + 0.02 * Math.sin(a * 9 - ph);
      const x = half + Math.cos(a) * R * w;
      const y = half + Math.sin(a) * R * w;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  // тінь на шоколаді
  c.fillStyle = "rgba(25,10,4,0.45)";
  c.save();
  c.translate(r * 0.08, r * 0.12);
  blob(r * 1.05);
  c.fill();
  c.restore();
  const g = c.createRadialGradient(half - r * 0.3, half - r * 0.35, r * 0.1, half, half, r);
  g.addColorStop(0, "#f2c378");
  g.addColorStop(0.7, "#d9a04e");
  g.addColorStop(1, "#b97c34");
  c.fillStyle = g;
  blob(r);
  c.fill();
  c.strokeStyle = "rgba(122,72,26,0.75)";
  c.lineWidth = Math.max(1.5, r * 0.04);
  blob(r * 0.97);
  c.stroke();
  // шоколадні крапельки
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * r * 0.72;
    const rr = r * (0.07 + rnd() * 0.06);
    c.fillStyle = "#4a2616";
    c.beginPath();
    c.ellipse(half + Math.cos(a) * d, half + Math.sin(a) * d, rr, rr * 0.8, rnd() * 3, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(255,220,180,0.35)";
    c.beginPath();
    c.arc(half + Math.cos(a) * d - rr * 0.3, half + Math.sin(a) * d - rr * 0.3, rr * 0.3, 0, TAU);
    c.fill();
  }
  c.fillStyle = "rgba(255,255,255,0.28)";
  c.beginPath();
  c.ellipse(half - r * 0.35, half - r * 0.45, r * 0.3, r * 0.1, -0.6, 0, TAU);
  c.fill();
}

/** Мініатюра: ріка смугою, печеньки світлими цятками. */
export function drawRiverMinimap(ctx: CanvasRenderingContext2D, river: NonNullable<CandyCfg["river"]>, size: number, world: number) {
  const k = size / world;
  ctx.fillStyle = "rgba(92,52,30,0.85)";
  ctx.fillRect(0, river.y0 * k, size, (river.y1 - river.y0) * k);
  ctx.fillStyle = "rgba(232,176,92,0.95)";
  for (const c of river.c) {
    ctx.beginPath();
    ctx.arc(c[0] * k, c[1] * k, Math.max(1.4, c[2] * k), 0, TAU);
    ctx.fill();
  }
}

const WRAP: [string, string, string][] = [
  ["#ff5d8f", "#ffd1e0", "#ffffff"],
  ["#2fc4a0", "#c9f7ea", "#fff6c9"],
  ["#ff9f3d", "#ffe2bd", "#ffffff"],
  ["#8a78ff", "#dcd6ff", "#ffe0f0"],
];

/** Велика цукерка в обгортці (вигляд зверху; спрайт s×s, цукерка по центру займає ~0.62 s, «крильця» обгортки по боках). */
export function paintGiantCandy(c: CanvasRenderingContext2D, s: number, variant: number) {
  const [main, light, stripe] = WRAP[variant % WRAP.length];
  const h = s / 2;
  const R = s * 0.31;
  // крильця обгортки
  for (const sign of [-1, 1]) {
    c.save();
    c.translate(h + sign * R * 0.95, h);
    c.fillStyle = main;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(sign * R * 0.95, -R * 0.78);
    c.quadraticCurveTo(sign * R * 0.7, 0, sign * R * 0.95, R * 0.78);
    c.closePath();
    c.fill();
    c.strokeStyle = light;
    c.lineWidth = s * 0.012;
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(sign * R * 0.1, i * R * 0.06);
      c.lineTo(sign * R * 0.88, i * R * 0.3);
      c.stroke();
    }
    c.restore();
  }
  // тіло
  const g = c.createRadialGradient(h - R * 0.3, h - R * 0.35, R * 0.1, h, h, R);
  g.addColorStop(0, light);
  g.addColorStop(0.45, main);
  g.addColorStop(1, main);
  c.fillStyle = g;
  c.beginPath();
  c.arc(h, h, R, 0, TAU);
  c.fill();
  // смужки-спіраль
  c.save();
  c.beginPath();
  c.arc(h, h, R * 0.97, 0, TAU);
  c.clip();
  c.strokeStyle = stripe;
  c.globalAlpha = 0.85;
  c.lineWidth = R * 0.2;
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.moveTo(h - R * 1.3 + i * R * 0.5, h - R * 1.2);
    c.lineTo(h - R * 0.3 + i * R * 0.5, h + R * 1.2);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.lineWidth = s * 0.014;
  c.beginPath();
  c.arc(h, h, R - s * 0.01, 0, TAU);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.6)";
  c.beginPath();
  c.ellipse(h - R * 0.4, h - R * 0.5, R * 0.3, R * 0.13, -0.7, 0, TAU);
  c.fill();
}
