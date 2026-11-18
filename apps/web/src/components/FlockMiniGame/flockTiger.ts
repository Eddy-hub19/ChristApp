/**
 * Тигр-бос карти «Арена» (скін 70): оригінальний великий спрайт зверху, рудий із чорними смугами. Малюється один раз на розмір (бакет
 * радіуса, кеш offscreen), повертається трансформом; хвіст ззаду, голова вперед (+x). Радіус істоти r = радіус тулуба; весь спрайт ~1.9 r.
 */
const TAU = Math.PI * 2;
const BUCKET = 1.25;
const EXTENT = 2.2;
const cache = new Map<number, { cv: HTMLCanvasElement; rb: number }>();

function mk(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

const OUT = "#2a1608";
const ORANGE = "#f08a24";
const ORANGE_L = "#ffb355";
const ORANGE_D = "#c5621a";
const BLACK = "#1c1209";

/** Малює тигра в початку координат, голова до +x, радіус тулуба r. */
export function drawTigerBody(c: CanvasRenderingContext2D, r: number) {
  const lw = Math.max(1.5, r * 0.05);
  c.lineJoin = "round";
  c.lineCap = "round";
  // тінь
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.beginPath();
  c.ellipse(-r * 0.2, r * 0.14, r * 1.4, r * 0.78, 0, 0, TAU);
  c.fill();
  // хвіст: вигнута товста лінія ззаду з чорними кільцями
  c.strokeStyle = OUT;
  c.lineWidth = r * 0.3 + lw * 2;
  c.beginPath();
  c.moveTo(-r * 1.2, 0);
  c.bezierCurveTo(-r * 1.65, r * 0.1, -r * 1.9, r * 0.55, -r * 1.55, r * 0.85);
  c.stroke();
  c.strokeStyle = ORANGE;
  c.lineWidth = r * 0.3;
  c.stroke();
  c.strokeStyle = BLACK;
  c.lineWidth = r * 0.3;
  c.setLineDash([r * 0.1, r * 0.22]);
  c.beginPath();
  c.moveTo(-r * 1.3, r * 0.02);
  c.bezierCurveTo(-r * 1.65, r * 0.1, -r * 1.9, r * 0.55, -r * 1.55, r * 0.85);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = BLACK;
  c.beginPath();
  c.arc(-r * 1.55, r * 0.85, r * 0.16, 0, TAU);
  c.fill();
  // лапи з боків (рушення): чотири овали
  c.fillStyle = ORANGE_D;
  c.strokeStyle = OUT;
  c.lineWidth = lw;
  for (const [px, py] of [[0.45, 0.68], [0.45, -0.68], [-0.85, 0.7], [-0.85, -0.7]] as const) {
    c.beginPath();
    c.ellipse(r * px, r * py, r * 0.3, r * 0.2, py > 0 ? 0.3 : -0.3, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = "#fbe7c4";
    for (const t of [-0.07, 0.07]) {
      c.beginPath();
      c.arc(r * (px + 0.18), r * (py + (py > 0 ? 0.04 : -0.04) + t * 2), r * 0.04, 0, TAU);
      c.fill();
    }
    c.fillStyle = ORANGE_D;
  }
  // тулуб: витягнутий овал
  const g = c.createRadialGradient(-r * 0.4, -r * 0.3, r * 0.1, -r * 0.3, 0, r * 1.1);
  g.addColorStop(0, ORANGE_L);
  g.addColorStop(0.55, ORANGE);
  g.addColorStop(1, ORANGE_D);
  c.fillStyle = g;
  c.strokeStyle = OUT;
  c.lineWidth = lw * 1.4;
  c.beginPath();
  c.ellipse(-r * 0.3, 0, r * 1.1, r * 0.66, 0, 0, TAU);
  c.fill();
  c.stroke();
  // смуги: клини поперек тулуба зі спини вбік (симетрично)
  c.save();
  c.beginPath();
  c.ellipse(-r * 0.3, 0, r * 1.1, r * 0.66, 0, 0, TAU);
  c.clip();
  c.fillStyle = BLACK;
  const stripes = [-1.0, -0.76, -0.52, -0.28, -0.04, 0.2, 0.42];
  for (const sx of stripes) {
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(r * sx, side * r * 0.8);
      c.quadraticCurveTo(r * (sx + 0.08), side * r * 0.4, r * (sx - 0.02), side * r * 0.1);
      c.quadraticCurveTo(r * (sx - 0.12), side * r * 0.45, r * (sx - 0.18), side * r * 0.8);
      c.closePath();
      c.fill();
    }
    // коротка смужка вздовж хребта
    c.beginPath();
    c.ellipse(r * sx - r * 0.06, 0, r * 0.07, r * 0.045, 0, 0, TAU);
    c.fill();
  }
  c.restore();
  // голова: широкий овал уперед
  const hg = c.createRadialGradient(r * 0.85, -r * 0.2, r * 0.05, r * 0.95, 0, r * 0.6);
  hg.addColorStop(0, ORANGE_L);
  hg.addColorStop(1, ORANGE);
  c.fillStyle = hg;
  c.strokeStyle = OUT;
  c.lineWidth = lw * 1.4;
  c.beginPath();
  c.ellipse(r * 0.95, 0, r * 0.52, r * 0.5, 0, 0, TAU);
  c.fill();
  c.stroke();
  // вуха
  for (const s of [-1, 1]) {
    c.fillStyle = ORANGE_D;
    c.beginPath();
    c.arc(r * 0.72, s * r * 0.42, r * 0.17, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = "#f6d9b4";
    c.beginPath();
    c.arc(r * 0.74, s * r * 0.42, r * 0.085, 0, TAU);
    c.fill();
  }
  // смуги на лобі й щоках
  c.fillStyle = BLACK;
  for (const s of [-1, 1]) {
    for (const [fx, fy, len] of [[0.82, 0.12, 0.2], [0.74, 0.22, 0.17], [0.88, 0.36, 0.14]] as const) {
      c.beginPath();
      c.moveTo(r * fx, s * r * fy);
      c.lineTo(r * (fx - 0.1), s * r * (fy + len));
      c.lineTo(r * (fx + 0.02), s * r * (fy + 0.03));
      c.closePath();
      c.fill();
    }
  }
  c.beginPath();
  c.moveTo(r * 0.72, 0);
  c.lineTo(r * 0.84, -r * 0.05);
  c.lineTo(r * 0.84, r * 0.05);
  c.closePath();
  c.fill();
  // морда: світлий мохнатий носик, ніс і ікла
  c.fillStyle = "#fff1d9";
  c.strokeStyle = OUT;
  c.lineWidth = lw;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(r * 1.3, s * r * 0.13, r * 0.17, r * 0.14, 0, 0, TAU);
    c.fill();
    c.stroke();
  }
  c.fillStyle = "#d8737a";
  c.beginPath();
  c.moveTo(r * 1.46, -r * 0.08);
  c.lineTo(r * 1.46, r * 0.08);
  c.lineTo(r * 1.36, 0);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = "#fff";
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(r * 1.33, s * r * 0.2);
    c.lineTo(r * 1.4, s * r * 0.3);
    c.lineTo(r * 1.28, s * r * 0.27);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // очі: жовті, суворі, зі щілиною
  for (const s of [-1, 1]) {
    c.fillStyle = "#ffd23a";
    c.strokeStyle = OUT;
    c.lineWidth = lw;
    c.beginPath();
    c.ellipse(r * 1.08, s * r * 0.24, r * 0.13, r * 0.085, s * 0.35, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = BLACK;
    c.beginPath();
    c.ellipse(r * 1.1, s * r * 0.24, r * 0.03, r * 0.075, s * 0.35, 0, TAU);
    c.fill();
    // насуплена брова
    c.fillStyle = BLACK;
    c.beginPath();
    c.moveTo(r * 0.95, s * r * 0.3);
    c.lineTo(r * 1.2, s * r * 0.14);
    c.lineTo(r * 1.2, s * r * 0.2);
    c.lineTo(r * 0.98, s * r * 0.36);
    c.closePath();
    c.fill();
  }
}

/** Малює тигра спрайтом (кеш за бакетом радіуса); `ang` - куди дивиться, `r` - радіус тулуба у світових одиницях. */
export function drawTigerCached(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, scale: number, dpr: number, wobbleTime = 0) {
  const rPx = r * scale * dpr;
  const b = Math.max(0, Math.round(Math.log(Math.max(4, rPx)) / Math.log(BUCKET)));
  let spr = cache.get(b);
  if (!spr) {
    const rb = Math.pow(BUCKET, b);
    const size = Math.ceil(rb * 2 * EXTENT) + 4;
    const cv = mk(size, size);
    const c = cv.getContext("2d");
    if (c) {
      c.translate(size / 2, size / 2);
      drawTigerBody(c, rb);
    }
    spr = { cv, rb };
    cache.set(b, spr);
  }
  const f = r / spr.rb;
  const w = spr.cv.width * f;
  ctx.save();
  ctx.translate(x, y);
  // важка хода: легке перевалювання з боку в бік
  ctx.rotate(ang + Math.sin(wobbleTime * 5) * 0.05);
  ctx.drawImage(spr.cv, -w / 2, -w / 2, w, w);
  ctx.restore();
}

export function clearTigerCache() {
  cache.clear();
}
