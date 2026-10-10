import type { FlockModel, RCell } from "./flockModel";
import { FX_FROZEN, FX_GHOST, FX_PAUSED, FX_SHIELD, FX_SPEED } from "./flockProtocol";
import { circle, drawCreature } from "./flockCreature";
import { BONUS_WORLD_SIZE, THORN_SPRITE_FILL, bonusFullSprite, drawCreatureCached, drawDigits, nameSprite, pastureTile, thornSprite } from "./flockSprites";

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
};
export const BONUS_ICON: Record<string, string> = Object.fromEntries(Object.entries(BONUS_STYLE).map(([k, v]) => [k, v.icon]));
export const BONUS_COLOR: Record<string, string> = Object.fromEntries(Object.entries(BONUS_STYLE).map(([k, v]) => [k, v.color]));

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

function foodSprite(kind: number, dark: boolean) {
  return sprite(`food${kind}${dark ? "d" : "l"}`, 40, (c, s) => {
    c.translate(s / 2, s / 2);
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
  });
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
  const { width: W, height: H, dpr, theme } = o;
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

  // їжа
  const fsz = 17;
  const pad = 30;
  for (const f of m.foods.values()) {
    if (f.x < x0 - pad || f.x > x1 + pad || f.y < y0 - pad || f.y > y1 + pad) continue;
    const sway = 1 + Math.sin(o.time * 2 + f.id) * 0.06;
    const s = fsz * sway;
    ctx.drawImage(foodSprite(f.kind, theme.dark), f.x - s / 2, f.y - s / 2, s, s);
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

  // клітини: малі - під кущами (масиви перевикористовуємо - без виділення памʼяті щокадру)
  VISIBLE.length = 0;
  for (const c of m.cells.values()) {
    const r = m.radiusOf(c.mass);
    if (c.x < x0 - r || c.x > x1 + r || c.y < y0 - r || c.y > y1 + r) continue;
    VISIBLE.push(c);
  }
  VISIBLE.sort(byMass);
  for (let i = 0; i < VISIBLE.length; i++) if (VISIBLE[i].mass < HIDE_UNDER_THORN_MASS) drawCell(ctx, m, VISIBLE[i], o, scale);
  for (const t of m.thorns) {
    const tr = m.radiusOf(t.mass);
    if (t.x < x0 - tr || t.x > x1 + tr || t.y < y0 - tr || t.y > y1 + tr) continue;
    const sz = (tr / THORN_SPRITE_FILL) * 1.0;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.sin(o.time * 0.8 + t.x) * 0.04);
    ctx.drawImage(thornSprite(), -sz, -sz, sz * 2, sz * 2);
    ctx.restore();
  }
  for (let i = 0; i < VISIBLE.length; i++) if (VISIBLE[i].mass >= HIDE_UNDER_THORN_MASS) drawCell(ctx, m, VISIBLE[i], o, scale);

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
  drawCreatureCached(ctx, meta?.skin ?? 0, c.x, c.y, r, ang, c.phase, wobble, scale, o.dpr);
  if ((c.fx & FX_FROZEN) !== 0) {
    ctx.fillStyle = "rgba(170,230,255,0.5)";
    circle(ctx, c.x, c.y, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = r * 0.06;
    ctx.stroke();
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
export function drawMinimap(ctx: CanvasRenderingContext2D, m: FlockModel, size: number, dpr: number, theme: Theme) {
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
