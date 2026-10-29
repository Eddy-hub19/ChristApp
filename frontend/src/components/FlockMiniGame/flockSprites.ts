import { LAYER_BEHIND, LAYER_FRONT, animLayers, circle, drawAnimLayer, drawCreature, layerExtent } from "./flockCreature";
import { GROUND_SPAN, SUNLIGHT_SPAN, paintGround, paintSunlight, type Ground } from "./flockGround";
import { ARTIFACT_EXTENT, anchorFor, drawArtifact, drawArtifactShape } from "./flockArtifacts";
import { animFrame, skinOf } from "./flockSkins";
import { specialExtent } from "./flockSpecialDeco";
import type { Theme } from "./flockRender";

/**
 * Кеш готових спрайтів (offscreen canvas): персонажі, бонуси зі свіченням, кущі, імена, цифри маси, тайл пасовища.
 * Жодного shadowBlur/filter/градієнтів на кадр: усе малюється один раз під потрібний розмір, далі - drawImage.
 * Розмір спрайта підбирається "відрами" (крок 12%), тож перемальовка потрібна лише при помітній зміні масштабу.
 */

const TAU = Math.PI * 2;

function makeCanvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

/** Мапа з обмеженням розміру (найстаріший вилітає) - щоб кеш не ріс безмежно. */
class Lru<V> {
  private m = new Map<string, V>();
  constructor(private readonly cap: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V) {
    this.m.set(k, v);
    if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value as string);
  }
  clear() {
    this.m.clear();
  }
}

// ---------- персонажі ----------
const BUCKET = 1.12;
/** Менший за цей екранний радіус (px) персонаж без анімованих шарів. */
const LAYER_MIN_PX = 8;
const ANGLES = 24;
interface CreatureSprite {
  cv: HTMLCanvasElement;
  /** Піксельний радіус, під який намальовано. */
  rb: number;
}
const creatures = new Lru<CreatureSprite>(500);

const layerSprites = new Lru<CreatureSprite>(300);
/** Артефакти: окремий слой-спрайт на (артефакт, вид істоти, розмір) - комбінація зі скіном не створюється наново. */
const artifactSprites = new Lru<CreatureSprite>(200);
/** Менший за цей екранний радіус (px) артефакт не малюємо: його не видно, а заливка коштує. */
const ARTIFACT_MIN_PX = 9;

/** Спрайт артефакта без кута (повертається при малюванні, як тіло - за відром кута). */
function artifactSprite(artifact: number, skinId: number, b: number, rb: number): CreatureSprite {
  const skin = skinOf(skinId);
  const key = `${artifact}:${skin.kind}:${skin.deco ?? ""}:${b}`;
  let spr = artifactSprites.get(key);
  if (!spr) {
    const size = Math.ceil(rb * 2 * ARTIFACT_EXTENT) + 2;
    const cv = makeCanvas(size, size);
    const c = cv.getContext("2d");
    if (c) {
      c.translate(size / 2, size / 2);
      drawArtifactShape(c, artifact, rb, anchorFor(skin));
    }
    spr = { cv, rb };
    artifactSprites.set(key, spr);
  }
  return spr;
}

/** «Зменшити рух»: читаємо один раз ліниво (на клієнті) і слухаємо зміни - анімації скінів тоді вимкнені. */
let reduceMotion: boolean | null = null;
export function prefersReducedMotion(): boolean {
  if (reduceMotion === null) {
    reduceMotion = false;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reduceMotion = mq.matches;
      mq.addEventListener?.("change", (e) => {
        reduceMotion = e.matches;
      });
    }
  }
  return reduceMotion;
}

/** Спрайт кадру анімованого шару (без кута: повертається при малюванні). Шар виходить за радіус - спрайт більший. */
function layerSprite(skinId: number, b: number, rb: number, frame: number, layer: number): CreatureSprite {
  const key = `${skinId}:${b}:${frame}:${layer}`;
  let spr = layerSprites.get(key);
  if (!spr) {
    const skin = skinOf(skinId);
    const size = Math.ceil(rb * 2 * layerExtent(skin, layer)) + 2;
    const cv = makeCanvas(size, size);
    const c = cv.getContext("2d");
    if (c) {
      c.translate(size / 2, size / 2);
      drawAnimLayer(c, skin, rb, frame, layer);
    }
    spr = { cv, rb };
    layerSprites.set(key, spr);
  }
  return spr;
}

/**
 * Малює персонажа спрайтом (тіло, мордочка, вуха); дрібні/дуже великі - напряму.
 * Преміум-скіни: тіло - той самий кеш, а анімація - окремі спрайти-шари на 2-6 кадрів (позаду й поверх тіла);
 * `time` (секунди) визначає кадр. Дрібних і при «зменшити рух» малюємо без анімації (кадр 0).
 */
export function drawCreatureCached(
  ctx: CanvasRenderingContext2D,
  skinId: number,
  x: number,
  y: number,
  r: number,
  ang: number,
  phase: number,
  wobble: number,
  scale: number,
  dpr: number,
  time = 0,
  /** Надітий артефакт (0 - нічого); малюється шаром поверх скіна. */
  artifact = 0,
) {
  const rPx = r * scale * dpr;
  const skin = skinOf(skinId);
  const frame = animFrame(skin, time, { reduceMotion: prefersReducedMotion(), rPx });
  if (rPx > 220 || rPx < 2.5) {
    drawCreature(ctx, skin, x, y, r, ang, phase, wobble, frame, rPx >= 2.5);
    if (artifact > 0 && rPx >= ARTIFACT_MIN_PX) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(phase) * 0.07 * wobble);
      const sq = 1 + Math.sin(phase * 2) * 0.035 * wobble;
      ctx.scale(sq, 2 - sq);
      drawArtifact(ctx, artifact, skin, 0, 0, r, ang);
      ctx.restore();
    }
    return;
  }
  const b = Math.round(Math.log(rPx) / Math.log(BUCKET));
  const ab = ((Math.round(ang / (TAU / ANGLES)) % ANGLES) + ANGLES) % ANGLES;
  const key = `${skinId}:${b}:${ab}`;
  let spr = creatures.get(key);
  if (!spr) {
    const rb = Math.pow(BUCKET, b);
    const size = Math.ceil(rb * 2 * specialExtent(skin)) + 2;
    const cv = makeCanvas(size, size);
    const c = cv.getContext("2d");
    if (c) {
      c.translate(size / 2, size / 2);
      drawCreature(c, skin, 0, 0, rb, (ab * TAU) / ANGLES, 0, 0, 0, false, true);
    }
    spr = { cv, rb };
    creatures.set(key, spr);
  }
  const f = r / spr.rb; // піксель спрайта -> світові одиниці
  const w = spr.cv.width * f;
  ctx.save();
  ctx.translate(x, y);
  // покачування й "дихання": трансформ поверх готового спрайта
  ctx.rotate(Math.sin(phase) * 0.07 * wobble);
  const sq = 1 + Math.sin(phase * 2) * 0.035 * wobble;
  ctx.scale(sq, 2 - sq);
  // Дрібним (< 8 px) шари анімації не потрібні - їх не видно, а заливка коштує.
  // у «Веселкової» вовна - це шар, тож він потрібен на будь-якому розмірі (тіло в кеші без вовни)
  const mask = rPx >= LAYER_MIN_PX || skin.deco === "rainbow" ? animLayers(skin) : 0;
  if (mask & LAYER_BEHIND) drawLayer(ctx, skinId, b, spr.rb, f, ang, frame, LAYER_BEHIND);
  ctx.drawImage(spr.cv, -w / 2, -w / 2, w, w);
  if (mask & LAYER_FRONT) drawLayer(ctx, skinId, b, spr.rb, f, ang, frame, LAYER_FRONT);
  if (artifact > 0 && rPx >= ARTIFACT_MIN_PX) {
    const as = artifactSprite(artifact, skinId, b, spr.rb);
    const aw = as.cv.width * f;
    ctx.rotate((ab * TAU) / ANGLES);
    ctx.drawImage(as.cv, -aw / 2, -aw / 2, aw, aw);
  }
  ctx.restore();
}

function drawLayer(ctx: CanvasRenderingContext2D, skinId: number, b: number, rb: number, f: number, ang: number, frame: number, layer: number) {
  const ls = layerSprite(skinId, b, rb, frame, layer);
  const lw = ls.cv.width * f;
  ctx.save();
  ctx.rotate(ang);
  ctx.drawImage(ls.cv, -lw / 2, -lw / 2, lw, lw);
  ctx.restore();
}

// ---------- бонуси (свічення + диск + іконка в одному спрайті) ----------
const bonusCache = new Map<string, HTMLCanvasElement>();
const BONUS_SPRITE = 192;

export function bonusFullSprite(kind: string, color: string, icon: string, dark: boolean) {
  const key = `${kind}${dark ? "d" : "l"}`;
  let cv = bonusCache.get(key);
  if (cv) return cv;
  cv = makeCanvas(BONUS_SPRITE, BONUS_SPRITE);
  const c = cv.getContext("2d");
  if (c) {
    const s = BONUS_SPRITE;
    const k = s / 100; // 100 світових одиниць = весь спрайт (радіус свічення 44, диск 17)
    c.translate(s / 2, s / 2);
    const g = c.createRadialGradient(0, 0, 4 * k, 0, 0, 44 * k);
    g.addColorStop(0, color);
    g.addColorStop(0.45, color + "99");
    g.addColorStop(1, color + "00");
    c.fillStyle = g;
    circle(c, 0, 0, 44 * k);
    c.fill();
    c.fillStyle = dark ? "#f2f5ea" : "#ffffff";
    circle(c, 0, 0, 17 * k);
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 3 * k;
    c.stroke();
    c.font = `${(icon.length > 1 && icon[0] === "✖" ? 15 : 20) * k}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#1b2a14";
    c.fillText(icon, 0, k);
  }
  bonusCache.set(key, cv);
  return cv;
}
/** Сторона спрайта бонуса у світових одиницях (було 100, тепер x1.2: диск і свічення ростуть разом зі спрайтом). */
export const BONUS_WORLD_SIZE = 120;

// ---------- зірки «Зорепаду» ----------
const STAR_PX = 192;
const starCvs: (HTMLCanvasElement | null)[] = [];
let starTailCv: HTMLCanvasElement | null = null;
let starShadowCv: HTMLCanvasElement | null = null;
/** Піврозмір зірки у світових одиницях (клітина стартової маси має радіус ~20). */
export const STAR_WORLD_R = 46;
/**
 * Варіанти зірок: кожна зірка падає в «своєму» вигляді (за id): різна кількість променів, нахил, повнота й відтінок золота.
 * [променів, внутрішній радіус (частка), нахил (рад), колір зверху, колір знизу].
 */
const STAR_LOOKS: [number, number, number, string, string][] = [
  [5, 0.5, 0, "#fff6b8", "#ffb81c"],
  [5, 0.42, 0.14, "#fff0a0", "#ffa91a"],
  [6, 0.5, 0.08, "#fff8c8", "#ffc02a"],
  [5, 0.58, -0.1, "#ffeb9a", "#ff9f18"],
  [4, 0.46, 0.4, "#fff4b0", "#ffb421"],
  [7, 0.56, 0, "#fffad2", "#ffc83d"],
];
export const STAR_VARIANTS = STAR_LOOKS.length;
/** Спрайт зірки: золото з білим блиском, заокруглені промені, тонка темна обводка; кеш по варіантах. */
export function starSprite(variant = 0) {
  const v = ((variant % STAR_VARIANTS) + STAR_VARIANTS) % STAR_VARIANTS;
  const hit = starCvs[v];
  if (hit) return hit;
  const cv = makeCanvas(STAR_PX, STAR_PX);
  const c = cv.getContext("2d");
  if (c) {
    const [n, inner, tilt, top, bottom] = STAR_LOOKS[v];
    const m = STAR_PX / 2;
    const glow = c.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, "rgba(255,240,150,0.85)");
    glow.addColorStop(0.45, "rgba(255,214,90,0.28)");
    glow.addColorStop(1, "rgba(255,214,90,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, STAR_PX, STAR_PX);
    c.translate(m, m);
    const path = () => {
      c.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + tilt + (i / (n * 2)) * TAU;
        const r = i % 2 === 0 ? m * 0.5 : m * 0.5 * inner;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
    };
    const g = c.createLinearGradient(0, -m * 0.55, 0, m * 0.5);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.lineJoin = "round";
    // товстий штрих із круглим з'єднанням заокруглює кінці променів; темніший - це тонка обводка
    path();
    c.strokeStyle = "#8a4a06";
    c.lineWidth = 17;
    c.stroke();
    path();
    c.strokeStyle = g;
    c.lineWidth = 13.5;
    c.stroke();
    c.fillStyle = g;
    c.fill();
    // білий блиск: світла пляма й маленька іскра
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.ellipse(-m * 0.12, -m * 0.16, m * 0.1, m * 0.05, -0.7, 0, TAU);
    c.fill();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(-m * 0.2, -m * 0.07, m * 0.028, 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.lineWidth = 3;
    c.lineCap = "round";
    const sx = m * 0.27;
    const sy = -m * 0.3;
    c.beginPath();
    c.moveTo(sx - 9, sy);
    c.lineTo(sx + 9, sy);
    c.moveTo(sx, sy - 9);
    c.lineTo(sx, sy + 9);
    c.stroke();
  }
  starCvs[v] = cv;
  return cv;
}
/** Хвіст зорі, що падає: вузький золотий відблиск вертикально (малюється над зіркою, вгору). */
export function starTailSprite() {
  if (starTailCv) return starTailCv;
  const cv = makeCanvas(64, 192);
  const c = cv.getContext("2d");
  if (c) {
    const g = c.createLinearGradient(0, 0, 0, 192);
    g.addColorStop(0, "rgba(255,230,120,0)");
    g.addColorStop(0.7, "rgba(255,214,90,0.55)");
    g.addColorStop(1, "rgba(255,246,190,0.9)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(32, 0);
    c.quadraticCurveTo(10, 120, 8, 192);
    c.lineTo(56, 192);
    c.quadraticCurveTo(54, 120, 32, 0);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(32, 70);
    c.lineTo(32, 186);
    c.stroke();
  }
  starTailCv = cv;
  return cv;
}
/** Тінь-мітка на землі там, де приземлиться зірка: м'яка тінь і світле кільце. */
export function starShadowSprite() {
  if (starShadowCv) return starShadowCv;
  const cv = makeCanvas(STAR_PX, STAR_PX);
  const c = cv.getContext("2d");
  if (c) {
    const m = STAR_PX / 2;
    const g = c.createRadialGradient(m, m, m * 0.1, m, m, m * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0.5)");
    g.addColorStop(0.7, "rgba(0,0,0,0.26)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, STAR_PX, STAR_PX);
    c.strokeStyle = "rgba(255,246,200,0.95)";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(m, m, m * 0.7, 0, TAU);
    c.stroke();
    c.strokeStyle = "rgba(255,200,60,0.75)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(m, m, m * 0.78, 0, TAU);
    c.stroke();
  }
  starShadowCv = cv;
  return cv;
}

// ---------- кущі ----------
const thornCvs: Record<string, HTMLCanvasElement> = {};
const THORN_PX = 256;
/** Цвета куста: [шипы, основа, блик, ягоды]. Осенняя карта - желтая листва (см. drawAutumnLeaves). */
const THORN_COLORS = {
  green: ["#2f7a3a", "#47a357", "#5fbf6e", "#e9577f"],
  autumn: ["#c48a14", "#f0c230", "#ffe27a", "#9a4a1c"],
  fir: ["#16402b", "#1f5a3a", "#2a7a4c", "#ffffff"],
  /** Обгорілий кущ вулканічної карти: чорне вугілля із жаринками. */
  charred: ["#140d0f", "#2a1f22", "#4c3b3f", "#ff8a2a"],
} as const;
/** Вид «куста» карты: bush - зеленый, autumn - желтая осенняя листва, fir - елочка со снежными шапками. */
export type ThornKind = keyof typeof THORN_COLORS;

/** Осенний куст: поверх тела - мелкие листочки (желтые, золотисто-оранжевые, редкие красно-коричневые). */
function drawAutumnLeaves(c: CanvasRenderingContext2D, r: number) {
  const colors = ["#f7d54a", "#e8a72a", "#ffe27a", "#f0b33a", "#f7d54a", "#e39a22", "#9a4a1c"];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * r * 0.7;
    c.fillStyle = colors[i % colors.length];
    c.beginPath();
    c.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.13, r * 0.07, rnd() * TAU, 0, TAU);
    c.fill();
  }
}

/** Жарини на обгорілому кущі: тьмяні жилки й яскраві цятки. */
function drawEmbers(c: CanvasRenderingContext2D, r: number) {
  let seed = 13;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  c.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU;
    const d1 = r * (0.1 + rnd() * 0.2);
    const d2 = r * (0.45 + rnd() * 0.25);
    c.strokeStyle = "rgba(255,110,30,0.75)";
    c.lineWidth = r * 0.04;
    c.beginPath();
    c.moveTo(Math.cos(a) * d1, Math.sin(a) * d1);
    c.lineTo(Math.cos(a + 0.25) * (d1 + d2) * 0.6, Math.sin(a + 0.25) * (d1 + d2) * 0.6);
    c.lineTo(Math.cos(a) * d2, Math.sin(a) * d2);
    c.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * r * 0.65;
    c.fillStyle = i % 2 ? "#ffcc4a" : "#ff8a2a";
    circle(c, Math.cos(a) * d, Math.sin(a) * d, r * 0.035);
    c.fill();
  }
}

/** Елочка сверху: три яруса лучей (темно-зеленые, чем выше - светлее), на концах лучей снег и снежная макушка. */
function drawFir(c: CanvasRenderingContext2D, r: number) {
  const tiers: [number, string][] = [
    [1, "#16402b"],
    [0.72, "#1f5a3a"],
    [0.46, "#2a7a4c"],
  ];
  const rays = 8;
  tiers.forEach(([k, color], ti) => {
    const rot = ti * (Math.PI / rays);
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < rays * 2; i++) {
      const a = rot + (i / (rays * 2)) * TAU;
      const rr = i % 2 === 0 ? r * k : r * k * 0.5;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    // снег на концах лучей
    c.fillStyle = "#f4f9ff";
    for (let i = 0; i < rays; i++) {
      const a = rot + (i / rays) * TAU;
      c.beginPath();
      c.ellipse(Math.cos(a) * r * k * 0.8, Math.sin(a) * r * k * 0.8, r * k * 0.13, r * k * 0.09, a, 0, TAU);
      c.fill();
    }
  });
  // снежная макушка
  c.fillStyle = "#ffffff";
  circle(c, 0, 0, r * 0.17);
  c.fill();
  c.fillStyle = "#d6e6f5";
  circle(c, r * 0.04, r * 0.04, r * 0.08);
  c.fill();
}

export function thornSprite(kind: ThornKind = "green") {
  const cached = thornCvs[kind];
  if (cached) return cached;
  const [cSpike, cBody, cShine, cBerry] = THORN_COLORS[kind];
  const cv = makeCanvas(THORN_PX, THORN_PX);
  const c = cv.getContext("2d");
  if (c && kind === "fir") {
    c.translate(THORN_PX / 2, THORN_PX / 2);
    drawFir(c, THORN_PX * 0.47);
  } else if (c) {
    const r = THORN_PX * 0.47;
    c.translate(THORN_PX / 2, THORN_PX / 2);
    const spikes = 16;
    c.fillStyle = cSpike;
    c.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU;
      const rr = i % 2 === 0 ? r : r * 0.82;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.fillStyle = cBody;
    circle(c, 0, 0, r * 0.72);
    c.fill();
    c.fillStyle = cShine;
    circle(c, -r * 0.2, -r * 0.22, r * 0.38);
    c.fill();
    if (kind === "autumn") {
      drawAutumnLeaves(c, r);
    } else if (kind === "charred") {
      drawEmbers(c, r);
    } else {
      c.fillStyle = cBerry;
      for (const [dx, dy] of [
        [0.25, 0.2],
        [-0.3, 0.3],
        [0.05, -0.35],
      ]) {
        circle(c, dx * r, dy * r, r * 0.07);
        c.fill();
      }
    }
  }
  thornCvs[kind] = cv;
  return cv;
}
/** Радіус куща в спрайті відносно його половини (0.47) - щоб малювати з тим самим масштабом. */
export const THORN_SPRITE_FILL = 0.47;

// ---------- текст: імена й цифри маси ----------
interface TextSprite {
  cv: HTMLCanvasElement;
  /** Піксельний розмір шрифту, під який намальовано. */
  px: number;
  /** Де в спрайті центр самого імені (без значка бота), px. */
  centerX: number;
}
const texts = new Lru<TextSprite>(300);

/** Імʼя з обводкою одним спрайтом; бот - з непомітним значком. Розмір шрифту підбирається "відрами" по 2 px. */
export function nameSprite(text: string, bot: boolean, fontPx: number, theme: Theme): TextSprite {
  const px = Math.max(8, Math.round(fontPx / 2) * 2);
  const key = `${text}|${bot ? 1 : 0}|${px}|${theme.dark ? "d" : "l"}`;
  let spr = texts.get(key);
  if (spr) return spr;
  const font = `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const probe = makeCanvas(4, 4).getContext("2d");
  let w = px * 2;
  if (probe) {
    probe.font = font;
    w = probe.measureText(text).width;
  }
  const pad = Math.ceil(px * 0.3);
  const badge = bot ? px * 0.9 : 0;
  const cv = makeCanvas(w + badge + pad * 2, px * 1.5 + pad * 2);
  const c = cv.getContext("2d");
  if (c) {
    c.font = font;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    const cy = cv.height / 2;
    c.lineWidth = px * 0.22;
    c.strokeStyle = theme.nameStroke;
    c.fillStyle = theme.nameFill;
    c.globalAlpha = bot ? 0.88 : 1;
    c.strokeText(text, pad, cy);
    c.fillText(text, pad, cy);
    if (bot) {
      // значок бота: маленька "кнопка" праворуч від імені
      c.globalAlpha = 0.55;
      circle(c, pad + w + px * 0.45, cy, px * 0.17);
      c.fill();
      c.lineWidth = px * 0.07;
      c.stroke();
    }
  }
  spr = { cv, px, centerX: pad + w / 2 };
  texts.set(key, spr);
  return spr;
}

const DIGITS = "0123456789";
const digitAtlas = new Map<string, { cv: HTMLCanvasElement; cellW: number; px: number }>();

/** Цифри маси: атлас 0-9 під розмір шрифту, число збирається drawImage-ами (без нових канвасів при зміні маси). */
export function digitSprites(fontPx: number, theme: Theme) {
  const px = Math.max(8, Math.round(fontPx / 2) * 2);
  const key = `${px}|${theme.dark ? "d" : "l"}`;
  let a = digitAtlas.get(key);
  if (a) return a;
  const font = `600 ${px}px system-ui, sans-serif`;
  const cellW = Math.ceil(px * 0.75);
  const cv = makeCanvas(cellW * 10, px * 1.5);
  const c = cv.getContext("2d");
  if (c) {
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineWidth = px * 0.2;
    c.strokeStyle = theme.nameStroke;
    c.fillStyle = theme.nameFill;
    for (let i = 0; i < 10; i++) {
      c.strokeText(DIGITS[i], cellW * i + cellW / 2, cv.height / 2);
      c.fillText(DIGITS[i], cellW * i + cellW / 2, cv.height / 2);
    }
  }
  a = { cv, cellW, px };
  digitAtlas.set(key, a);
  return a;
}

/** Малює ціле число по центру (x, y) у світових координатах; `worldPerPx` - скільки світових одиниць у пікселі спрайта. */
export function drawDigits(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, fontWorld: number, scale: number, dpr: number, theme: Theme) {
  const a = digitSprites(fontWorld * scale * dpr, theme);
  const wp = fontWorld / a.px;
  const s = String(Math.max(0, Math.round(n)));
  const total = s.length * a.cellW * wp * 0.8;
  const h = a.cv.height * wp;
  let dx = x - total / 2;
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(i) - 48;
    ctx.drawImage(a.cv, d * a.cellW, 0, a.cellW, a.cv.height, dx - a.cellW * wp * 0.1, y - h / 2, a.cellW * wp, h);
    dx += a.cellW * wp * 0.8;
  }
}

// ---------- тайл пасовища: сітка-трава + пучки одним патерном ----------
export const TILE_CELLS = 3; // 3x3 клітини сітки (по 90 одиниць) = 270 одиниць
export const GRID = 90;
let tile: { key: string; cv: HTMLCanvasElement; pattern: CanvasPattern | null } | null = null;

function hash(a: number, b: number) {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Патерн пасовища (колір + сітка + рідкі пучки). Розмір тайла підбирається під px/одиницю (бакети по 25%),
 * патерн повторюється у СВІТОВИХ координатах (setTransform перед fill).
 */
export function pastureTile(ctx: CanvasRenderingContext2D, theme: Theme, pxPerUnit: number, ground: Ground = "meadow"): CanvasPattern | null {
  const q = Math.max(0.25, Math.round(pxPerUnit * 4) / 4);
  const key = `${theme.dark ? "d" : "l"}|${theme.bg}|${q}|${ground}`;
  if (tile && tile.key === key) return tile.pattern;
  const span = GROUND_SPAN;
  const size = Math.round(span * q);
  const cv = makeCanvas(size, size);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(size / span, size / span);
    paintGround(c, span, ground, theme.bg, theme.grid, GRID);
  }
  const pattern = ctx.createPattern(cv, "repeat");
  // піксель тайла -> світова одиниця (тайл покриває span одиниць, а не size)
  pattern?.setTransform(new DOMMatrix([span / size, 0, 0, span / size, 0, 0]));
  tile = { key, cv, pattern };
  return pattern;
}

/** Солнечные блики лета: статичный тайл (кэш), накладывается поверх земли паттерном. */
let sunTile: { q: number; pattern: CanvasPattern | null } | null = null;
export function sunlightPattern(ctx: CanvasRenderingContext2D, pxPerUnit: number): CanvasPattern | null {
  const q = Math.max(0.25, Math.min(1, Math.round(pxPerUnit * 4) / 4));
  if (sunTile && sunTile.q === q) return sunTile.pattern;
  const size = Math.round(SUNLIGHT_SPAN * q);
  const cv = makeCanvas(size, size);
  const c = cv.getContext("2d");
  if (c) {
    c.scale(size / SUNLIGHT_SPAN, size / SUNLIGHT_SPAN);
    paintSunlight(c, SUNLIGHT_SPAN);
  }
  const pattern = ctx.createPattern(cv, "repeat");
  pattern?.setTransform(new DOMMatrix([SUNLIGHT_SPAN / size, 0, 0, SUNLIGHT_SPAN / size, 0, 0]));
  sunTile = { q, pattern };
  return pattern;
}

export function clearSpriteCaches() {
  sunTile = null;
  creatures.clear();
  layerSprites.clear();
  texts.clear();
  digitAtlas.clear();
  bonusCache.clear();
  for (const k of Object.keys(thornCvs)) delete thornCvs[k];
  starCvs.length = 0;
  starTailCv = null;
  starShadowCv = null;
  tile = null;
}

// ---------- хмаринка швидкої фрази ----------
export interface BubbleSprite {
  cv: HTMLCanvasElement;
  /** Піксельний розмір шрифту, під який намальовано (для перерахунку у CSS px). */
  px: number;
  /** Кінчик хвостика (низ, центр) - до нього кладемо овечку. */
  tipX: number;
  tipY: number;
}
const bubbles = new Lru<BubbleSprite>(64);
/** Хмаринки зі своїм текстом: окремий невеликий LRU за текстом (малюються один раз при отриманні, не щокадру). */
const textBubbles = new Lru<BubbleSprite>(48);

/**
 * Хмаринка з хвостиком одним спрайтом. Ключ - фраза + мова + тема + "відро" розміру шрифту (по dpr), тож вона
 * малюється один раз, а не щокадру; далі лише drawImage.
 */
export function phraseBubbleSprite(phraseId: number, lang: string, text: string, fontPx: number, theme: Theme, maxEm = Infinity): BubbleSprite {
  const px = Math.max(10, Math.round(fontPx / 2) * 2);
  // свій текст (id 0): ключ - сам текст, окремий кеш; готова фраза - за id і мовою
  const custom = phraseId === 0;
  const cache = custom ? textBubbles : bubbles;
  const key = custom ? `t|${text}|${px}|${theme.dark ? "d" : "l"}` : `${phraseId}|${lang}|${px}|${theme.dark ? "d" : "l"}`;
  let spr = cache.get(key);
  if (spr) return spr;
  const font = `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const probe = makeCanvas(4, 4).getContext("2d");
  if (probe) probe.font = font;
  const measure = (s: string) => (probe ? probe.measureText(s).width : px * s.length * 0.6);
  const lines = wrapBubbleText(text, Math.max(px * 3, maxEm * px), measure);
  const tw = Math.max(...lines.map(measure));
  const padX = px * 0.7;
  const padY = px * 0.5;
  const lineH = px * 1.25;
  const bw = tw + padX * 2;
  const bh = lineH * lines.length + padY * 2;
  const tail = px * 0.6;
  const m = Math.ceil(px * 0.12) + 1; // поле під обводку
  const cv = makeCanvas(bw + m * 2, bh + tail + m * 2);
  const c = cv.getContext("2d");
  if (c) {
    const r = Math.min(bh / 2, px * 0.9);
    const x0 = m;
    const y0 = m;
    const cx = x0 + bw / 2;
    c.beginPath();
    c.moveTo(x0 + r, y0);
    c.lineTo(x0 + bw - r, y0);
    c.arcTo(x0 + bw, y0, x0 + bw, y0 + r, r);
    c.lineTo(x0 + bw, y0 + bh - r);
    c.arcTo(x0 + bw, y0 + bh, x0 + bw - r, y0 + bh, r);
    c.lineTo(cx + tail * 0.7, y0 + bh);
    c.lineTo(cx, y0 + bh + tail);
    c.lineTo(cx - tail * 0.7, y0 + bh);
    c.lineTo(x0 + r, y0 + bh);
    c.arcTo(x0, y0 + bh, x0, y0 + bh - r, r);
    c.lineTo(x0, y0 + r);
    c.arcTo(x0, y0, x0 + r, y0, r);
    c.closePath();
    c.fillStyle = theme.dark ? "rgba(28,44,34,0.96)" : "rgba(255,255,255,0.97)";
    c.fill();
    c.lineJoin = "round";
    c.lineWidth = Math.max(1.5, px * 0.1);
    c.strokeStyle = theme.dark ? "rgba(190,240,190,0.6)" : "rgba(40,70,30,0.55)";
    c.stroke();
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = theme.dark ? "#f4fff0" : "#1f3a1f";
    lines.forEach((ln, i) => c.fillText(ln, cx, y0 + padY + lineH * (i + 0.5) + px * 0.04));
  }
  spr = { cv, px, tipX: cv.width / 2, tipY: cv.height - m };
  cache.set(key, spr);
  return spr;
}

/** Переносить текст по словах у рядки не ширше maxW; надто довге слово ріжеться по символах. */
export function wrapBubbleText(text: string, maxW: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let cur = "";
  const push = () => {
    if (cur) lines.push(cur);
    cur = "";
  };
  for (const word of text.split(" ")) {
    if (!word) continue;
    const joined = cur ? `${cur} ${word}` : word;
    if (measure(joined) <= maxW) {
      cur = joined;
      continue;
    }
    push();
    if (measure(word) <= maxW) {
      cur = word;
      continue;
    }
    // довге слово: по символах
    for (const ch of word) {
      if (cur && measure(cur + ch) > maxW) push();
      cur += ch;
    }
  }
  push();
  return lines.length ? lines : [text];
}
