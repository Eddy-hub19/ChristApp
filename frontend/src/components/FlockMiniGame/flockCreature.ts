import type { Skin } from "./flockSkins";
import { drawSpecialBehind, drawSpecialFront } from "./flockSpecialDeco";

const TAU = Math.PI * 2;

// ---------- істоти ----------
export function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

function drawEyes(c: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, color: string, wolf: boolean) {
  const px = -Math.sin(ang);
  const py = Math.cos(ang);
  for (const side of [-1, 1]) {
    const ex = x + Math.cos(ang) * r * 0.12 + px * side * r * 0.2;
    const ey = y + Math.sin(ang) * r * 0.12 + py * side * r * 0.2;
    c.fillStyle = wolf ? color : "#ffffff";
    circle(c, ex, ey, r * (wolf ? 0.11 : 0.13));
    c.fill();
    c.fillStyle = "#16130f";
    circle(c, ex + Math.cos(ang) * r * 0.03, ey + Math.sin(ang) * r * 0.03, r * (wolf ? 0.05 : 0.075));
    c.fill();
    if (!wolf) {
      c.fillStyle = "#fff";
      circle(c, ex + r * 0.025, ey - r * 0.03, r * 0.025);
      c.fill();
    }
  }
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, inner = 0.45) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/** Прикраси платних скінів: малюються поверх базового вигляду, в тих самих координатах. */
function drawDeco(c: CanvasRenderingContext2D, skin: Skin, r: number, ang: number) {
  const fwdX = Math.cos(ang);
  const fwdY = Math.sin(ang);
  switch (skin.deco) {
    case "wreath": {
      // вінок із квітів по краю голови
      const colors = ["#f48fb1", "#fff176", "#ffffff", "#ce93d8", "#ffab91"];
      const n = 10;
      for (let i = 0; i < n; i++) {
        // дуга над мордочкою: від -1.25 до +1.25 рад відносно напряму погляду
        const a = ang + (i / (n - 1) - 0.5) * 3.1;
        const px = Math.cos(a) * r * 0.8;
        const py = Math.sin(a) * r * 0.8;
        c.fillStyle = "#4caf50";
        circle(c, px - Math.cos(a) * r * 0.04, py - Math.sin(a) * r * 0.04, r * 0.12);
        c.fill();
        c.fillStyle = colors[i % colors.length];
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * TAU;
          circle(c, px + Math.cos(pa) * r * 0.08, py + Math.sin(pa) * r * 0.08, r * 0.06);
          c.fill();
        }
        c.fillStyle = "#ffca28";
        circle(c, px, py, r * 0.045);
        c.fill();
      }
      break;
    }
    case "bell": {
      // червоний нашийник і золотий дзвіночок
      c.strokeStyle = "#d32f2f";
      c.lineWidth = Math.max(2, r * 0.1);
      c.lineCap = "round";
      c.beginPath();
      c.arc(0, 0, r * 0.78, ang - 0.95, ang + 0.95);
      c.stroke();
      const bx = fwdX * r * 0.78;
      const by = fwdY * r * 0.78;
      c.fillStyle = "#ffca28";
      circle(c, bx, by, r * 0.15);
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.3)";
      c.lineWidth = Math.max(1, r * 0.03);
      c.stroke();
      c.fillStyle = "#fff8c4";
      circle(c, bx - r * 0.04, by - r * 0.04, r * 0.045);
      c.fill();
      c.fillStyle = "#6d4c00";
      circle(c, bx + fwdX * r * 0.02, by + fwdY * r * 0.02 + r * 0.05, r * 0.03);
      c.fill();
      break;
    }
    case "cloud": {
      // додаткові пухнасті "хмаринки" й рум'янець
      c.fillStyle = "#ffffff";
      c.globalAlpha = 0.9;
      for (const [dx, dy, rr] of [
        [-0.55, -0.55, 0.3],
        [0.1, -0.85, 0.26],
        [-0.9, 0.1, 0.27],
        [-0.5, 0.65, 0.28],
      ] as const) {
        circle(c, dx * r, dy * r, rr * r);
        c.fill();
      }
      c.globalAlpha = 0.55;
      c.fillStyle = skin.accent;
      for (const side of [-1, 1]) {
        circle(c, fwdX * r * 0.4 - Math.sin(ang) * side * r * 0.3, fwdY * r * 0.4 + Math.cos(ang) * side * r * 0.3, r * 0.1);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
    }
    case "gold": {
      // блиски "золотого руна"
      c.fillStyle = "#ffffff";
      for (const [dx, dy, rr] of [
        [-0.45, -0.5, 0.17],
        [0.35, -0.7, 0.12],
        [-0.8, 0.25, 0.1],
      ] as const) {
        star(c, dx * r, dy * r, rr * r, 4, 0.3);
        c.globalAlpha = 0.95;
        c.fill();
      }
      c.globalAlpha = 1;
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = Math.max(1, r * 0.05);
      circle(c, 0, 0, r * 0.84);
      c.stroke();
      break;
    }
    case "wolfwool": {
      // вовняна "шкура" на спині, морда й вуха вовка визирають спереду
      c.fillStyle = skin.wool ?? "#f6f1e7";
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = ang + Math.PI * 0.72 + (i / (n - 1)) * (Math.PI * 2 - Math.PI * 1.44);
        circle(c, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * 0.32);
        c.fill();
      }
      circle(c, -fwdX * r * 0.45, -fwdY * r * 0.45, r * 0.5);
      c.fill();
      // клички
      c.fillStyle = "#ffffff";
      for (const side of [-1, 1]) {
        const ox = fwdX * r * 0.72 - Math.sin(ang) * side * r * 0.1;
        const oy = fwdY * r * 0.72 + Math.cos(ang) * side * r * 0.1;
        c.beginPath();
        c.moveTo(ox - Math.sin(ang) * side * r * 0.035, oy + Math.cos(ang) * side * r * 0.035);
        c.lineTo(ox + fwdX * r * 0.1, oy + fwdY * r * 0.1);
        c.lineTo(ox + Math.sin(ang) * side * r * 0.035, oy - Math.cos(ang) * side * r * 0.035);
        c.closePath();
        c.fill();
      }
      break;
    }
    case "angel": {
      // німб: золоте кільце над мордочкою (світіння - в анімованому шарі)
      const hx = fwdX * r * 0.5;
      const hy = fwdY * r * 0.5;
      c.strokeStyle = "#ffd54a";
      c.lineWidth = Math.max(2, r * 0.07);
      circle(c, hx, hy, r * 0.46);
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.7)";
      c.lineWidth = Math.max(1, r * 0.025);
      circle(c, hx, hy, r * 0.46);
      c.stroke();
      break;
    }
    case "frost": {
      // іній: крижаний обідок, білі крапки й кілька кристалів
      c.strokeStyle = "rgba(190,230,255,0.75)";
      c.lineWidth = Math.max(1.5, r * 0.06);
      circle(c, 0, 0, r * 0.86);
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.9)";
      for (const [dx, dy, rr] of [
        [-0.5, -0.55, 0.05],
        [0.05, -0.8, 0.04],
        [-0.85, 0.05, 0.05],
        [-0.45, 0.62, 0.04],
        [0.25, 0.72, 0.05],
        [-0.15, -0.3, 0.035],
      ] as const) {
        circle(c, dx * r, dy * r, rr * r);
        c.fill();
      }
      c.fillStyle = "#ffffff";
      for (const [dx, dy, rr] of [
        [-0.35, -0.6, 0.14],
        [-0.75, 0.35, 0.11],
      ] as const) {
        star(c, dx * r, dy * r, rr * r, 4, 0.28);
        c.fill();
      }
      break;
    }
    case "sun": {
      // золоті закручені роги: світлий відблиск уздовж дуг
      c.strokeStyle = "#ffe9a0";
      c.lineWidth = Math.max(1, r * 0.05);
      c.lineCap = "round";
      for (const side of [-1, 1]) {
        const a = ang + side * 1.55;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.31, a - 1.6, a + 3.9);
        c.stroke();
      }
      break;
    }
    case "david": {
      // туніка на спині, пасок і шнурок
      c.fillStyle = "#c9a26b";
      c.beginPath();
      c.arc(0, 0, r * 0.8, ang + Math.PI * 0.52, ang + Math.PI * 1.48);
      c.closePath();
      c.fill();
      c.strokeStyle = "#7a5530";
      c.lineWidth = Math.max(1.5, r * 0.07);
      c.lineCap = "round";
      const px = -Math.sin(ang);
      const py = Math.cos(ang);
      c.beginPath();
      c.moveTo(-fwdX * r * 0.12 + px * r * 0.74, -fwdY * r * 0.12 + py * r * 0.74);
      c.lineTo(-fwdX * r * 0.12 - px * r * 0.74, -fwdY * r * 0.12 - py * r * 0.74);
      c.stroke();
      c.fillStyle = "#e6c88f";
      for (const k of [-0.4, 0, 0.4]) {
        circle(c, -fwdX * r * 0.5 + px * k * r, -fwdY * r * 0.5 + py * k * r, r * 0.05);
        c.fill();
      }
      break;
    }
    case "polar": {
      // блакитний контур і внутрішні вушка, щоб білий вовк не зливався з фоном
      c.strokeStyle = "rgba(110,180,235,0.7)";
      c.lineWidth = Math.max(1.5, r * 0.06);
      circle(c, 0, 0, r * 0.95);
      c.stroke();
      c.fillStyle = "#9fc4e6";
      for (const side of [-1, 1]) {
        const a = ang + side * 1.05;
        const ex = Math.cos(a) * r * 0.72;
        const ey = Math.sin(a) * r * 0.72;
        c.beginPath();
        c.moveTo(ex + Math.cos(a + side * 0.9) * r * 0.16, ey + Math.sin(a + side * 0.9) * r * 0.16);
        c.lineTo(ex + Math.cos(a - side * 0.9) * r * 0.16, ey + Math.sin(a - side * 0.9) * r * 0.16);
        c.lineTo(Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0);
        c.closePath();
        c.fill();
      }
      // морозні цятки на білому хутрі
      c.fillStyle = "rgba(150,205,240,0.55)";
      for (const [dx, dy, rr] of [
        [-0.5, -0.4, 0.07],
        [-0.3, 0.5, 0.06],
        [-0.75, 0.05, 0.05],
        [0.0, -0.7, 0.05],
      ] as const) {
        circle(c, dx * r, dy * r, rr * r);
        c.fill();
      }
      break;
    }
    case "alpha": {
      // «Вожак»: золотое кольцо по краю (заметен издалека) и корона на макушке
      c.strokeStyle = "#f2b61c";
      c.lineWidth = Math.max(1.5, r * 0.09);
      circle(c, 0, 0, r * 0.96);
      c.stroke();
      const cx = -fwdX * r * 0.3;
      const cy = -fwdY * r * 0.3;
      c.fillStyle = "#f2b61c";
      c.strokeStyle = "rgba(60,30,0,0.55)";
      c.lineWidth = Math.max(1, r * 0.04);
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = ang + (i * Math.PI) / 5;
        const rr = r * (i % 2 === 0 ? 0.36 : 0.23);
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#e0142f";
      circle(c, cx, cy, r * 0.1);
      c.fill();
      c.fillStyle = "#ffe27a";
      circle(c, cx - r * 0.03, cy - r * 0.03, r * 0.03);
      c.fill();
      break;
    }
    case "stars": {
      c.fillStyle = skin.accent;
      for (const [dx, dy, rr] of [
        [-0.4, -0.45, 0.22],
        [0.15, -0.8, 0.15],
        [-0.8, 0.1, 0.18],
        [-0.35, 0.6, 0.16],
        [0.3, 0.7, 0.11],
      ] as const) {
        star(c, dx * r, dy * r, rr * r);
        c.fill();
      }
      // півмісяць на лобі
      c.fillStyle = "#fff3b0";
      c.beginPath();
      c.arc(fwdX * r * 0.05 - Math.sin(ang) * r * 0.5, fwdY * r * 0.05 + Math.cos(ang) * r * 0.5, r * 0.11, 0, TAU);
      c.fill();
      c.fillStyle = skin.fur;
      c.beginPath();
      c.arc(fwdX * r * 0.05 - Math.sin(ang) * r * 0.5 + r * 0.05, fwdY * r * 0.05 + Math.cos(ang) * r * 0.5 - r * 0.02, r * 0.1, 0, TAU);
      c.fill();
      break;
    }
  }
}


/** Пастельна веселка: кільце з 6 кольорів, t - частка обороту (кільце замкнене). Повертає rgb(r,g,b). */
const PASTEL = [
  [255, 179, 198],
  [255, 207, 163],
  [255, 241, 160],
  [191, 240, 192],
  [165, 227, 255],
  [210, 184, 255],
];
function pastel(t: number): string {
  const x = (((t % 1) + 1) % 1) * PASTEL.length;
  const i = Math.floor(x);
  const f = x - i;
  const a = PASTEL[i % PASTEL.length];
  const b = PASTEL[(i + 1) % PASTEL.length];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
/** rgb(...)/#hex -> rgba(...) із заданою прозорістю. */
function rgbaOf(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`);
}

/** Крапля-полум'я з основою в (x, y), довжиною len, шириною w у напрямку ang; hot - тришарове (червоне, помаранчеве, жовте). */
function flame(c: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, ang: number, hot: boolean) {
  const layers: [number, string][] = hot
    ? [
        [1, "#ff4d2e"],
        [0.72, "#ff9a2e"],
        [0.42, "#ffe066"],
      ]
    : [[1, "#ff9a2e"]];
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  for (const [k, col] of layers) {
    c.fillStyle = col;
    c.globalAlpha = 0.92;
    c.beginPath();
    c.moveTo(0, -w * 0.5 * k);
    c.quadraticCurveTo(len * 0.55 * k, -w * 0.55 * k, len * k, 0);
    c.quadraticCurveTo(len * 0.55 * k, w * 0.55 * k, 0, w * 0.5 * k);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** Шари анімації преміум-скінів: бітова маска (позаду тіла / поверх нього). */
export const LAYER_BEHIND = 1;
export const LAYER_FRONT = 2;

const ANIM_LAYERS: Partial<Record<NonNullable<Skin["deco"]>, number>> = {
  angel: LAYER_BEHIND | LAYER_FRONT,
  // вся вовна райдужної малюється шаром ПОЗАДУ мордочки (тіло без вовни, див. drawCreature)
  rainbow: LAYER_BEHIND,
  phoenix: LAYER_BEHIND | LAYER_FRONT,
  moon: LAYER_FRONT,
  bloom: LAYER_FRONT,
  newyear: LAYER_FRONT,
  butterfly: LAYER_BEHIND | LAYER_FRONT,
  thunder: LAYER_FRONT,
  frost: LAYER_FRONT,
  sun: LAYER_BEHIND,
  david: LAYER_FRONT,
  polar: LAYER_FRONT,
};

/** Які шари має скін (0 - без анімації). */
export function animLayers(skin: Skin): number {
  return skin.anim && skin.deco ? (ANIM_LAYERS[skin.deco] ?? 0) : 0;
}

/**
 * Половина стороны спрайта слоя в радиусах тела: ровно по содержимому слоя, без прозрачных полей -
 * заливка больших полупрозрачных спрайтов - главная цена анимации на слабых телефонах.
 */
export function layerExtent(skin: Skin, layer: number): number {
  switch (skin.deco) {
    case "angel":
      return layer === LAYER_BEHIND ? 1.68 : 1.06;
    case "rainbow":
      return 1.34;
    case "phoenix":
      return layer === LAYER_BEHIND ? 2.05 : 1.45;
    case "moon":
      return 1.4;
    case "bloom":
      return 1.38;
    case "newyear":
      return 1.34;
    case "butterfly":
      return layer === LAYER_BEHIND ? 1.95 : 1.3;
    case "thunder":
      return 1.55;
    case "frost":
      return 1.3;
    case "sun":
      return 1.5;
    case "david":
      return 1.42;
    case "polar":
      return 0.56;
    default:
      return 1.5;
  }
}

/**
 * Один кадр анімованого шару в ЛОКАЛЬНИХ координатах (мордочка дивиться в +x, центр у нуль): шар кешується
 * у спрайт без урахування кута й повертається при малюванні. Радіальні градієнти допустимі - шар
 * малюється один раз, а не на кадр.
 */
export function drawAnimLayer(c: CanvasRenderingContext2D, skin: Skin, r: number, frame: number, layer: number) {
  const n = skin.anim?.frames ?? 1;
  const k = ((frame % n) + n) % n;
  c.save();
  switch (skin.deco) {
    case "angel": {
      if (layer === LAYER_BEHIND) {
        // крильця махають: розмах і кут змінюються між кадрами
        const spread = [0.8, 1, 1.12, 1][k % 4];
        for (const side of [-1, 1]) {
          const sx = -r * 0.15;
          const sy = side * r * 0.82;
          for (let f = 0; f < 3; f++) {
            const phi = side * (Math.PI / 2 + 0.3 + f * 0.32) - side * 0.3 * (spread - 1);
            const len = r * (0.78 - f * 0.14) * spread;
            c.fillStyle = "#ffffff";
            c.strokeStyle = "rgba(160,170,190,0.65)";
            c.lineWidth = Math.max(1, r * 0.03);
            c.beginPath();
            c.ellipse(sx + Math.cos(phi) * len * 0.5, sy + Math.sin(phi) * len * 0.5, len * 0.5, r * 0.17, phi, 0, TAU);
            c.fill();
            c.stroke();
          }
        }
      } else {
        // світіння німба пульсує
        const a = [0.25, 0.5, 0.75, 0.5][k % 4];
        c.strokeStyle = `rgba(255,243,160,${a})`;
        c.lineWidth = Math.max(2, r * 0.13);
        circle(c, r * 0.5, 0, r * 0.46);
        c.stroke();
      }
      break;
    }
    case "rainbow": {
      // ВСЯ вовна (11 "хмаринок" і серцевина) плавно перетікає пастельними кольорами веселки з легким світінням.
      // Колір хмаринки = точка на кільці палітри; кадр зсуває кільце на 1/n обороту, цикл безшовний.
      const bumps = 11;
      const turn = k / n;
      const glow = c.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.32);
      glow.addColorStop(0, rgbaOf(pastel(turn + 0.25), 0.4));
      glow.addColorStop(1, rgbaOf(pastel(turn + 0.25), 0));
      c.fillStyle = glow;
      circle(c, 0, 0, r * 1.32);
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.16)";
      circle(c, r * 0.05, r * 0.07, r * 0.98);
      c.fill();
      for (let i = 0; i < bumps; i++) {
        const a = (i / bumps) * TAU + 0.2;
        c.fillStyle = pastel(i / bumps + turn);
        circle(c, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, r * 0.27);
        c.fill();
      }
      const core = c.createRadialGradient(-r * 0.2, -r * 0.25, 0, 0, 0, r * 0.84);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(1, pastel(turn + 0.5));
      c.fillStyle = core;
      circle(c, 0, 0, r * 0.82);
      c.fill();
      c.fillStyle = "#ffffff";
      c.globalAlpha = 0.5;
      circle(c, -r * 0.2, -r * 0.25, r * 0.45);
      c.fill();
      break;
    }
    case "phoenix": {
      const flick = [1, 1.14, 0.92, 1.07];
      if (layer === LAYER_BEHIND) {
        // полум'яні крильця: три пера з кожного боку, довжина мерехтить між кадрами
        for (const side of [-1, 1]) {
          for (let f = 0; f < 3; f++) {
            const phi = side * (Math.PI / 2 + 0.35 + f * 0.42);
            const len = r * (1.0 - f * 0.13) * flick[(k + f + (side > 0 ? 1 : 0)) % 4];
            flame(c, -r * 0.1, side * r * 0.78, len, r * 0.34, phi, true);
          }
        }
        // хвіст-язик позаду
        flame(c, -r * 0.88, 0, r * 0.62 * flick[(k + 2) % 4], r * 0.26, Math.PI, true);
      } else {
        // іскри над крильцями (різні для кожного кадру)
        const sp: [number, number][][] = [
          [[-0.2, -1.1], [0.1, 1.15], [-0.7, 1.0]],
          [[0.3, -1.2], [-0.5, 1.2], [0.0, -0.95]],
          [[-0.6, -1.05], [0.35, 1.05], [-0.2, 1.3]],
          [[0.1, -1.0], [-0.4, 1.1], [0.5, 1.25]],
        ];
        for (const [x, y] of sp[k % 4]) {
          c.fillStyle = "#ffe066";
          circle(c, x * r, y * r, r * 0.05);
          c.fill();
        }
      }
      break;
    }
    case "moon": {
      // золотий півмісяць на боці вовни: коло без меншого кола (evenodd під обрізкою за зовнішнім колом)
      c.save();
      circle(c, -r * 0.2, -r * 0.5, r * 0.34);
      c.clip();
      c.fillStyle = "#ffd95a";
      c.beginPath();
      c.rect(-r * 2, -r * 2, r * 4, r * 4);
      c.arc(-r * 0.06, -r * 0.6, r * 0.29, 0, TAU);
      c.fill("evenodd");
      c.restore();
      c.strokeStyle = "rgba(190,130,20,0.75)";
      c.lineWidth = Math.max(1, r * 0.03);
      c.beginPath();
      c.arc(-r * 0.2, -r * 0.5, r * 0.34, 0.65, TAU - 0.15);
      c.stroke();
      // зірочки мерехтять: розмір і яскравість різні в кожному кадрі
      const ang = [0.75, 2.15, 3.85, 5.3];
      const dist = [1.12, 1.2, 1.08, 1.18];
      const size = [
        [1, 0.45, 0.85, 0.35],
        [0.5, 1, 0.4, 0.8],
        [0.85, 0.4, 1, 0.5],
        [0.35, 0.8, 0.5, 1],
      ];
      for (let i = 0; i < 4; i++) {
        const s = size[i][k % 4];
        c.fillStyle = `rgba(255,246,190,${0.45 + 0.55 * s})`;
        star(c, Math.cos(ang[i]) * r * dist[i], Math.sin(ang[i]) * r * dist[i], r * 0.17 * (0.4 + 0.6 * s), 4, 0.3);
        c.fill();
      }
      break;
    }
    case "bloom": {
      // пелюстки кружляють навколо овечки (6 штук: крок на кадр = 60°/кадрів - цикл безшовний), квітка на голові
      const petal = ["#ffb3c7", "#ffffff", "#ffd1dc", "#fff2a8", "#ffb3c7", "#ffffff"];
      const rot = (k / n) * (TAU / 6);
      for (let i = 0; i < 6; i++) {
        const a = rot + (i * TAU) / 6;
        c.fillStyle = petal[i];
        c.strokeStyle = "rgba(190,100,130,0.45)";
        c.lineWidth = Math.max(1, r * 0.025);
        c.beginPath();
        c.ellipse(Math.cos(a) * r * 1.13, Math.sin(a) * r * 1.13, r * 0.19, r * 0.1, a + Math.PI / 2, 0, TAU);
        c.fill();
        c.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        c.fillStyle = "#f48fb1";
        circle(c, r * 0.05 + Math.cos(a) * r * 0.11, -r * 0.62 + Math.sin(a) * r * 0.11, r * 0.08);
        c.fill();
      }
      c.fillStyle = "#ffe066";
      circle(c, r * 0.05, -r * 0.62, r * 0.065);
      c.fill();
      break;
    }
    case "newyear": {
      // гірлянда по краю вовни (вільна перед мордочкою) блимає по черзі, поруч - сніжинки
      const colors = ["#ff5a5f", "#ffd24a", "#4cd37b", "#58a6ff"];
      c.strokeStyle = "#2f6b45";
      c.lineWidth = Math.max(1.2, r * 0.035);
      c.lineCap = "round";
      c.beginPath();
      c.arc(0, 0, r * 0.9, 0.95, TAU - 0.95);
      c.stroke();
      const cnt = 10;
      for (let i = 0; i < cnt; i++) {
        const a = 0.95 + (i / (cnt - 1)) * (TAU - 1.9);
        const bx = Math.cos(a) * r * 0.9;
        const by = Math.sin(a) * r * 0.9;
        const lit = (i + k) % 2 === 0;
        const col = colors[i % colors.length];
        if (lit) {
          const g = c.createRadialGradient(bx, by, 0, bx, by, r * 0.22);
          g.addColorStop(0, rgbaOf(col, 0.7));
          g.addColorStop(1, rgbaOf(col, 0));
          c.fillStyle = g;
          circle(c, bx, by, r * 0.22);
          c.fill();
        }
        c.fillStyle = col;
        c.globalAlpha = lit ? 1 : 0.5;
        circle(c, bx, by, r * (lit ? 0.075 : 0.06));
        c.fill();
        c.globalAlpha = 1;
      }
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = Math.max(1, r * 0.03);
      const flakes: [number, number][] = [[-0.5, -1.13], [-0.95, 0.65], [0.55, 1.12]];
      for (let i = 0; i < 3; i++) {
        const fr = r * 0.12 * [1, 0.7, 0.9, 0.6][(k + i) % 4];
        const fx = flakes[i][0] * r;
        const fy = flakes[i][1] * r;
        for (let arm = 0; arm < 3; arm++) {
          const aa = (arm * Math.PI) / 3 + k * 0.2;
          c.beginPath();
          c.moveTo(fx - Math.cos(aa) * fr, fy - Math.sin(aa) * fr);
          c.lineTo(fx + Math.cos(aa) * fr, fy + Math.sin(aa) * fr);
          c.stroke();
        }
      }
      break;
    }
    case "butterfly": {
      if (layer === LAYER_BEHIND) {
        // крильця метелика махають: розмах крила між кадрами 1 -> 0.4 -> 1
        const w = [1, 0.72, 0.4, 0.72][k % 4];
        for (const side of [-1, 1]) {
          const y = (v: number) => side * (0.68 + v * w) * r;
          c.lineWidth = Math.max(1, r * 0.03);
          c.strokeStyle = "rgba(70,40,120,0.6)";
          // нижнє (менше) крило
          c.fillStyle = "#5fd6cf";
          c.beginPath();
          c.moveTo(-r * 0.15, y(0.02));
          c.bezierCurveTo(0, y(0.5), -r * 0.5, y(0.98), -r * 0.88, y(0.6));
          c.bezierCurveTo(-r * 0.98, y(0.3), -r * 0.6, y(-0.03), -r * 0.15, y(0.02));
          c.fill();
          c.stroke();
          // верхнє (більше) крило
          c.fillStyle = "#a98bff";
          c.beginPath();
          c.moveTo(r * 0.35, y(0));
          c.bezierCurveTo(r * 0.95, y(0.35), r * 0.7, y(1.2), 0, y(1.0));
          c.bezierCurveTo(-r * 0.25, y(0.7), -r * 0.1, y(0.02), r * 0.35, y(0));
          c.fill();
          c.stroke();
          // візерунок
          const sp = Math.max(0.45, w);
          c.fillStyle = "#ffd6f0";
          circle(c, r * 0.28, y(0.62), r * 0.13 * sp);
          c.fill();
          c.fillStyle = "#e4dbff";
          circle(c, -r * 0.55, y(0.5), r * 0.09 * sp);
          c.fill();
        }
      } else {
        // вусики
        c.strokeStyle = "#5b3a8c";
        c.lineWidth = Math.max(1, r * 0.04);
        c.lineCap = "round";
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(r * 0.68, side * r * 0.16);
          c.quadraticCurveTo(r * 0.95, side * r * 0.2, r * 1.1, side * r * 0.42);
          c.stroke();
          c.fillStyle = "#5b3a8c";
          circle(c, r * 1.1, side * r * 0.42, r * 0.055);
          c.fill();
        }
      }
      break;
    }
    case "thunder": {
      // спалахи блискавки: кадри 1 і 3 - удар (з різних боків) і сяйво рогів, 0 і 2 - тиша з легкими іскрами
      const flash = k % 2 === 1;
      if (flash) {
        const side = k === 1 ? -1 : 1;
        const pts: [number, number][] = [
          [-0.3, side * 1.52],
          [0.15, side * 1.3],
          [-0.12, side * 1.18],
          [0.3, side * 1.0],
          [0.05, side * 0.92],
        ];
        c.lineJoin = "round";
        c.lineCap = "round";
        c.strokeStyle = "rgba(255,240,120,0.28)";
        c.lineWidth = Math.max(2, r * 0.07);
        circle(c, 0, 0, r * 1.1);
        c.stroke();
        for (const [lw, col] of [[0.13, "#ffe94d"], [0.055, "#ffffff"]] as const) {
          c.strokeStyle = col;
          c.lineWidth = Math.max(1.5, r * lw);
          c.beginPath();
          c.moveTo(pts[0][0] * r, pts[0][1] * r);
          for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * r, pts[i][1] * r);
          c.stroke();
        }
        c.fillStyle = "rgba(255,250,170,0.75)";
        for (const hs of [-1, 1]) {
          circle(c, Math.cos(hs * 1.55) * r * 0.78, Math.sin(hs * 1.55) * r * 0.78, r * 0.2);
          c.fill();
        }
      } else {
        c.fillStyle = "rgba(255,240,150,0.9)";
        for (const hs of [-1, 1]) {
          const a = hs * 1.55 + (k === 0 ? 0.35 : -0.35) * hs;
          circle(c, Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08, r * 0.045);
          c.fill();
        }
      }
      break;
    }
    case "frost": {
      // рідкісні сніжинки по колу (3 штуки через 120°; крок на кадр = 120°/кадрів - цикл безшовний)
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineCap = "round";
      c.lineWidth = Math.max(1, r * 0.035);
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3 + (k * TAU) / 3 / n;
        const fx = Math.cos(a) * r * 1.12;
        const fy = Math.sin(a) * r * 1.12;
        const fr = r * 0.14;
        for (let arm = 0; arm < 3; arm++) {
          const aa = (arm * Math.PI) / 3 + a;
          c.beginPath();
          c.moveTo(fx - Math.cos(aa) * fr, fy - Math.sin(aa) * fr);
          c.lineTo(fx + Math.cos(aa) * fr, fy + Math.sin(aa) * fr);
          c.stroke();
        }
      }
      break;
    }
    case "sun": {
      // м'яке сяйво й 12 променів, що повільно обертаються (крок на кадр = (360°/12)/кадрів)
      const g = c.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.5);
      g.addColorStop(0, "rgba(255,226,120,0.5)");
      g.addColorStop(1, "rgba(255,226,120,0)");
      c.fillStyle = g;
      circle(c, 0, 0, r * 1.5);
      c.fill();
      const rays = 12;
      const rot = (k * (TAU / rays)) / n;
      c.fillStyle = "rgba(255,210,74,0.55)";
      for (let i = 0; i < rays; i++) {
        const a = rot + (i * TAU) / rays;
        const w = (TAU / rays) * 0.2;
        c.beginPath();
        c.moveTo(Math.cos(a - w) * r * 0.98, Math.sin(a - w) * r * 0.98);
        c.lineTo(Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.42);
        c.lineTo(Math.cos(a + w) * r * 0.98, Math.sin(a + w) * r * 0.98);
        c.closePath();
        c.fill();
      }
      break;
    }
    case "david": {
      // праща гойдається між двома положеннями
      const px = k % 2 === 0 ? 0.38 : -0.16;
      const py = k % 2 === 0 ? 1.2 : 1.28;
      c.strokeStyle = "#7a5530";
      c.lineWidth = Math.max(1.5, r * 0.06);
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(r * 0.05, r * 0.78);
      c.lineTo(r * px, r * py);
      c.stroke();
      c.fillStyle = "#a9794a";
      c.beginPath();
      c.ellipse(r * px, r * py, r * 0.17, r * 0.11, 0.6, 0, TAU);
      c.fill();
      c.fillStyle = "#9aa0a6";
      circle(c, r * px, r * py, r * 0.08);
      c.fill();
      break;
    }
    case "polar": {
      // блакитне світіння очей пульсує
      const a = [0.35, 0.8, 0.55][k % 3];
      for (const side of [-1, 1]) {
        const ex = r * 0.22;
        const ey = side * r * 0.2;
        const g = c.createRadialGradient(ex, ey, 0, ex, ey, r * 0.3);
        g.addColorStop(0, `rgba(120,225,255,${a})`);
        g.addColorStop(1, "rgba(120,225,255,0)");
        c.fillStyle = g;
        circle(c, ex, ey, r * 0.3);
        c.fill();
      }
      break;
    }
  }
  c.restore();
}

/** Малює шар анімації повернутим за напрямком погляду. */
function drawLayerRotated(c: CanvasRenderingContext2D, skin: Skin, r: number, ang: number, frame: number, layer: number) {
  c.save();
  c.rotate(ang);
  drawAnimLayer(c, skin, r, frame, layer);
  c.restore();
}

export function drawCreature(
  c: CanvasRenderingContext2D,
  skin: Skin,
  x: number,
  y: number,
  r: number,
  ang: number,
  phase: number,
  wobble: number,
  /** Кадр анімації преміум-скіна. */
  frame = 0,
  /** false - без анімованих шарів (їх малюють окремими спрайтами). */
  layers = true,
  /** Тіло для кешу: шари малюються окремо (у райдужної - ще й уся вовна). */
  bodyOnly = false,
) {
  c.save();
  c.translate(x, y);
  // покачування: легкий нахил і "дихання"
  const sq = 1 + Math.sin(phase * 2) * 0.035 * wobble;
  c.rotate(Math.sin(phase) * 0.07 * wobble);
  c.scale(sq, 2 - sq);

  const fwdX = Math.cos(ang);
  const fwdY = Math.sin(ang);
  const dark = "rgba(0,0,0,0.16)";
  const layerMask = layers ? animLayers(skin) : 0;
  // «Веселкова вівця»: вовну (а не смугу збоку) малює шар позаду - тіло лишає лише мордочку й вуха
  const rainbowWool = skin.deco === "rainbow" && (bodyOnly || layerMask !== 0);
  if (layerMask & LAYER_BEHIND) drawLayerRotated(c, skin, r, ang, frame, LAYER_BEHIND);

  if (skin.kind === "wolf" || skin.kind === "dog") {
    // вуха
    c.fillStyle = skin.kind === "wolf" ? skin.fur : "#7a4a26";
    for (const side of [-1, 1]) {
      const a = ang + side * 1.05;
      const ex = Math.cos(a) * r * 0.72;
      const ey = Math.sin(a) * r * 0.72;
      if (skin.kind === "wolf") {
        c.beginPath();
        c.moveTo(ex + Math.cos(a + side * 0.9) * r * 0.32, ey + Math.sin(a + side * 0.9) * r * 0.32);
        c.lineTo(ex + Math.cos(a - side * 0.9) * r * 0.32, ey + Math.sin(a - side * 0.9) * r * 0.32);
        c.lineTo(Math.cos(a) * r * 1.14, Math.sin(a) * r * 1.14);
        c.closePath();
        c.fill();
      } else {
        c.beginPath();
        c.ellipse(ex, ey, r * 0.3, r * 0.2, a, 0, TAU);
        c.fill();
      }
    }
    c.fillStyle = skin.fur;
    circle(c, 0, 0, r);
    c.fill();
    c.fillStyle = skin.light;
    circle(c, -r * 0.22, -r * 0.28, r * 0.5);
    c.globalAlpha = 0.35;
    c.fill();
    c.globalAlpha = 1;
    c.lineWidth = Math.max(1, r * 0.06);
    c.strokeStyle = dark;
    circle(c, 0, 0, r);
    c.stroke();
    if (skin.deco === "wolfwool") drawDeco(c, skin, r, ang);
    if (skin.kind === "dog") {
      c.fillStyle = skin.face;
      c.beginPath();
      c.ellipse(-fwdX * r * 0.25, -fwdY * r * 0.25, r * 0.55, r * 0.78, ang, 0, TAU);
      c.fill();
    }
    // морда
    c.fillStyle = skin.face;
    c.beginPath();
    c.ellipse(fwdX * r * 0.45, fwdY * r * 0.45, r * 0.42, r * 0.34, ang, 0, TAU);
    c.fill();
    drawEyes(c, fwdX * r * 0.1, fwdY * r * 0.1, r, ang, skin.accent, skin.kind === "wolf");
    c.fillStyle = "#1a1717";
    circle(c, fwdX * r * 0.78, fwdY * r * 0.78, r * 0.09);
    c.fill();
  } else {
    // вівця / ягня / баран: кучерява шерсть
    const bumps = skin.kind === "lamb" ? 9 : 11;
    const br = r * (skin.kind === "lamb" ? 0.3 : 0.27);
    drawSpecialBehind(c, skin, r, ang);
    if (!rainbowWool) {
      c.fillStyle = dark;
      circle(c, r * 0.05, r * 0.07, r * 0.98);
      c.fill();
    }
    c.fillStyle = skin.fur;
    // робот - гладкий металевий корпус без кучерявої шерсті
    if (skin.deco !== "robot" && !rainbowWool) {
      for (let i = 0; i < bumps; i++) {
        const a = (i / bumps) * TAU + 0.2;
        circle(c, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, br);
        c.fill();
      }
    }
    if (!rainbowWool) {
      circle(c, 0, 0, r * (skin.deco === "robot" ? 0.95 : 0.82));
      c.fill();
      c.fillStyle = skin.light;
      c.globalAlpha = 0.65;
      circle(c, -r * 0.2, -r * 0.25, r * 0.5);
      c.fill();
      c.globalAlpha = 1;
    }
    if (skin.kind === "ram") {
      // «Сонячний баран»: товстіші, більше закручені золоті роги
      const sunny = skin.deco === "sun";
      c.strokeStyle = skin.accent;
      c.lineWidth = Math.max(2, r * (sunny ? 0.17 : 0.13));
      c.lineCap = "round";
      for (const side of [-1, 1]) {
        const a = ang + side * 1.55;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * (sunny ? 0.31 : 0.27), a - 1.6, a + (sunny ? 3.9 : 3.4));
        c.stroke();
      }
    }
    // вуха
    c.fillStyle = skin.face;
    for (const side of [-1, 1]) {
      const a = ang + side * 1.75;
      c.beginPath();
      c.ellipse(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.22, r * 0.12, a, 0, TAU);
      c.fill();
    }
    // мордочка
    c.fillStyle = skin.face;
    c.beginPath();
    c.ellipse(fwdX * r * 0.36, fwdY * r * 0.36, r * 0.46, r * 0.4, ang, 0, TAU);
    c.fill();
    drawEyes(c, fwdX * r * 0.2, fwdY * r * 0.2, r, ang, "#fff", false);
    c.fillStyle = skin.accent;
    circle(c, fwdX * r * 0.62, fwdY * r * 0.62, r * 0.08);
    c.fill();
    if (skin.kind === "lamb") {
      c.globalAlpha = 0.5;
      for (const side of [-1, 1]) {
        circle(c, fwdX * r * 0.38 - Math.sin(ang) * side * r * 0.34, fwdY * r * 0.38 + Math.cos(ang) * side * r * 0.34, r * 0.09);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  }
  if (skin.deco && skin.deco !== "wolfwool") {
    drawDeco(c, skin, r, ang);
    drawSpecialFront(c, skin, r, ang);
  }
  if (layerMask & LAYER_FRONT) drawLayerRotated(c, skin, r, ang, frame, LAYER_FRONT);
  c.restore();
}

