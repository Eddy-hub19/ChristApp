/**
 * Стріли карти «Арена»: іконка стріли на землі (лежить під кутом, з тінню) і снаряд у польоті (та сама стріла зі слідом).
 * Кешовані спрайти (offscreen canvas), без свічення й shadowBlur; оригінальний стиль: дерев'яне ратище, сталевий наконечник, оперення.
 * Стріла дивиться вздовж +x; довжина `len` - у світових одиницях.
 */
const TAU = Math.PI * 2;
export const ARROW_GROUND_LEN = 70;
export const ARROW_FLIGHT_LEN = 90;

function mk(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

const OUT = "#2a1a0e";

/** Малює стрілу з центром у (0, 0), довжина len, вістря до +x. */
export function drawArrowShape(c: CanvasRenderingContext2D, len: number, flight = false) {
  const h = len / 2;
  const lw = Math.max(1.2, len * 0.03);
  c.lineJoin = "round";
  c.lineCap = "round";
  // ратище
  c.strokeStyle = OUT;
  c.lineWidth = len * 0.075 + lw * 2;
  c.beginPath();
  c.moveTo(-h * 0.95, 0);
  c.lineTo(h * 0.6, 0);
  c.stroke();
  c.strokeStyle = flight ? "#e9c27a" : "#c99a52";
  c.lineWidth = len * 0.075;
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.45)";
  c.lineWidth = len * 0.02;
  c.beginPath();
  c.moveTo(-h * 0.8, -len * 0.018);
  c.lineTo(h * 0.5, -len * 0.018);
  c.stroke();
  // наконечник: сталевий ромб
  c.fillStyle = "#cfd6de";
  c.strokeStyle = OUT;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(h, 0);
  c.lineTo(h * 0.56, -len * 0.105);
  c.lineTo(h * 0.62, 0);
  c.lineTo(h * 0.56, len * 0.105);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = "#f4f7fa";
  c.beginPath();
  c.moveTo(h * 0.95, 0);
  c.lineTo(h * 0.6, -len * 0.07);
  c.lineTo(h * 0.65, 0);
  c.closePath();
  c.fill();
  // оперення: дві пари пір'їн, червоне й біле
  for (const [x, col] of [[-h * 0.9, "#d8433c"], [-h * 0.68, "#f2f2f2"]] as const) {
    for (const s of [-1, 1]) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x - len * 0.1, s * len * 0.12);
      c.lineTo(x + len * 0.12, s * len * 0.12);
      c.lineTo(x + len * 0.16, 0);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
}

const groundCache = new Map<number, HTMLCanvasElement>();
const flightCache = new Map<number, HTMLCanvasElement>();

/** Бакет за пікселями на одиницю, щоб не плодити спрайти. */
const quant = (pxPerUnit: number) => Math.max(0.2, Math.min(3, Math.round(pxPerUnit * 4) / 4));

function groundSprite(q: number): HTMLCanvasElement {
  let cv = groundCache.get(q);
  if (cv) return cv;
  const len = ARROW_GROUND_LEN;
  const size = len * 1.5;
  cv = mk(size * q, size * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    c.translate(size / 2, size / 2);
    // тінь від стріли на піску
    c.save();
    c.translate(5, 7);
    c.globalAlpha = 0.3;
    c.fillStyle = "#4a2f12";
    c.beginPath();
    c.ellipse(0, 0, len * 0.5, len * 0.07, 0, 0, TAU);
    c.fill();
    c.restore();
    drawArrowShape(c, len);
  }
  groundCache.set(q, cv);
  return cv;
}

/** Стріла на землі в (x, y): кут `ang` (рад) - задає сервер/клієнт за id (різні стріли лежать по-різному). */
export function drawArrowOnGround(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, pxPerUnit: number, bob = 0) {
  const q = quant(pxPerUnit);
  const s = groundSprite(q);
  const w = s.width / q;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(ang);
  ctx.drawImage(s, -w / 2, -w / 2, w, w);
  ctx.restore();
}

function flightSprite(q: number): HTMLCanvasElement {
  let cv = flightCache.get(q);
  if (cv) return cv;
  const len = ARROW_FLIGHT_LEN;
  const trail = len * 1.1;
  const w = len + trail + 20;
  const h = len * 0.7;
  cv = mk(w * q, h * q);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(q, q);
    // початок: центр стріли на x = trail + len/2 + 10
    c.translate(trail + len / 2 + 10, h / 2);
    // слід: три тонкі лінії, що тануть до хвоста
    for (let i = 0; i < 3; i++) {
      const g = c.createLinearGradient(-len / 2, 0, -len / 2 - trail, 0);
      g.addColorStop(0, "rgba(255,255,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.strokeStyle = g;
      c.lineWidth = 2.4 - i * 0.6;
      c.beginPath();
      c.moveTo(-len / 2, (i - 1) * len * 0.07);
      c.lineTo(-len / 2 - trail * (1 - i * 0.15), (i - 1) * len * 0.07);
      c.stroke();
    }
    drawArrowShape(c, len, true);
  }
  flightCache.set(q, cv);
  return cv;
}

/** Снаряд у польоті: (x, y) - центр стріли, `ang` - напрям польоту. */
export function drawArrowInFlight(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, pxPerUnit: number) {
  const q = quant(pxPerUnit);
  const s = flightSprite(q);
  const len = ARROW_FLIGHT_LEN;
  const trail = len * 1.1;
  const w = s.width / q;
  const h = s.height / q;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.drawImage(s, -(trail + len / 2 + 10), -h / 2, w, h);
  ctx.restore();
}

export function clearArrowCaches() {
  groundCache.clear();
  flightCache.clear();
}
