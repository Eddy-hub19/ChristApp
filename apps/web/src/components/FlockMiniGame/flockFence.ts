/**
 * Загорожа по периметру арени (за межею поля, на фізику не впливає). Одна горизонтальна смужка-тайл у кеші
 * (стовпчики + дві поперечини + тінь) повторюється вздовж сторони; вертикальні сторони - той самий тайл, повернутий.
 * Малюється лише та частина, що потрапила в кадр. Кольори гри не залежать від світлої/темної теми застосунку.
 */

export type FenceStyle = "wood" | "dry" | "snow" | "charred" | "night" | "candy";

/** Стиль загорожі за номером карти (flockMaps / FLOCK_MAPS на сервері). */
export function fenceStyleOf(map: number | undefined): FenceStyle {
  switch (map) {
    case 1:
      return "dry";
    case 2:
      return "snow";
    case 3:
      return "charred";
    case 5:
      return "night";
    case 8:
      return "candy";
    default:
      return "wood";
  }
}

interface FenceColors {
  post: [string, string];
  rail: [string, string];
  edge: string;
  light: string;
  shadow: string;
  cap?: string;
  glow?: string;
  /** Колір тонкої рамки на мінікарті. */
  mini: string;
}

const COLORS: Record<FenceStyle, FenceColors> = {
  wood: { post: ["#c58a4c", "#8f5a2b"], rail: ["#d79d5c", "#a46b34"], edge: "#4a2c14", light: "rgba(255,230,190,0.55)", shadow: "rgba(30,20,10,0.32)", mini: "#a46b34" },
  dry: { post: ["#a58a66", "#6e5a42"], rail: ["#b49a76", "#7c664b"], edge: "#3d2f21", light: "rgba(255,240,210,0.4)", shadow: "rgba(40,28,14,0.32)", mini: "#8a7254" },
  snow: { post: ["#eef1f5", "#b7bfca"], rail: ["#f6f8fb", "#c4ccd6"], edge: "#6c7686", light: "rgba(255,255,255,0.9)", shadow: "rgba(60,80,120,0.28)", cap: "#ffffff", mini: "#c4ccd6" },
  night: { post: ["#2c3a5c", "#161e36"], rail: ["#34446a", "#1b2542"], edge: "#04060f", light: "rgba(150,180,255,0.3)", shadow: "rgba(0,0,10,0.5)", mini: "#34446a" },
  /** «Цукеркова країна»: пряникова стіна з глазур'ю й льодяникові стовпчики (малюється окремо - makeCandyTile). */
  candy: { post: ["#ff7a9a", "#e04a72"], rail: ["#c98245", "#955a2a"], edge: "#5a3216", light: "rgba(255,255,255,0.7)", shadow: "rgba(120,50,80,0.3)", mini: "#c98245" },
  charred: { post: ["#7a6468", "#443438"], rail: ["#8a7176", "#50403f"], edge: "#000000", light: "rgba(255,180,100,0.55)", shadow: "rgba(0,0,0,0.55)", glow: "#ff7a2e", mini: "#8a7176" },
};

export const fenceMiniColor = (style: FenceStyle) => COLORS[style].mini;

/** Довжина тайла по стороні й висота загорожі (світові одиниці). */
const TILE_LEN = 240;
export const FENCE_H = 78;
/** Зазор між краєм поля і низом загорожі. */
const GAP = 4;

/** Один стовпчик (вид збоку): заокруглена зрізана верхівка, блік, цвяхи на рівнях поперечин; сніг/жар - за стилем. */
function paintPost(c: CanvasRenderingContext2D, col: FenceColors, px: number, base: number, nails: number[]) {
  const postW = 20;
  const postH = 62;
  const grad = c.createLinearGradient(px, 0, px + postW, 0);
  grad.addColorStop(0, col.post[0]);
  grad.addColorStop(1, col.post[1]);
  c.fillStyle = grad;
  c.strokeStyle = col.edge;
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(px, base);
  c.lineTo(px, base - postH + 6);
  c.quadraticCurveTo(px, base - postH, px + postW / 2, base - postH - 3);
  c.quadraticCurveTo(px + postW, base - postH, px + postW, base - postH + 6);
  c.lineTo(px + postW, base);
  c.closePath();
  c.fill();
  c.stroke();
  c.strokeStyle = col.light;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(px + 4, base - postH + 8);
  c.lineTo(px + 4, base - 6);
  c.stroke();
  c.fillStyle = col.edge;
  for (const ny of nails) {
    c.beginPath();
    c.arc(px + postW / 2, ny, 1.6, 0, Math.PI * 2);
    c.fill();
  }
  if (col.cap) {
    c.fillStyle = col.cap;
    c.strokeStyle = "#aab6c6";
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(px + postW / 2, base - postH - 1, postW / 2 + 2, 5, 0, Math.PI, 0);
    c.fill();
    c.stroke();
  }
  if (col.glow) {
    c.strokeStyle = col.glow;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(px + 9, base - 8);
    c.lineTo(px + 11, base - 24);
    c.lineTo(px + 8, base - 40);
    c.stroke();
  }
}

const tiles = new Map<string, HTMLCanvasElement>();

/** Цеглинки пряника: два ряди зі зсувом, коричневий градієнт, біла глазур по верху стіни й крапками. */
function gingerBricks(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical: boolean) {
  const rows = 2;
  const brickLen = 38;
  const bh = h / rows;
  c.save();
  c.beginPath();
  c.roundRect(x, y, w, h, 3);
  c.clip();
  const grad = c.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#d79a58");
  grad.addColorStop(1, "#9b5e2c");
  c.fillStyle = grad;
  c.fillRect(x, y, w, h);
  c.strokeStyle = "#5a3216";
  c.lineWidth = 1.5;
  c.beginPath();
  if (!vertical) {
    for (let r = 0; r <= rows; r++) {
      c.moveTo(x, y + r * bh);
      c.lineTo(x + w, y + r * bh);
    }
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : brickLen / 2;
      for (let bx = x - off; bx < x + w; bx += brickLen) {
        c.moveTo(bx, y + r * bh);
        c.lineTo(bx, y + (r + 1) * bh);
      }
    }
  } else {
    for (let r = 0; r <= rows; r++) {
      c.moveTo(x + r * (w / rows), y);
      c.lineTo(x + r * (w / rows), y + h);
    }
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : brickLen / 2;
      for (let by = y - off; by < y + h; by += brickLen) {
        c.moveTo(x + r * (w / rows), by);
        c.lineTo(x + (r + 1) * (w / rows), by);
      }
    }
  }
  c.stroke();
  // глазур: крапки на цеглинах
  c.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < (vertical ? h : w) / 14; i++) {
    const t = 8 + i * 14 + (i % 3) * 3;
    const px = vertical ? x + 3 + (i % 2) * (w / 2) : x + t;
    const py = vertical ? y + t : y + 4 + (i % 2) * bh;
    c.beginPath();
    c.arc(px, py, 1.7, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  c.strokeStyle = "#5a3216";
  c.lineWidth = 1.6;
  c.beginPath();
  c.roundRect(x, y, w, h, 3);
  c.stroke();
}

/** Льодяниковий стовпчик (вид збоку): діагональні смужки червоного й білого, глянцева кулька зверху. */
function candyPost(c: CanvasRenderingContext2D, px: number, base: number, postH: number) {
  const postW = 20;
  c.save();
  c.beginPath();
  c.roundRect(px, base - postH, postW, postH, 8);
  c.clip();
  c.fillStyle = "#fff8fb";
  c.fillRect(px, base - postH, postW, postH);
  c.strokeStyle = "#ff5c82";
  c.lineWidth = 6;
  for (let t = -postH; t < postH + postW; t += 14) {
    c.beginPath();
    c.moveTo(px - 4, base - t);
    c.lineTo(px + postW + 4, base - t - 14);
    c.stroke();
  }
  const shade = c.createLinearGradient(px, 0, px + postW, 0);
  shade.addColorStop(0, "rgba(255,255,255,0.45)");
  shade.addColorStop(0.45, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(120,30,60,0.28)");
  c.fillStyle = shade;
  c.fillRect(px, base - postH, postW, postH);
  c.restore();
  c.strokeStyle = "#c2335a";
  c.lineWidth = 1.6;
  c.beginPath();
  c.roundRect(px, base - postH, postW, postH, 8);
  c.stroke();
  // кулька-льодяник на вершині
  const bg = c.createRadialGradient(px + postW / 2 - 3, base - postH - 8, 1, px + postW / 2, base - postH - 4, 11);
  bg.addColorStop(0, "#ffd0de");
  bg.addColorStop(1, "#ff5c82");
  c.fillStyle = bg;
  c.beginPath();
  c.arc(px + postW / 2, base - postH - 3, 9.5, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.8)";
  c.beginPath();
  c.ellipse(px + postW / 2 - 3, base - postH - 7, 3, 1.8, -0.6, 0, Math.PI * 2);
  c.fill();
}

/** Пряникова стіна із цеглинок і білою глазур'ю, між льодяниковими стовпчиками. */
function makeCandyTile(q: number): HTMLCanvasElement | null {
  const key = `candy|${q}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(TILE_LEN * q);
  cv.height = Math.ceil((FENCE_H + 14) * q);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.scale(q, q);
  const base = FENCE_H + 8;
  c.fillStyle = COLORS.candy.shadow;
  c.beginPath();
  c.ellipse(TILE_LEN / 2, base + 3, TILE_LEN / 2 + 4, 6, 0, 0, Math.PI * 2);
  c.fill();
  // стіна: низький мур між стовпчиками, зверху біла глазур з натіками
  const wallH = 34;
  gingerBricks(c, -4, base - wallH, TILE_LEN + 8, wallH, false);
  c.fillStyle = "#ffffff";
  c.strokeStyle = "#e6c4d2";
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(-4, base - wallH - 1);
  for (let x = -4; x <= TILE_LEN + 4; x += 24) {
    c.quadraticCurveTo(x + 6, base - wallH - 9, x + 12, base - wallH - 2);
    c.quadraticCurveTo(x + 15, base - wallH + 8 + ((x / 24) % 3) * 3, x + 19, base - wallH - 1);
    c.lineTo(x + 24, base - wallH - 1);
  }
  c.lineTo(TILE_LEN + 4, base - wallH + 5);
  c.lineTo(-4, base - wallH + 5);
  c.closePath();
  c.fill();
  c.stroke();
  for (const px of [6, TILE_LEN * 0.5 + 6]) candyPost(c, px, base, 62);
  tiles.set(key, cv);
  return cv;
}

function makeTile(style: FenceStyle, q: number): HTMLCanvasElement | null {
  if (style === "candy") return makeCandyTile(q);
  const key = `${style}|${q}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(TILE_LEN * q);
  cv.height = Math.ceil((FENCE_H + 14) * q);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.scale(q, q);
  const col = COLORS[style];
  const base = FENCE_H + 8; // низ стовпчиків (y), нижче - тінь
  const postW = 20;
  const postH = 62;
  const railH = 11;

  // тінь на землі під загорожею
  c.fillStyle = col.shadow;
  c.beginPath();
  c.ellipse(TILE_LEN / 2, base + 3, TILE_LEN / 2 + 4, 6, 0, 0, Math.PI * 2);
  c.fill();

  const plank = (x: number, y: number, w: number, h: number, g: [string, string], r: number) => {
    const grad = c.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, g[0]);
    grad.addColorStop(1, g[1]);
    c.fillStyle = grad;
    c.strokeStyle = col.edge;
    c.lineWidth = 1.6;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
    c.stroke();
    // блік
    c.strokeStyle = col.light;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x + r, y + 2.2);
    c.lineTo(x + w - r, y + 2.2);
    c.stroke();
  };

  // дві поперечини (позаду стовпчиків), краї тайла продовжують сусідній
  const ry1 = base - postH + 12;
  const ry2 = base - postH + 36;
  plank(-4, ry1, TILE_LEN + 8, railH, col.rail, 3);
  plank(-4, ry2, TILE_LEN + 8, railH, col.rail, 3);
  // річки дошок: тонкі волокна/тріщини
  c.strokeStyle = col.edge;
  c.globalAlpha = 0.22;
  c.lineWidth = 1;
  c.beginPath();
  for (const ry of [ry1, ry2]) {
    c.moveTo(30, ry + 5.5);
    c.lineTo(70, ry + 5.5);
    c.moveTo(130, ry + 4);
    c.lineTo(190, ry + 4);
  }
  c.stroke();
  c.globalAlpha = 1;

  for (const px of [6, TILE_LEN * 0.5 + 6]) paintPost(c, col, px, base, [ry1 + railH / 2, ry2 + railH / 2]);
  if (col.cap) {
    // замети на поперечинах
    c.fillStyle = col.cap;
    c.strokeStyle = "#aab6c6";
    c.lineWidth = 0.9;
    for (const ry of [ry1, ry2]) {
      c.beginPath();
      c.moveTo(34, ry);
      c.quadraticCurveTo(60, ry - 7, 100, ry - 1);
      c.quadraticCurveTo(124, ry - 5, 150, ry);
      c.lineTo(34, ry);
      c.fill();
      c.stroke();
    }
  }
  tiles.set(key, cv);
  return cv;
}


/** Вертикальна сторона «Цукеркової країни»: смужка пряникової цегли між льодяниковими стовпчиками. */
function makeCandyVTile(q: number): HTMLCanvasElement | null {
  const key = `v|candy|${q}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(V_W * q);
  cv.height = Math.ceil((TILE_LEN + V_PAD + 10) * q);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.scale(q, q);
  const cx = V_W / 2;
  c.fillStyle = COLORS.candy.shadow;
  c.beginPath();
  c.ellipse(cx + 3, V_PAD + TILE_LEN / 2, 8, TILE_LEN / 2 + 6, 0, 0, Math.PI * 2);
  c.fill();
  gingerBricks(c, cx - 8, 0, 16, TILE_LEN + V_PAD + 10, true);
  c.fillStyle = "#ffffff";
  c.fillRect(cx - 8, 0, 4, TILE_LEN + V_PAD + 10);
  for (const base of [V_PAD + 6, V_PAD + 6 + TILE_LEN / 2, V_PAD + 6 + TILE_LEN]) candyPost(c, cx - 10, base, 62);
  tiles.set(key, cv);
  return cv;
}

/** Вертикальна сторона (вид збоку під кутом): стовпчики стоять, обидві поперечини зливаються у дві вертикальні смужки. */
const V_PAD = 70;
const V_W = 40;
function makeVTile(style: FenceStyle, q: number): HTMLCanvasElement | null {
  if (style === "candy") return makeCandyVTile(q);
  const key = `v|${style}|${q}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(V_W * q);
  cv.height = Math.ceil((TILE_LEN + V_PAD + 10) * q);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.scale(q, q);
  const col = COLORS[style];
  const cx = V_W / 2;
  // тінь вздовж низу стовпчиків
  c.fillStyle = col.shadow;
  c.beginPath();
  c.ellipse(cx + 3, V_PAD + TILE_LEN / 2, 8, TILE_LEN / 2 + 6, 0, 0, Math.PI * 2);
  c.fill();
  const bases = [V_PAD + 6, V_PAD + 6 + TILE_LEN / 2, V_PAD + 6 + TILE_LEN];
  // поперечини - за стовпчиками (на цій стороні вони йдуть уздовж, тож видно торець: смужка)
  for (const dx of [-10, 3]) {
    const grad = c.createLinearGradient(cx + dx, 0, cx + dx + 8, 0);
    grad.addColorStop(0, col.rail[0]);
    grad.addColorStop(1, col.rail[1]);
    c.fillStyle = grad;
    c.strokeStyle = col.edge;
    c.lineWidth = 1.4;
    c.beginPath();
    c.roundRect(cx + dx, 0, 8, TILE_LEN + V_PAD + 10, 3);
    c.fill();
    c.stroke();
  }
  for (const base of bases) paintPost(c, col, cx - 10, base, []);
  if (col.cap) {
    c.fillStyle = col.cap;
    c.strokeStyle = "#aab6c6";
    c.lineWidth = 0.9;
    c.beginPath();
    c.roundRect(cx - 11, 0, 7, TILE_LEN + V_PAD + 10, 3);
    c.roundRect(cx + 3, 0, 7, TILE_LEN + V_PAD + 10, 3);
    c.globalAlpha = 0.0;
    c.fill();
    c.globalAlpha = 1;
  }
  tiles.set(key, cv);
  return cv;
}

/** Квантований масштаб кешу (той самий принцип, що в pastureTile): не перемальовуємо тайл при кожній зміні зуму. */
const quant = (pxPerUnit: number) => Math.max(0.25, Math.min(2, Math.round(pxPerUnit * 4) / 4));

/**
 * Малює загорожу навколо [0, world]² у видимій області [x0..x1]×[y0..y1]. Тайл вирівняний по сітці TILE_LEN,
 * тож сусідні тайли зливаються; вертикальні сторони - поворот на 90°. `gap` - смуга по y без бокової загорожі (русло ріки).
 */
export function drawFence(ctx: CanvasRenderingContext2D, style: FenceStyle, world: number, x0: number, x1: number, y0: number, y1: number, pxPerUnit: number, gap?: { y0: number; y1: number }) {
  const tile = makeTile(style, quant(pxPerUnit));
  if (!tile) return;
  const q = tile.width / TILE_LEN;
  const th = tile.height / q;
  const edge = FENCE_H + GAP;
  const side = (from: number, to: number, put: (pos: number) => void) => {
    const a = Math.floor((Math.max(from, -edge) - 0) / TILE_LEN) * TILE_LEN;
    const b = Math.min(to, world + edge);
    for (let p = a; p < b; p += TILE_LEN) put(p);
  };
  // кути: сторони обрізаємо так, щоб вони сходились у кутовому стовпчику, а не перетинались
  const lo = -(GAP + 30);
  const hi = world + GAP + 30;
  ctx.save();
  ctx.beginPath();
  ctx.rect(lo, -edge - 20, hi - lo, world + edge * 2 + 40);
  ctx.clip();
  // верх: низ загорожі на y = -GAP
  if (y0 < GAP) side(x0, x1, (p) => ctx.drawImage(tile, p, -GAP - (th - 6), TILE_LEN, th));
  // низ: дзеркало по вертикалі невигідне (тінь), тому ту саму смужку просто зсуваємо під край
  if (y1 > world - GAP) side(x0, x1, (p) => ctx.drawImage(tile, p, world + GAP + FENCE_H - (th - 6) + 8, TILE_LEN, th));
  ctx.restore();
  // ліва й права сторони: окремий «боковий» тайл зі стоячими стовпчиками
  const vt = makeVTile(style, quant(pxPerUnit));
  if (!vt) return;
  const vq = vt.width / V_W;
  const vh = vt.height / vq;
  const vside = (put: (p: number) => void) => {
    const a = Math.floor(y0 / TILE_LEN) * TILE_LEN - TILE_LEN;
    const b = Math.min(y1 + TILE_LEN, world + edge);
    for (let p = Math.max(a, -TILE_LEN); p < b; p += TILE_LEN) put(p);
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(-edge, -GAP - 66, world + edge * 2, world + GAP * 2 + 80);
  // просвіт у боковій загорожі там, де в світ входить і з нього виходить ріка (не лише ширина русла: стовпчики трохи заходять)
  if (gap) ctx.rect(-edge, gap.y0, world + edge * 2, gap.y1 - gap.y0);
  ctx.clip(gap ? "evenodd" : "nonzero");
  if (x0 < GAP + V_W) vside((p) => ctx.drawImage(vt, -GAP - V_W / 2 - 16, p - V_PAD, V_W, vh));
  if (x1 > world - GAP - V_W) vside((p) => ctx.drawImage(vt, world + GAP + 16 - V_W / 2, p - V_PAD, V_W, vh));
  ctx.restore();
}
