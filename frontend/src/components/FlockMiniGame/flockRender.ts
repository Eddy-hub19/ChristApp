import type { FlockModel, RCell } from "./flockModel";
import { FX_FROZEN, FX_GHOST, FX_SHIELD, FX_SPEED } from "./flockProtocol";
import { skinOf, type Skin } from "./flockSkins";
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

function bonusSprite(kind: string) {
  return sprite(`bonus${kind}`, 72, (c, s) => {
    c.font = `${kind === "double" ? 30 : 38}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#1b2a14";
    c.fillText(BONUS_ICON[kind] ?? "?", s / 2, s / 2 + 2);
  });
}

// ---------- істоти ----------
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
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

export function drawCreature(c: CanvasRenderingContext2D, skin: Skin, x: number, y: number, r: number, ang: number, phase: number, wobble: number) {
  c.save();
  c.translate(x, y);
  // покачування: легкий нахил і "дихання"
  const sq = 1 + Math.sin(phase * 2) * 0.035 * wobble;
  c.rotate(Math.sin(phase) * 0.07 * wobble);
  c.scale(sq, 2 - sq);

  const fwdX = Math.cos(ang);
  const fwdY = Math.sin(ang);
  const dark = "rgba(0,0,0,0.16)";

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
    c.fillStyle = dark;
    circle(c, r * 0.05, r * 0.07, r * 0.98);
    c.fill();
    c.fillStyle = skin.fur;
    for (let i = 0; i < bumps; i++) {
      const a = (i / bumps) * TAU + 0.2;
      circle(c, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, br);
      c.fill();
    }
    circle(c, 0, 0, r * 0.82);
    c.fill();
    c.fillStyle = skin.light;
    c.globalAlpha = 0.65;
    circle(c, -r * 0.2, -r * 0.25, r * 0.5);
    c.fill();
    c.globalAlpha = 1;
    if (skin.kind === "ram") {
      c.strokeStyle = skin.accent;
      c.lineWidth = Math.max(2, r * 0.13);
      c.lineCap = "round";
      for (const side of [-1, 1]) {
        const a = ang + side * 1.55;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.27, a - 1.6, a + 3.4);
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
  c.restore();
}

function drawThorn(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(t * 0.8 + x) * 0.04);
  const spikes = 16;
  c.fillStyle = "#2f7a3a";
  c.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.82;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.fillStyle = "#47a357";
  circle(c, 0, 0, r * 0.72);
  c.fill();
  c.fillStyle = "#5fbf6e";
  circle(c, -r * 0.2, -r * 0.22, r * 0.38);
  c.fill();
  c.fillStyle = "#e9577f";
  for (const [dx, dy] of [[0.25, 0.2], [-0.3, 0.3], [0.05, -0.35]]) {
    circle(c, dx * r, dy * r, r * 0.07);
    c.fill();
  }
  c.restore();
}

function hash(a: number, b: number) {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
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

  // пасовище
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, world, world);

  // сітка-трава + рідкі пучки
  const G = 90;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1.2 / scale;
  ctx.beginPath();
  const gx0 = Math.max(0, Math.floor(x0 / G) * G);
  const gx1 = Math.min(world, x1);
  const gy0 = Math.max(0, Math.floor(y0 / G) * G);
  const gy1 = Math.min(world, y1);
  for (let gx = gx0; gx <= gx1; gx += G) {
    ctx.moveTo(gx, Math.max(0, y0));
    ctx.lineTo(gx, Math.min(world, y1));
  }
  for (let gy = gy0; gy <= gy1; gy += G) {
    ctx.moveTo(Math.max(0, x0), gy);
    ctx.lineTo(Math.min(world, x1), gy);
  }
  ctx.stroke();
  ctx.strokeStyle = theme.tuft;
  ctx.lineWidth = 2 / scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let gx = gx0; gx < gx1; gx += G) {
    for (let gy = gy0; gy < gy1; gy += G) {
      const h = hash(gx / G, gy / G);
      if (h > 0.4) continue;
      const tx = gx + 20 + h * 120;
      const ty = gy + 20 + hash(gy / G, gx / G) * 60;
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - 4, ty - 9);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 1, ty - 11);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 5, ty - 8);
    }
  }
  ctx.stroke();
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

  // бонуси: помітні, зі світінням
  for (const b of m.bonuses) {
    if (b.x < x0 - 80 || b.x > x1 + 80 || b.y < y0 - 80 || b.y > y1 + 80) continue;
    const pulse = 1 + Math.sin(o.time * 4 + b.id) * 0.12;
    const color = BONUS_COLOR[b.kind] ?? "#fff";
    const g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, 44 * pulse);
    g.addColorStop(0, color);
    g.addColorStop(0.45, color + "99");
    g.addColorStop(1, color + "00");
    ctx.fillStyle = g;
    circle(ctx, b.x, b.y, 44 * pulse);
    ctx.fill();
    ctx.fillStyle = theme.dark ? "#f2f5ea" : "#ffffff";
    circle(ctx, b.x, b.y, 17);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    const s = 26;
    ctx.drawImage(bonusSprite(b.kind), b.x - s / 2, b.y - s / 2, s, s);
  }

  // клітини: малі - під кущами
  const all: RCell[] = [];
  for (const c of m.cells.values()) {
    const r = m.radiusOf(c.mass);
    if (c.x < x0 - r || c.x > x1 + r || c.y < y0 - r || c.y > y1 + r) continue;
    all.push(c);
  }
  all.sort((a, b) => a.mass - b.mass);
  const small = all.filter((c) => c.mass < HIDE_UNDER_THORN_MASS);
  const big = all.filter((c) => c.mass >= HIDE_UNDER_THORN_MASS);
  for (const c of small) drawCell(ctx, m, c, o, scale);
  for (const t of m.thorns) {
    const tr = m.radiusOf(t.mass);
    if (t.x < x0 - tr || t.x > x1 + tr || t.y < y0 - tr || t.y > y1 + tr) continue;
    drawThorn(ctx, t.x, t.y, tr, o.time);
  }
  for (const c of big) drawCell(ctx, m, c, o, scale);

  // клітини, що тануть (з'їдені)
  for (const d of m.dying) {
    const meta = m.players.get(d.pid);
    const r = m.radiusOf(d.mass) * Math.max(0, d.life);
    if (r > 0.5) drawCreature(ctx, skinOf(meta?.skin ?? 0), d.x, d.y, r, 0, 0, 0);
  }

  // імена поверх усього
  if (o.showNames) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const c of all) {
      const r = m.radiusOf(c.mass);
      if (r * scale < 16) continue;
      const meta = m.players.get(c.pid);
      if (!meta) continue;
      const size = Math.max(11 / scale, Math.min(r * 0.42, 26));
      ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = theme.nameStroke;
      ctx.fillStyle = theme.nameFill;
      const ty = c.y - r * 0.05 + r * 0.0;
      ctx.globalAlpha = meta.bot ? 0.88 : 1;
      ctx.strokeText(meta.name, c.x, ty);
      ctx.fillText(meta.name, c.x, ty);
      if (meta.bot) {
        // непомітний значок бота: маленька "кнопка-вушко" праворуч від імені
        const w = ctx.measureText(meta.name).width;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = theme.nameFill;
        circle(ctx, c.x + w / 2 + size * 0.45, ty, size * 0.17);
        ctx.fill();
        ctx.lineWidth = size * 0.07;
        ctx.strokeStyle = theme.nameStroke;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (r * scale > 38 && c.pid === m.cfg.pid) {
        ctx.font = `600 ${size * 0.62}px system-ui, sans-serif`;
        ctx.lineWidth = size * 0.14;
        ctx.strokeText(String(Math.round(c.mass)), c.x, ty + size * 0.95);
        ctx.fillText(String(Math.round(c.mass)), c.x, ty + size * 0.95);
      }
    }
  }
  ctx.restore();
}

function drawCell(ctx: CanvasRenderingContext2D, m: FlockModel, c: RCell, o: DrawOpts, scale: number) {
  const meta = m.players.get(c.pid);
  const skin = skinOf(meta?.skin ?? 0);
  const r = m.radiusOf(c.mass);
  const own = c.pid === m.cfg.pid;
  // напрямок мордочки: власна - за вводом, інші - за зсувом до цілі
  let ang = own ? o.selfAngle : Math.atan2(c.ty - c.y, c.tx - c.x);
  if (!own && c.speed < 8) ang = ((c.id * 2.399) % (Math.PI * 2)) - Math.PI;
  const wobble = Math.min(1, c.speed / 140 + (own ? 0.15 : 0.1));
  const ghost = (c.fx & FX_GHOST) !== 0;
  if (ghost) ctx.globalAlpha = 0.45;
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
  drawCreature(ctx, skin, c.x, c.y, r, ang, c.phase, wobble);
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
