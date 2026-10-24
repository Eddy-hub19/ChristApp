/**
 * Генератор фонов чата: public/chat-bg/<id>-light.svg и <id>-dark.svg.
 * Один код сцены на оба варианта (меняется только палитра), чтобы светлая и тёмная версии совпадали по рисунку.
 * Оригинальная векторная графика: плоские формы и мягкие градиенты в стиле иконок игры и пузырей, без чужих ассетов.
 * Запуск: node scripts/generate-chat-backgrounds.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "chat-bg");
mkdirSync(OUT, { recursive: true });

const W = 400;
const H = 800;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;

/** Плавная кривая через точки (Catmull-Rom -> Безье), замкнутая вниз до низа картинки. */
function hill(pts, fill, opacity = 1, bottom = H) {
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  d += ` L${pts[pts.length - 1][0]},${bottom} L${pts[0][0]},${bottom}Z`;
  return `<path d="${d}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`;
}
const circle = (x, y, r, fill, extra = "") => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ellipse = (x, y, rx, ry, fill, extra = "") => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;

function stars(n, seed, ymax, color, rmax = 1.4) {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += circle(r() * W, r() * ymax, 0.4 + r() * rmax, color, ` opacity="${f(0.35 + r() * 0.65)}"`);
  }
  return out;
}

function cloud(x, y, s, fill, opacity = 1) {
  const g = [
    [0, 0, 26],
    [26, -12, 32],
    [58, -2, 28],
    [84, 6, 20],
    [-22, 8, 18],
  ];
  const body = g.map(([dx, dy, r]) => circle(x + dx * s, y + dy * s, r * s, fill)).join("");
  return `<g opacity="${opacity}">${body}${ellipse(x + 36 * s, y + 18 * s, 66 * s, 14 * s, fill)}</g>`;
}

function sheep(x, y, s, wool, face, shade) {
  const puffs = [
    [-16, -2, 13],
    [-4, -9, 14],
    [10, -6, 13],
    [20, 2, 11],
    [-10, 8, 12],
    [6, 9, 12],
    [0, 0, 16],
  ]
    .map(([dx, dy, r]) => circle(x + dx * s, y + dy * s, r * s, wool))
    .join("");
  const legs = [-9, 5]
    .map((dx) => `<rect x="${f(x + dx * s)}" y="${f(y + 14 * s)}" width="${f(3.4 * s)}" height="${f(11 * s)}" rx="${f(1.6 * s)}" fill="${shade}"/>`)
    .join("");
  return `<g>${legs}${puffs}${ellipse(x + 25 * s, y + 4 * s, 7.5 * s, 6.5 * s, face)}${ellipse(x + 21 * s, y - 1 * s, 2.6 * s, 1.6 * s, face)}</g>`;
}

function tree(x, y, s, leaf, trunk) {
  return `<g><rect x="${f(x - 2 * s)}" y="${f(y)}" width="${f(4 * s)}" height="${f(18 * s)}" fill="${trunk}"/>${circle(x, y - 6 * s, 14 * s, leaf)}${circle(x - 11 * s, y + 2 * s, 10 * s, leaf)}${circle(x + 11 * s, y + 1 * s, 11 * s, leaf)}</g>`;
}

function cypress(x, y, s, fill) {
  return `<path d="M${f(x)},${f(y - 38 * s)} C${f(x + 9 * s)},${f(y - 20 * s)} ${f(x + 8 * s)},${f(y - 4 * s)} ${f(x)},${f(y)} C${f(x - 8 * s)},${f(y - 4 * s)} ${f(x - 9 * s)},${f(y - 20 * s)} ${f(x)},${f(y - 38 * s)}Z" fill="${fill}"/>`;
}

function skyDefs(id, stops) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops
    .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
    .join("")}</linearGradient>`;
}

function svg(body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>\n`;
}

function sunGlow(id, x, y, r, color) {
  return `<radialGradient id="${id}" cx="${x}" cy="${y}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="0.9"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
}

const pastureScene = (d) => {
  const P = d
    ? { sky: [[0, "#070d22"], [0.55, "#1b2850"], [1, "#34456f"]], cloud: "#4a5a86", cloudOp: 0.55, far: "#222f55", mid: "#1b2a46", lake: "#27406a", hill: "#16301f", hill2: "#10261a", tree: "#143020", trunk: "#2a2518", wool: "#cfd3e0", face: "#4b4658", shade: "#3a3a50", fence: "#5b4a34", flower: "#b9c3de" }
    : { sky: [[0, "#8fc6ef"], [0.55, "#cfe6f4"], [1, "#fbe6bd"]], cloud: "#ffffff", cloudOp: 0.9, far: "#b6cfa6", mid: "#a2c48f", lake: "#a7d0e2", hill: "#8dba6a", hill2: "#77a858", tree: "#5f9a4b", trunk: "#7a5a36", wool: "#fffdf6", face: "#4a3a32", shade: "#6d5a48", fence: "#9a7a4e", flower: "#ffffff" };
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (d) {
    b += stars(70, 11, 430, "#fff", 1.1);
    b += circle(292, 190, 44, "url(#glow)") + circle(292, 190, 17, "#f6efc9") + circle(285, 186, 3, "#e0d7a8", ' opacity="0.7"');
  } else {
    b += circle(90, 468, 70, "url(#glow)") + circle(90, 468, 20, "#fff4c4");
  }
  b += cloud(40, 130, 1.2, P.cloud, P.cloudOp) + cloud(250, 320, 1, P.cloud, P.cloudOp) + cloud(120, 420, 1.3, P.cloud, P.cloudOp * 0.8);
  b += hill([[0, 490], [120, 470], [260, 486], [400, 462]], P.far);
  b += hill([[0, 516], [150, 500], [290, 514], [400, 498]], P.mid);
  // церковь на холме
  b += `<g><rect x="296" y="476" width="22" height="16" fill="${d ? "#2b3552" : "#d9c9a8"}"/><path d="M296,476 L307,462 L318,476Z" fill="${d ? "#38426a" : "#b0805a"}"/><rect x="300" y="484" width="3.4" height="6" fill="${d ? "#ffd27a" : "#8a6a48"}"/><rect x="311" y="484" width="3.4" height="6" fill="${d ? "#ffd27a" : "#8a6a48"}"/><path d="M307,462 v-7 M304.5,457.5 h5" stroke="${d ? "#c8d0ea" : "#8a6a48"}" stroke-width="1.4"/></g>`;
  b += `<rect y="528" width="${W}" height="26" fill="${P.lake}"/>`;
  if (d) b += `<path d="M150,540 h60 M165,546 h34" stroke="#c9d6f2" stroke-width="2" opacity="0.5" stroke-linecap="round"/>`;
  b += hill([[0, 548], [140, 538], [280, 552], [400, 540]], P.hill);
  b += tree(70, 548, 1.25, P.tree, P.trunk) + tree(338, 556, 0.8, P.tree, P.trunk);
  b += hill([[0, 590], [120, 574], [270, 592], [400, 578]], P.hill2);
  // стадо вдали
  b += sheep(248, 596, 0.34, P.wool, P.face, P.shade) + sheep(300, 600, 0.3, P.wool, P.face, P.shade);
  // изгородь
  b += `<g stroke="${P.fence}" stroke-width="3.4" stroke-linecap="round"><path d="M0,636 H78 M0,648 H78"/><path d="M26,626 v40 M64,628 v40" stroke-width="5"/></g>`;
  b += hill([[0, 690], [130, 664], [280, 682], [400, 660]], d ? "#0e2217" : "#6a9a4c");
  b += sheep(150, 668, 0.86, P.wool, P.face, P.shade) + sheep(238, 688, 0.6, P.wool, P.face, P.shade);
  const r = rng(5);
  for (let i = 0; i < 38; i++) b += circle(r() * W, 700 + r() * 100, 1.4 + r() * 1.8, P.flower, ` opacity="${f(0.5 + r() * 0.5)}"`);
  return svg(b, skyDefs("sky", P.sky) + sunGlow("glow", d ? 292 : 90, d ? 190 : 468, d ? 44 : 70, d ? "#f6efc9" : "#ffe9a0"));
};

const skyScene = (d) => {
  const P = d
    ? { sky: [[0, "#080e24"], [0.5, "#1f2a52"], [0.78, "#3d3550"], [1, "#6b4a3c"]], c1: "#3a4670", c2: "#5a4d6e", c3: "#7a5a58", bird: "#0a0f22" }
    : { sky: [[0, "#7fb2e4"], [0.5, "#b9d6ef"], [0.78, "#f6e2c0"], [1, "#f9d6a6"]], c1: "#ffffff", c2: "#fdf0dc", c3: "#fbe0b8", bird: "#5b6a82" };
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (d) b += stars(90, 21, 520, "#fff", 1) + circle(300, 110, 34, "url(#glow)") + `<path d="M306,82 a28,28 0 1 0 0,56 a22,22 0 1 1 0,-56Z" fill="#e8e4cf"/>`;
  else b += circle(60, 560, 120, "url(#glow)") + circle(60, 560, 22, "#fff6cc");
  for (const [x, y, s, o] of [[20, 90, 1.4, 0.9], [230, 170, 1.1, 0.8], [90, 250, 1.6, 0.7], [260, 340, 1.3, 0.8], [-10, 440, 1.5, 0.85]]) b += cloud(x, y, s, P.c1, o);
  const birds = [[150, 300, 1.3], [212, 328, 1], [262, 296, 0.8], [186, 270, 0.7]];
  for (const [x, y, s] of birds) b += `<path d="M${x - 14 * s},${y} Q${x - 6 * s},${y - 9 * s} ${x},${y} Q${x + 6 * s},${y - 9 * s} ${x + 14 * s},${y}" fill="none" stroke="${P.bird}" stroke-width="${f(2 * s)}" stroke-linecap="round"/>`;
  for (const [x, y, s, c] of [[-20, 600, 2.2, P.c3], [200, 620, 2, P.c2], [30, 680, 2.4, P.c1], [240, 720, 2.2, P.c3], [-30, 770, 2.6, P.c2], [210, 790, 2.4, P.c1]]) b += cloud(x, y, s, c, 0.95);
  b += `<rect y="772" width="${W}" height="30" fill="${P.c1}" opacity="0.5"/>`;
  return svg(b, skyDefs("sky", P.sky) + sunGlow("glow", d ? 300 : 60, d ? 110 : 560, d ? 60 : 120, d ? "#e8e4cf" : "#ffe9a0"));
};

const savannaScene = (d) => {
  const P = d
    ? { sky: [[0, "#120e24"], [0.45, "#3a1f36"], [0.7, "#a2442a"], [1, "#e8842e"]], d1: "#4a2a2c", d2: "#3a1e24", d3: "#2a1620", grass: "#5a2c18", tree: "#120c14", sun: "#ffd98a", haze: "#8a3a2a" }
    : { sky: [[0, "#e9d6a4"], [0.45, "#f5d594"], [0.7, "#f7c46a"], [1, "#f1a948"]], d1: "#e2b062", d2: "#d99b4a", d3: "#c78232", grass: "#b87a2a", tree: "#6a4a1e", sun: "#fff3c0", haze: "#fbe2a0" };
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (d) b += stars(40, 31, 330, "#ffd7a8", 0.9);
  b += circle(268, 468, 110, "url(#glow)") + circle(268, 470, 30, P.sun);
  for (const [x, y, s] of [[10, 190, 1.3], [250, 120, 1.1], [150, 330, 1.5]]) b += cloud(x, y, s, d ? "#5a2c3a" : "#fff0cc", d ? 0.55 : 0.7);
  b += `<rect y="478" width="${W}" height="16" fill="${P.haze}" opacity="0.5"/>`;
  b += hill([[0, 506], [130, 490], [280, 504], [400, 488]], P.d1);
  // далёкие акации
  for (const [x, y, s] of [[60, 510, 0.5], [180, 506, 0.42], [330, 508, 0.55]]) b += `<g fill="${P.tree}"><rect x="${x - 1}" y="${y - 10 * s * 2}" width="2" height="${20 * s}"/>${ellipse(x, y - 22 * s, 28 * s, 6 * s, P.tree)}</g>`;
  b += hill([[0, 560], [110, 540], [250, 566], [400, 538]], P.d2);
  b += hill([[0, 630], [140, 596], [300, 628], [400, 604]], P.d3);
  // большая акация
  b += `<g fill="${P.tree}"><path d="M40,720 C48,664 60,640 78,612 C90,596 104,590 112,584 L116,590 C106,598 96,606 90,620 C80,640 72,672 66,720Z"/>${ellipse(110, 576, 92, 14, P.tree)}${ellipse(176, 590, 54, 10, P.tree)}${ellipse(54, 596, 44, 9, P.tree)}${ellipse(128, 560, 52, 9, P.tree)}</g>`;
  b += hill([[0, 724], [120, 700], [280, 722], [400, 704]], P.grass);
  const r = rng(9);
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = 700 + r() * 100;
    b += `<path d="M${f(x)},${f(y)} q${f(r() * 6 - 3)},-9 ${f(r() * 8 - 4)},-${f(10 + r() * 8)}" stroke="${d ? "#8a4a1c" : "#8f5a1a"}" stroke-width="1.3" fill="none" opacity="0.6"/>`;
  }
  return svg(b, skyDefs("sky", P.sky) + sunGlow("glow", 268, 468, 110, d ? "#ffb25a" : "#ffe9a0"));
};

const vineyardScene = (d) => {
  const P = d
    ? { sky: [[0, "#14123a"], [0.45, "#3b2a5a"], [0.68, "#b6483a"], [1, "#f08a3a"]], far: "#2a2650", mid: "#1f2442", row1: "#1d3a24", row2: "#16301f", row3: "#102719", cyp: "#0e2216", villa: "#2c2a48", win: "#ffd27a", leaf: "#2f5a2a", leaf2: "#3b6e32", grape: "#3a2a6a", grape2: "#54409a" }
    : { sky: [[0, "#f6d9a4"], [0.5, "#f8c98a"], [0.75, "#f6b878"], [1, "#f4a468"]], far: "#d8a878", mid: "#b8a060", row1: "#9cbf5a", row2: "#86ab48", row3: "#6f9638", cyp: "#4a6e2e", villa: "#e6cf9c", win: "#8a6a48", leaf: "#7fae3e", leaf2: "#a4c84e", grape: "#b8c860", grape2: "#d4e07a" };
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (d) b += stars(35, 41, 300, "#fff", 0.9) + `<path d="M268,150 a22,22 0 1 0 0,44 a17,17 0 1 1 0,-44Z" fill="#efe9cf"/>`;
  else b += circle(220, 478, 70, "url(#glow)") + circle(220, 480, 16, "#fff3c0");
  for (const [x, y, s] of [[90, 330, 1.2], [230, 430, 1.4], [-20, 520, 1]]) b += cloud(x, y, s, d ? "#7a3a58" : "#fff0d8", d ? 0.5 : 0.6);
  b += hill([[0, 510], [140, 494], [280, 512], [400, 496]], P.far);
  b += hill([[0, 540], [150, 524], [300, 542], [400, 526]], P.mid);
  b += `<g><rect x="108" y="504" width="64" height="24" fill="${P.villa}"/><rect x="132" y="490" width="16" height="16" fill="${P.villa}"/>${[116, 128, 140, 152, 162].map((x) => `<rect x="${x}" y="514" width="3.6" height="6" fill="${P.win}"/>`).join("")}</g>`;
  for (const x of [20, 236, 262, 360, 380]) b += cypress(x, 560, 1, P.cyp);
  // ряды лозы
  const rows = [[560, P.row1, 0.5], [600, P.row2, 0.8], [650, P.row3, 1.15]];
  for (const [y, c, s] of rows) {
    b += hill([[0, y], [130, y - 14 * s], [270, y + 4 * s], [400, y - 12 * s]], c);
    for (let k = 0; k < 6; k++) b += `<path d="M0,${f(y + 8 * s + k * 7 * s)} Q200,${f(y - 6 * s + k * 7 * s)} 400,${f(y + 6 * s + k * 7 * s)}" stroke="${d ? "#0c2014" : "#587a2c"}" stroke-width="${f(1.4 * s)}" fill="none" opacity="0.5"/>`;
  }
  b += hill([[0, 730], [140, 714], [280, 732], [400, 716]], d ? "#0c1d12" : "#5a8a2e");
  const r = rng(13);
  for (let i = 0; i < 70; i++) b += circle(r() * W, 600 + r() * 190, 1.6 + r() * 2.4, r() > 0.5 ? P.leaf : P.leaf2, ` opacity="${f(0.55 + r() * 0.45)}"`);
  // ветка с гроздьями в верхнем углу
  b += `<path d="M-10,40 C80,30 150,60 210,26" stroke="${d ? "#3a2a1c" : "#6a4a2a"}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  for (const [x, y, s, c] of [[40, 70, 1.5, P.leaf], [96, 54, 1.2, P.leaf2], [150, 70, 1.5, P.leaf], [190, 44, 1.1, P.leaf2], [22, 28, 1, P.leaf2]])
    b += `<path d="M${x},${y - 14 * s} L${x + 12 * s},${y - 4 * s} L${x + 10 * s},${y + 8 * s} L${x},${y + 14 * s} L${x - 10 * s},${y + 8 * s} L${x - 12 * s},${y - 4 * s}Z" fill="${c}" opacity="0.95"/>`;
  for (const [x, y] of [[62, 104], [140, 108]]) {
    for (let i = 0; i < 12; i++) {
      const gx = x + ((i % 3) - 1) * 9 + (Math.floor(i / 3) % 2) * 3;
      const gy = y + Math.floor(i / 3) * 8;
      b += circle(gx, gy, 5.4, i % 2 ? P.grape : P.grape2);
    }
  }
  return svg(b, skyDefs("sky", P.sky) + sunGlow("glow", 220, 478, 70, d ? "#ffb25a" : "#ffe9a0"));
};

const bethlehemScene = (d) => {
  const P = d
    ? { sky: [[0, "#04081a"], [0.55, "#0e1a3e"], [0.85, "#1c2850"], [1, "#2a3a60"]], cloud: "#1a2548", hill: "#3a3228", hill2: "#2a251f", house: "#7a6a4a", house2: "#5e5038", win: "#ffc766", tree: "#2a3a2a", trunk: "#2a2018", ground: "#1c1a16", star: "#ffd98a" }
    : { sky: [[0, "#7f8fc2"], [0.5, "#c6b6d4"], [0.8, "#f2c9a0"], [1, "#f7d9a8"]], cloud: "#f3d4c0", hill: "#d8b98a", hill2: "#c4a070", house: "#f0dcb4", house2: "#e0c690", win: "#e8a24a", tree: "#7a8e4e", trunk: "#6a4a2a", ground: "#b88e5a", star: "#fff1c4" };
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  b += stars(d ? 120 : 36, 51, 560, "#fff", 1.1);
  // мягкий млечный путь
  if (d) b += `<path d="M280,0 C320,160 250,300 360,430" stroke="#5a6aa8" stroke-width="46" fill="none" opacity="0.18" stroke-linecap="round"/>`;
  // большая звезда
  const sx = 232;
  const sy = 236;
  b += circle(sx, sy, 90, "url(#glow)");
  b += `<path d="M${sx},${sy - 120} L${sx + 4},${sy - 12} L${sx},${sy + 150} L${sx - 4},${sy - 12}Z" fill="${P.star}" opacity="0.85"/><path d="M${sx - 100},${sy} L${sx - 10},${sy - 3} L${sx + 100},${sy} L${sx - 10},${sy + 3}Z" fill="${P.star}" opacity="0.85"/>`;
  b += `<path d="M${sx},${sy - 40} L${sx + 8},${sy - 8} L${sx + 40},${sy} L${sx + 8},${sy + 8} L${sx},${sy + 40} L${sx - 8},${sy + 8} L${sx - 40},${sy} L${sx - 8},${sy - 8}Z" fill="${P.star}"/>`;
  b += `<path d="M${sx - 26},${sy - 26} L${sx + 26},${sy + 26} M${sx + 26},${sy - 26} L${sx - 26},${sy + 26}" stroke="${P.star}" stroke-width="1.6" opacity="0.7"/>`;
  b += cloud(-10, 400, 1.7, P.cloud, 0.9) + cloud(210, 470, 1.4, P.cloud, 0.85) + cloud(40, 560, 1.2, P.cloud, 0.7);
  b += hill([[0, 600], [140, 582], [300, 602], [400, 588]], P.hill);
  // городок
  let town = "";
  const blocks = [[200, 580, 40, 28], [244, 572, 34, 36], [282, 580, 42, 28], [326, 574, 36, 32], [168, 590, 30, 22], [358, 586, 42, 24]];
  for (const [x, y, w, h] of blocks) {
    town += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${P.house}"/>`;
    for (let k = 0; k < Math.floor(w / 13); k++) town += `<rect x="${x + 5 + k * 11}" y="${y + 8}" width="4.4" height="6.6" fill="${P.win}"${d ? "" : ' opacity="0.7"'}/>`;
  }
  town += `<path d="M256,572 a12,12 0 0 1 22,0Z" fill="${P.house2}"/>`;
  b += town;
  b += hill([[0, 640], [150, 622], [300, 644], [400, 626]], P.hill2);
  // дорога
  b += `<path d="M330,800 C300,720 250,700 180,690 C130,683 90,664 60,640 L96,640 C130,664 170,676 220,682 C290,692 336,716 372,800Z" fill="${d ? "#2e2820" : "#e4c494"}" opacity="0.9"/>`;
  // олива слева
  b += `<g><path d="M30,780 C34,720 48,690 52,650 L66,652 C62,690 56,720 60,780Z" fill="${P.trunk}"/>${[[40, 640, 34], [74, 626, 30], [18, 672, 28], [88, 662, 26], [54, 604, 24]].map(([x, y, r]) => ellipse(x, y, r * 1.2, r * 0.8, P.tree)).join("")}</g>`;
  b += hill([[0, 740], [140, 716], [300, 742], [400, 722]], P.ground);
  const r = rng(17);
  for (let i = 0; i < 40; i++) b += ellipse(r() * W, 730 + r() * 70, 6 + r() * 18, 3 + r() * 5, d ? "#14110d" : "#a0784a", ` opacity="${f(0.4 + r() * 0.4)}"`);
  return svg(b, skyDefs("sky", P.sky) + sunGlow("glow", sx, sy, 90, d ? "#ffd98a" : "#fff3c4"));
};

const rainbowScene = (d) => {
  const P = d
    ? { sky: [[0, "#10142c"], [0.4, "#2a2a52"], [0.7, "#7a3a44"], [1, "#e8803a"]], cloud: "#3a2e50", far: "#2a2a48", hill: "#1c2e1e", hill2: "#14241a", water: "#6a4a5a", flower: "#cfc8a8", fence: "#4a3a2a", rainbowOp: 0.55 }
    : { sky: [[0, "#8ec2ec"], [0.45, "#cbe2f4"], [0.75, "#f8e6c8"], [1, "#f6d6a0"]], cloud: "#ffffff", far: "#c6d6a8", hill: "#8dba6a", hill2: "#76a852", water: "#cfe6f0", flower: "#fff6dc", fence: "#9a7a4e", rainbowOp: 0.6 };
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (d) b += stars(30, 61, 220, "#fff", 0.9);
  const cols = ["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#b197fc"];
  for (let i = 0; i < cols.length; i++) b += `<path d="M${-30 + i * 6},560 C${40 + i * 6},${230 + i * 6} ${290 - i * 6},${190 + i * 6} ${470 - i * 6},${440 + i * 8}" stroke="${cols[i]}" stroke-width="9" fill="none" opacity="${P.rainbowOp}"/>`;
  for (const [x, y, s] of [[20, 120, 1.3], [250, 180, 1], [120, 400, 1.6], [270, 470, 1.2]]) b += cloud(x, y, s, P.cloud, d ? 0.6 : 0.9);
  b += circle(200, 548, 90, "url(#glow)");
  b += hill([[0, 572], [150, 554], [300, 574], [400, 556]], P.far);
  b += hill([[0, 600], [140, 582], [290, 604], [400, 586]], P.hill);
  b += `<ellipse cx="204" cy="598" rx="120" ry="9" fill="${P.water}" opacity="0.6"/>`;
  b += hill([[0, 650], [140, 628], [290, 650], [400, 632]], P.hill2);
  b += `<g stroke="${P.fence}" stroke-width="3.4" stroke-linecap="round"><path d="M0,640 H70 M0,652 H70"/><path d="M22,630 v40 M58,632 v40" stroke-width="5"/></g>`;
  // лужа с отражением
  b += `<path d="M150,740 C190,722 280,724 340,740 C310,770 200,776 150,740Z" fill="${d ? "#5a3a50" : "#bcdcea"}" opacity="0.85"/>`;
  for (let i = 0; i < cols.length; i++) b += `<path d="M${200 + i * 5},742 q40,-8 ${80 - i * 3},0" stroke="${cols[i]}" stroke-width="2.2" fill="none" opacity="0.55"/>`;
  b += hill([[0, 770], [120, 750], [280, 772], [400, 752]], d ? "#0e1d14" : "#6a9a4c");
  const r = rng(23);
  for (let i = 0; i < 60; i++) b += circle(r() * W, 720 + r() * 80, 1.3 + r() * 2, r() > 0.7 ? (d ? "#e8c860" : "#ffd24a") : P.flower, ` opacity="${f(0.55 + r() * 0.45)}"`);
  return svg(b, skyDefs("sky", P.sky) + sunGlow("glow", 200, 548, 90, d ? "#ff9a4a" : "#fff0b0"));
};

/** Плитка-узор (повторяется): оливковые ветки. */
const oliveTile = (d) => {
  const P = d
    ? { bg: "#1d2118", leaf: "#4a5a3a", leaf2: "#657a4c", olive: "#6a7a34", stem: "#9a8350", dot: "#c9a24a" }
    : { bg: "#f1e8d4", leaf: "#8aa070", leaf2: "#6a8452", olive: "#8f9a46", stem: "#b99a58", dot: "#d9b050" };
  const T = 300;
  const branch = (x, y, rot, s) => {
    let g = `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0,0 C30,-10 60,-8 96,-22" stroke="${P.stem}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i < 5; i++) {
      const px = 12 + i * 17;
      const py = -3 - i * 4.4;
      g += `<ellipse cx="${px}" cy="${py - 9}" rx="4.4" ry="12" transform="rotate(-24 ${px} ${py})" fill="${i % 2 ? P.leaf : P.leaf2}"/><ellipse cx="${px + 3}" cy="${py + 9}" rx="4.4" ry="12" transform="rotate(24 ${px} ${py})" fill="${i % 2 ? P.leaf2 : P.leaf}"/>`;
    }
    g += `<ellipse cx="38" cy="3" rx="5.2" ry="7" fill="${P.olive}"/><ellipse cx="58" cy="-2" rx="4.8" ry="6.6" fill="${P.olive}"/></g>`;
    return g;
  };
  let b = `<rect width="${T}" height="${T}" fill="${P.bg}"/>`;
  b += branch(24, 80, -12, 1) + branch(170, 150, 168, 0.9) + branch(60, 250, 14, 0.85) + branch(214, 262, 188, 0.8);
  const r = rng(71);
  for (let i = 0; i < 12; i++) b += circle(10 + r() * 280, 10 + r() * 280, 1.1 + r() * 1.2, P.dot, ' opacity="0.7"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${T}" height="${T}">${b}</svg>\n`;
};

/** Плитка-узор: волны в стиле «Рыбы» (золотые линии на воде, редкий знак ихтис). */
const wavesTile = (d) => {
  const P = d
    ? { bg: "#0f2433", w: ["#1a3d52", "#1f4a60", "#265668"], line: "#c9a24a", foam: "#9fb6c4" }
    : { bg: "#e4f1ee", w: ["#bfe0da", "#a8d4cc", "#92c6bf"], line: "#c8a04a", foam: "#ffffff" };
  const TW = 360;
  const TH = 240;
  let b = `<rect width="${TW}" height="${TH}" fill="${P.bg}"/>`;
  const wave = (y, amp, fill, ph) => {
    let dd = `M0,${y}`;
    for (let k = 0; k < 2; k++) dd += ` C${k * 180 + 45},${y - amp + ph} ${k * 180 + 135},${y + amp - ph} ${k * 180 + 180},${y}`;
    return `<path d="${dd} L${TW},${TH} L0,${TH}Z" fill="${fill}"/>`;
  };
  b += wave(90, 18, P.w[0], 0) + wave(130, 16, P.w[1], 3) + wave(176, 14, P.w[2], 6);
  const line = (y, amp) => {
    let dd = `M0,${y}`;
    for (let k = 0; k < 2; k++) dd += ` C${k * 180 + 45},${y - amp} ${k * 180 + 135},${y + amp} ${k * 180 + 180},${y}`;
    return `<path d="${dd}" fill="none" stroke="${P.line}" stroke-width="1.3" opacity="0.7"/>`;
  };
  b += line(90, 18) + line(130, 16) + line(176, 14);
  // пена
  b += `<path d="M30,92 h20 M210,92 h26 M100,132 h22 M262,134 h18" stroke="${P.foam}" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>`;
  // ихтис
  b += `<g opacity="0.8" fill="none" stroke="${P.line}" stroke-width="1.6" stroke-linecap="round"><path d="M268,34 C290,18 316,18 336,36 C316,54 290,54 268,34Z"/><path d="M268,34 C290,54 316,54 336,36" opacity="0"/><path d="M336,36 L350,24 M336,36 L350,48"/></g>`;
  b += `<g fill="${P.line}" opacity="0.5">${[[40, 200], [120, 214], [300, 206], [200, 224]].map(([x, y]) => circle(x, y, 1.6, P.line)).join("")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TW} ${TH}" width="${TW}" height="${TH}">${b}</svg>\n`;
};

const scenes = {
  pasture: pastureScene,
  sky: skyScene,
  savanna: savannaScene,
  vineyard: vineyardScene,
  bethlehem: bethlehemScene,
  rainbow: rainbowScene,
  olive: oliveTile,
  waves: wavesTile,
};

for (const [id, fn] of Object.entries(scenes)) {
  for (const d of [false, true]) {
    const file = join(OUT, `${id}-${d ? "dark" : "light"}.svg`);
    writeFileSync(file, fn(d));
  }
}
console.log("chat-bg: ok", Object.keys(scenes).length * 2, "files ->", OUT);
