import type { FlockModel, RCell } from "./flockModel";
import { FX_FROZEN, FX_GHOST, FX_PAUSED, FX_SHIELD, FX_SPEED } from "./flockProtocol";
import { circle, drawCreature } from "./flockCreature";
import { AUTUMN_MAP_ID, mapTheme } from "./flockMaps";
import { BONUS_WORLD_SIZE, THORN_SPRITE_FILL, bonusFullSprite, drawCreatureCached, drawDigits, nameSprite, pastureTile, STAR_WORLD_R, starShadowSprite, starSprite, thornSprite } from "./flockSprites";

export { drawCreature };
import { viewScale } from "./flockModel";

export interface Theme {
  dark: boolean;
  bg: string;
  bgOut: string;
  grid: string;
  tuft: string;
  nameFill: string;
  nameStroke: string;
}

export const THEMES: Record<"light" | "dark", Theme> = {
  light: { dark: false, bg: "#c9e8a8", bgOut: "#8fb877", grid: "rgba(86,140,62,0.22)", tuft: "rgba(70,125,50,0.35)", nameFill: "#ffffff", nameStroke: "rgba(40,70,30,0.75)" },
  dark: { dark: true, bg: "#223d2c", bgOut: "#14261b", grid: "rgba(150,210,150,0.10)", tuft: "rgba(140,200,140,0.18)", nameFill: "#f4fff0", nameStroke: "rgba(0,0,0,0.7)" },
};

const TAU = Math.PI * 2;
/** Масштаб камери, нижче якого малюємо спрощено (далекі об'єкти): без погойдування їжі й повороту кущів. */
const FAR_SCALE = 0.4;
/** Мінімальний розмір їжі на екрані (CSS px): на дальній камері вона лишається помітною. */
const FOOD_MIN_PX = 7;
/** З якої висоти (світові одиниці) падає зірка «Зорепаду». */
const STAR_FALL_H = 1000;
const VISIBLE: RCell[] = [];
const byMass = (a: RCell, b: RCell) => a.mass - b.mass;
/** Клітини легші за цю масу ховаються під кущем (кущ малюється поверх них). */
const HIDE_UNDER_THORN_MASS = 90;
const BONUS_STYLE: Record<string, { color: string; icon: string }> = {
  speed: { color: "#ffd24a", icon: "⚡" },
  magnet: { color: "#ff6b6b", icon: "🧲" },
  shield: { color: "#5cb8ff", icon: "🛡" },
  ghost: { color: "#c3a6ff", icon: "👻" },
  double: { color: "#7be08a", icon: "✖2" },
  freeze: { color: "#9fe8ff", icon: "❄" },
  golden: { color: "#ffc93c", icon: "🌟" },
  scissors: { color: "#ff5c8a", icon: "✂️" },
  boost: { color: "#ff9f43", icon: "🚀" },
};
export const BONUS_ICON: Record<string, string> = Object.fromEntries(Object.entries(BONUS_STYLE).map(([k, v]) => [k, v.icon]));
export const BONUS_COLOR: Record<string, string> = Object.fromEntries(Object.entries(BONUS_STYLE).map(([k, v]) => [k, v.color]));

/** Тривалість анімації хвилі «Ножиць» (мс) і кількість клаптиків шерсті. */
const SCISSORS_WAVE_MS = 900;
const SCISSORS_TUFTS = 10;
const SCISSORS_PX = 128;
let scissorsRingCv: HTMLCanvasElement | null = null;
/** Кільце хвилі (м'яке світіння по краю): малюється один раз, масштабується під радіус. */
function scissorsRingSprite() {
  return (scissorsRingCv ??= sprite("scissors-ring", 256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,92,138,0)");
    g.addColorStop(0.8, "rgba(255,92,138,0.28)");
    g.addColorStop(0.95, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,92,138,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }));
}
/** Ножиці (два кадри: розкриті / стулені): два леза навколо шарніра й два кільця-ручки. */
function scissorsSprite(open: boolean) {
  return sprite(`scissors-${open ? "o" : "c"}`, SCISSORS_PX, (c, s) => {
    c.translate(s / 2, s / 2);
    c.scale(s / 40, s / 40);
    c.lineJoin = "round";
    c.lineCap = "round";
    const spread = open ? 0.42 : 0.06;
    for (const side of [-1, 1]) {
      c.save();
      c.rotate(side * spread);
      // лезо
      c.fillStyle = "#dfe6ee";
      c.strokeStyle = "#2d2438";
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-side * 0.5, 2);
      c.lineTo(side * 3.2, -17);
      c.lineTo(side * 0.6, -17);
      c.closePath();
      c.fill();
      c.stroke();
      // ручка
      c.fillStyle = "#ff5c8a";
      c.beginPath();
      c.arc(-side * 4.5, 12, 4.6, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(-side * 4.5, 12, 1.9, 0, TAU);
      c.fill();
      c.restore();
    }
    c.fillStyle = "#ffd24a";
    c.strokeStyle = "#2d2438";
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(0, 0, 1.9, 0, TAU);
    c.fill();
    c.stroke();
  });
}

// ---------- кеш спрайтів (їжа, іконки бонусів) ----------
const spriteCache = new Map<string, HTMLCanvasElement>();
function sprite(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  let cv = spriteCache.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const c = cv.getContext("2d");
    if (c) draw(c, size);
    spriteCache.set(key, cv);
  }
  return cv;
}

/** Спрайт їжі малюється в системі координат 40×40 (як раніше) і масштабується під FOOD_PX: чітко й на великому екрані. */
const FOOD_DESIGN = 40;
const FOOD_PX = 64;
const foodCache: (HTMLCanvasElement | undefined)[] = [];
function foodSprite(kind: number, dark: boolean) {
  const i = kind * 2 + (dark ? 1 : 0);
  return (foodCache[i] ??= sprite(`food2-${i}`, FOOD_PX, (c, s) => {
    c.translate(s / 2, s / 2);
    c.scale(s / FOOD_DESIGN, s / FOOD_DESIGN);
    c.lineCap = "round";
    if (kind === 0) {
      // пучок трави
      c.strokeStyle = dark ? "#7fd18a" : "#3f9a4a";
      c.lineWidth = 4;
      for (const a of [-0.55, -0.2, 0.15, 0.5]) {
        c.beginPath();
        c.moveTo(a * 6, 13);
        c.quadraticCurveTo(a * 14, 0, a * 24, -13);
        c.stroke();
      }
    } else if (kind === 1) {
      // квітка
      const petals = dark ? "#ffb3d1" : "#ff8fb8";
      c.fillStyle = petals;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.ellipse(Math.cos((i / 5) * TAU) * 8, Math.sin((i / 5) * TAU) * 8, 6.5, 6.5, 0, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#ffd94a";
      c.beginPath();
      c.arc(0, 0, 5.5, 0, TAU);
      c.fill();
    } else if (kind === 3) {
      // жмут шерсті (клаптик після «Ножиць»): пухнасті хмаринки
      c.fillStyle = dark ? "#f4f1ea" : "#ffffff";
      c.strokeStyle = dark ? "#b9b2a4" : "#c9c3b4";
      c.lineWidth = 2;
      for (const [dx, dy, r] of [[-6, 2, 8], [6, 2, 8], [0, -5, 8.5], [0, 7, 7]]) {
        c.beginPath();
        c.arc(dx, dy, r, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.beginPath();
      c.arc(-6, 2, 7, 0, TAU);
      c.arc(6, 2, 7, 0, TAU);
      c.arc(0, -5, 7.5, 0, TAU);
      c.arc(0, 7, 6, 0, TAU);
      c.fill();
    } else {
      // колосок
      c.strokeStyle = dark ? "#e9cd7c" : "#c99a2e";
      c.fillStyle = c.strokeStyle;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, 16);
      c.lineTo(0, -10);
      c.stroke();
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          c.beginPath();
          c.ellipse(side * 5, -12 + i * 6, 3.2, 6, side * 0.6, 0, TAU);
          c.fill();
        }
      }
    }
  }));
}

export interface DrawOpts {
  width: number;
  height: number;
  dpr: number;
  time: number;
  theme: Theme;
  /** Власний останній напрямок (для обличчя своєї клітини). */
  selfAngle: number;
  showNames: boolean;
  botLabel: string;
}

export function drawScene(ctx: CanvasRenderingContext2D, m: FlockModel, o: DrawOpts) {
  const { width: W, height: H, dpr } = o;
  const theme = mapTheme(o.theme, m.cfg.map);
  const scale = viewScale(W, H, m.camR);
  const world = m.cfg.world;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.bgOut;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-m.camX, -m.camY);
  const halfW = W / 2 / scale;
  const halfH = H / 2 / scale;
  const x0 = m.camX - halfW;
  const x1 = m.camX + halfW;
  const y0 = m.camY - halfH;
  const y1 = m.camY + halfH;

  // пасовище: колір + сітка-трава + пучки одним готовим патерном (тайл у кеші), а не лініями щокадру
  ctx.fillStyle = pastureTile(ctx, theme, scale * dpr) ?? theme.bg;
  ctx.fillRect(0, 0, world, world);
  // межа світу
  ctx.strokeStyle = theme.dark ? "rgba(200,255,200,0.35)" : "rgba(60,100,40,0.55)";
  ctx.lineWidth = 6 / scale;
  ctx.strokeRect(0, 0, world, world);

  // їжа: розмір із сервера (піврозмір x2); на віддаленій камері - не менше FOOD_MIN_PX на екрані й без погойдування
  const far = scale < FAR_SCALE;
  const fsz = Math.max(2 * (m.cfg.foodRadius ?? 8.5), FOOD_MIN_PX / scale);
  const pad = fsz * 1.8;
  const sprites = [foodSprite(0, theme.dark), foodSprite(1, theme.dark), foodSprite(2, theme.dark), foodSprite(3, theme.dark)];
  for (const f of m.foods.values()) {
    if (f.x < x0 - pad || f.x > x1 + pad || f.y < y0 - pad || f.y > y1 + pad) continue;
    const s = far ? fsz : fsz * (1 + Math.sin(o.time * 2 + f.id) * 0.06);
    // шерсть трохи більша за траву: це зрізана маса, її видно
    const sz = f.kind === 3 ? s * 1.5 : s;
    ctx.drawImage(sprites[f.kind] ?? sprites[0], f.x - sz / 2, f.y - sz / 2, sz, sz);
  }
  // кинута маса
  ctx.fillStyle = theme.dark ? "#d8f09a" : "#8ab83a";
  for (const b of m.blobs.values()) {
    circle(ctx, b.x, b.y, 7);
    ctx.fill();
  }

  // бонуси: помітні, зі світінням - один готовий спрайт (свічення + диск + іконка), пульсація - масштабом
  for (const b of m.bonuses) {
    if (b.x < x0 - 80 || b.x > x1 + 80 || b.y < y0 - 80 || b.y > y1 + 80) continue;
    const pulse = 1 + Math.sin(o.time * 4 + b.id) * 0.12;
    const sz = BONUS_WORLD_SIZE * pulse;
    ctx.drawImage(bonusFullSprite(b.kind, BONUS_COLOR[b.kind] ?? "#fff", BONUS_ICON[b.kind] ?? "?", theme.dark), b.x - sz / 2, b.y - sz / 2, sz, sz);
  }

  // хвилі «Ножиць»: кільце, що розходиться, ножиці, що клацають, і клаптики шерсті, що розлітаються
  for (let i = m.scissorsWaves.length - 1; i >= 0; i--) {
    const w = m.scissorsWaves[i];
    const k = (m.localNow - w.t0) / SCISSORS_WAVE_MS;
    if (k >= 1) {
      m.scissorsWaves.splice(i, 1);
      continue;
    }
    if (k < 0 || w.x < x0 - w.r || w.x > x1 + w.r || w.y < y0 - w.r || w.y > y1 + w.r) continue;
    const ease = 1 - (1 - k) * (1 - k);
    const rr = w.r * ease;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.drawImage(scissorsRingSprite(), w.x - rr, w.y - rr, rr * 2, rr * 2);
    // клацання: 3 рази відкрито-закрито за перші ~70% анімації
    const open = k < 0.7 && Math.floor(k * 6) % 2 === 0;
    const ss = Math.min(w.r * 0.7, 150) * (0.8 + 0.4 * Math.min(1, k * 4));
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    ctx.drawImage(scissorsSprite(open), w.x - ss / 2, w.y - ss / 2, ss, ss);
    // клаптики: фіксовані кути, летять до краю хвилі й гаснуть
    const tuft = foodSprite(3, theme.dark);
    const ts = Math.max(18, w.r * 0.12);
    ctx.globalAlpha = 1 - k;
    for (let j = 0; j < SCISSORS_TUFTS; j++) {
      const a = (j / SCISSORS_TUFTS) * TAU + j * 0.7;
      const d = w.r * (0.25 + 0.75 * ease) * (0.7 + 0.3 * ((j * 37) % 10) / 10);
      ctx.drawImage(tuft, w.x + Math.cos(a) * d - ts / 2, w.y + Math.sin(a) * d - ts / 2 - k * 20, ts, ts);
    }
    ctx.globalAlpha = 1;
  }

  // зірки «Зорепаду»: на землі спершу тінь-мітка, потім зірка падає зверху (кешовані спрайти, без обчислень форми)
  for (const s of m.stars.values()) {
    const R = STAR_WORLD_R;
    if (s.x < x0 - R * 2 || s.x > x1 + R * 2 || s.y < y0 - STAR_FALL_H - R * 2 || s.y > y1 + R * 2) continue;
    const k = (m.localNow - s.t0) / s.fall;
    if (k < 1) {
      const p = Math.max(0, k);
      const sh = R * (0.55 + 0.75 * p);
      ctx.globalAlpha = 0.35 + 0.65 * p;
      ctx.drawImage(starShadowSprite(), s.x - sh * 1.15, s.y - sh * 1.15, sh * 2.3, sh * 2.3);
      const rise = STAR_FALL_H * (1 - p) * (1 - p);
      ctx.globalAlpha = Math.min(1, p * 4);
      ctx.drawImage(starSprite(), s.x - R * 1.6, s.y - rise - R * 1.6, R * 3.2, R * 3.2);
      ctx.globalAlpha = 1;
    } else {
      const sz = R * 3.2 * (1 + Math.sin(o.time * 5 + s.id) * 0.06);
      ctx.drawImage(starSprite(), s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
  }

  // клітини: малі - під кущами (масиви перевикористовуємо - без виділення памʼяті щокадру)
  VISIBLE.length = 0;
  for (const c of m.cells.values()) {
    const r = m.radiusOf(c.mass);
    if (c.x < x0 - r || c.x > x1 + r || c.y < y0 - r || c.y > y1 + r) continue;
    VISIBLE.push(c);
  }
  VISIBLE.sort(byMass);
  // клетка под кустом: легкая, либо целиком влезшая в более широкий куст
  const hidden = (c: RCell) => {
    if (c.mass < HIDE_UNDER_THORN_MASS) return true;
    const r = m.radiusOf(c.mass);
    for (const t of m.thorns) if (r < m.radiusOf(t.mass) && Math.hypot(c.x - t.x, c.y - t.y) < m.radiusOf(t.mass) - r * 0.5) return true;
    return false;
  };
  const thornKind = m.cfg.map === AUTUMN_MAP_ID ? "autumn" : "green";
  const drawnUnder: boolean[] = [];
  for (let i = 0; i < VISIBLE.length; i++) {
    drawnUnder[i] = hidden(VISIBLE[i]);
    if (drawnUnder[i]) drawCell(ctx, m, VISIBLE[i], o, scale);
  }
  for (const t of m.thorns) {
    const tr = m.radiusOf(t.mass);
    if (t.x < x0 - tr || t.x > x1 + tr || t.y < y0 - tr || t.y > y1 + tr) continue;
    const sz = (tr / THORN_SPRITE_FILL) * 1.0;
    if (far) {
      ctx.drawImage(thornSprite(thornKind), t.x - sz, t.y - sz, sz * 2, sz * 2);
      continue;
    }
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.sin(o.time * 0.8 + t.x) * 0.04);
    ctx.drawImage(thornSprite(thornKind), -sz, -sz, sz * 2, sz * 2);
    ctx.restore();
  }
  for (let i = 0; i < VISIBLE.length; i++) if (!drawnUnder[i]) drawCell(ctx, m, VISIBLE[i], o, scale);

  // клітини, що тануть (з'їдені)
  for (const d of m.dying) {
    const meta = m.players.get(d.pid);
    const r = m.radiusOf(d.mass) * Math.max(0, d.life);
    if (r > 0.5) drawCreatureCached(ctx, meta?.skin ?? 0, d.x, d.y, r, 0, 0, 0, scale, dpr);
  }

  // імена поверх усього: готові спрайти (з обводкою й значком бота), цифри маси - з атласу
  if (o.showNames) {
    for (let i = 0; i < VISIBLE.length; i++) {
      const c = VISIBLE[i];
      const r = m.radiusOf(c.mass);
      if (r * scale < 16) continue;
      const meta = m.players.get(c.pid);
      if (!meta) continue;
      const size = Math.max(11 / scale, Math.min(r * 0.42, 26));
      const spr = nameSprite(meta.name, meta.bot, size * scale * dpr, theme);
      const f = size / spr.px;
      const ty = c.y - r * 0.05;
      ctx.drawImage(spr.cv, c.x - spr.centerX * f, ty - (spr.cv.height * f) / 2, spr.cv.width * f, spr.cv.height * f);
      if (r * scale > 38 && c.pid === m.cfg.pid) drawDigits(ctx, c.mass, c.x, ty + size * 0.95, size * 0.62, scale, dpr, theme);
    }
  }
  ctx.restore();
}

function drawCell(ctx: CanvasRenderingContext2D, m: FlockModel, c: RCell, o: DrawOpts, scale: number) {
  const meta = m.players.get(c.pid);
  const r = m.radiusOf(c.mass);
  const own = c.pid === m.cfg.pid;
  // напрямок мордочки: власна - за вводом, інші - за зсувом до цілі
  let ang = own ? o.selfAngle : Math.atan2(c.vy, c.vx);
  if (!own && c.speed < 8) ang = ((c.id * 2.399) % (Math.PI * 2)) - Math.PI;
  const wobble = Math.min(1, c.speed / 140 + (own ? 0.15 : 0.1));
  const ghost = (c.fx & FX_GHOST) !== 0;
  const paused = (c.fx & FX_PAUSED) !== 0;
  if (ghost) ctx.globalAlpha = 0.45;
  if (paused) ctx.globalAlpha = 0.42;
  if ((c.fx & FX_SPEED) !== 0) {
    ctx.strokeStyle = "rgba(255,210,74,0.7)";
    ctx.lineWidth = r * 0.08;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(c.x - Math.cos(ang) * r * (1.05 + i * 0.22), c.y - Math.sin(ang) * r * (1.05 + i * 0.22) - r * 0.2);
      ctx.lineTo(c.x - Math.cos(ang) * r * (1.4 + i * 0.22), c.y - Math.sin(ang) * r * (1.4 + i * 0.22) - r * 0.2);
      ctx.stroke();
    }
  }
  drawCreatureCached(ctx, meta?.skin ?? 0, c.x, c.y, r, ang, c.phase, wobble, scale, o.dpr, o.time);
  if ((c.fx & FX_FROZEN) !== 0) {
    // лід: холодна заливка, світла кромка й зовнішнє «сяйво» - видно здалеку
    ctx.fillStyle = "rgba(150,222,255,0.58)";
    circle(ctx, c.x, c.y, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = r * 0.07;
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,205,255,0.55)";
    ctx.lineWidth = Math.max(2 / scale, r * 0.09);
    circle(ctx, c.x, c.y, r * 1.14);
    ctx.stroke();
    // власна заморожена клітина: секунди до кінця заморозки просто на овечці
    if (own) {
      const left = m.effects.find((e) => e.kind === "freeze")?.remainingMs ?? 0;
      if (left > 0) drawDigits(ctx, Math.ceil(left / 1000), c.x, c.y, Math.max(r * 0.7, 18 / scale), scale, o.dpr, o.theme);
    }
  }
  if ((c.fx & FX_SHIELD) !== 0) {
    const pulse = 1 + Math.sin(o.time * 6) * 0.03;
    ctx.strokeStyle = "rgba(92,184,255,0.9)";
    ctx.lineWidth = Math.max(2 / scale, r * 0.07);
    circle(ctx, c.x, c.y, r * 1.12 * pulse);
    ctx.stroke();
    ctx.fillStyle = "rgba(92,184,255,0.14)";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (paused) drawPauseBadge(ctx, m, c, r, o, scale);
}

/** Іконка паузи й таймер над овечкою, що чекає на повернення гравця. */
function drawPauseBadge(ctx: CanvasRenderingContext2D, m: FlockModel, c: RCell, r: number, o: DrawOpts, scale: number) {
  const left = m.pauseLeftMs(c.pid);
  const size = Math.max(r * 0.55, 13 / scale);
  const cy = c.y - r - size * 0.9;
  ctx.fillStyle = o.theme.dark ? "rgba(20,32,26,0.85)" : "rgba(255,255,255,0.9)";
  circle(ctx, c.x, cy, size);
  ctx.fill();
  ctx.fillStyle = o.theme.dark ? "#f4fff0" : "#2a4a2a";
  const bw = size * 0.22;
  const bh = size * 0.8;
  ctx.fillRect(c.x - bw * 1.45, cy - bh / 2, bw, bh);
  ctx.fillRect(c.x + bw * 0.45, cy - bh / 2, bw, bh);
  if (left > 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${size * 0.95}px system-ui, sans-serif`;
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.28;
    ctx.strokeStyle = o.theme.nameStroke;
    ctx.fillStyle = o.theme.nameFill;
    const txt = `${Math.ceil(left / 1000)}`;
    ctx.strokeText(txt, c.x, cy - size * 1.5);
    ctx.fillText(txt, c.x, cy - size * 1.5);
  }
}

/** Мінікарта: світ у квадраті `size` px; гравці - точки за масою, ти - з обідком. */
export function drawMinimap(ctx: CanvasRenderingContext2D, m: FlockModel, size: number, dpr: number, baseTheme: Theme) {
  const theme = mapTheme(baseTheme, m.cfg.map);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = theme.dark ? "rgba(18,34,24,0.72)" : "rgba(235,248,225,0.78)";
  ctx.fillRect(0, 0, size, size);
  const k = size / 256;
  for (const p of m.board.map) {
    const own = p.pid === m.cfg.pid;
    if (own) continue; // свою точку малюємо нижче з живих координат, а не з 1-секундного знімка
    const meta = m.players.get(p.pid);
    const r = Math.max(1.6, Math.min(6, p.size / 14));
    ctx.fillStyle = meta?.bot ? "rgba(120,130,125,0.8)" : "rgba(235,120,120,0.9)";
    circle(ctx, p.x * k, p.y * k, r);
    ctx.fill();
  }
  const w = m.cfg.world;
  ctx.fillStyle = "#ffd24a";
  circle(ctx, (m.camX / w) * size, (m.camY / w) * size, 3.4);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // рамка видимої області
  const s = size / w;
  ctx.strokeStyle = theme.dark ? "rgba(255,255,255,0.5)" : "rgba(40,70,30,0.6)";
  ctx.lineWidth = 1;
  const sa = Math.sqrt(m.aspect);
  const vw = m.camR * sa;
  const vh = m.camR / sa;
  ctx.strokeRect((m.camX - vw) * s, (m.camY - vh) * s, vw * 2 * s, vh * 2 * s);
}
