/**
 * Визуал «Ветра» и «Сопілки пастуха»: всё из кэшированных спрайтов (создаются один раз), без shadowBlur и без градиентов в кадре.
 * Ветер рисуется поверх сцены в экранных координатах, сопілка - в мировых (под клетками).
 */
import type { FlockModel, RCell } from "./flockModel";
import { FX_PAUSED, FX_PIPE, FX_SHIELD } from "./flockProtocol";

const TAU = Math.PI * 2;

const cache = new Map<string, HTMLCanvasElement>();
function sprite(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d");
    if (c) draw(c);
    cache.set(key, cv);
  }
  return cv;
}

/** Полупрозрачный росчерк ветра: тонкая полоса с мягкими концами. */
const streakSprite = () =>
  sprite("wind-streak", 160, 8, (c) => {
    const g = c.createLinearGradient(0, 0, 160, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(80, 4, 80, 2.2, 0, 0, TAU);
    c.fill();
  });

const PETALS = ["#ffb3d1", "#ffffff", "#ffd1e6", "#fff0a8"];
const petalSprite = (i: number) =>
  sprite(`wind-petal-${i % PETALS.length}`, 20, 20, (c) => {
    c.translate(10, 10);
    c.fillStyle = PETALS[i % PETALS.length];
    c.strokeStyle = "rgba(190,90,130,0.6)";
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(0, 0, 8, 4.6, 0.5, 0, TAU);
    c.fill();
    c.stroke();
  });

const LEAVES: [string, string][] = [["#f2c230", "#a8741a"], ["#e8892a", "#8a4a14"], ["#d6452f", "#6e1d10"], ["#b5381f", "#5a1408"]];
const leafSprite = (i: number) =>
  sprite(`wind-leaf-${i % LEAVES.length}`, 28, 20, (c) => {
    const [fill, vein] = LEAVES[i % LEAVES.length];
    c.translate(14, 10);
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(-11, 0);
    c.quadraticCurveTo(0, -7.5, 11, 0);
    c.quadraticCurveTo(0, 7.5, -11, 0);
    c.fill();
    c.strokeStyle = vein;
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(-11, 0);
    c.lineTo(8, 0);
    c.stroke();
  });

/** Снежный вихрь: мягкое белое пятнышко (радиальный градиент рисуется один раз в спрайт). */
const snowSprite = () =>
  sprite("wind-snow", 24, 24, (c) => {
    const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(12, 12, 12, 0, TAU);
    c.fill();
  });

const COUNT = 26;

/**
 * Ветер поверх сцены. `map`: 0 луг (лепестки), 1 гай (листья), 2 мороз (снежные вихри). При «уменьшить движение» -
 * только лёгкое затемнение (стрелку и текст показывает HUD).
 */
export function drawWindOverlay(ctx: CanvasRenderingContext2D, m: FlockModel, W: number, H: number, time: number, reduce: boolean) {
  const st = m.windStatus();
  if (!st || st.phase !== "active") return;
  const w = m.wind;
  if (!w) return;
  // плавное появление за первую секунду и угасание в последнюю
  const fadeIn = Math.min(1, (m.localNow - w.startAt) / 1000);
  const fadeOut = Math.min(1, st.leftMs / 1000);
  const k = Math.max(0, Math.min(fadeIn, fadeOut));
  ctx.fillStyle = `rgba(40,60,90,${(0.07 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  if (reduce) return;
  const dx = Math.cos(st.angle);
  const dy = Math.sin(st.angle);
  const px = -dy;
  const py = dx;
  const D = Math.hypot(W, H);
  const map = m.cfg.map ?? 0;
  for (let i = 0; i < COUNT; i++) {
    const seed = (i * 0.61803398875) % 1;
    const seed2 = (i * 0.38196601125 + 0.17) % 1;
    const t = (time * (0.22 + seed2 * 0.2) + seed) % 1;
    const along = (t - 0.5) * D * 1.15;
    const across = (seed2 - 0.5) * D;
    const cx = W / 2 + dx * along + px * across;
    const cy = H / 2 + dy * along + py * across;
    const edge = Math.sin(t * Math.PI);
    if (i % 2 === 0) {
      // росчерк: вытянут вдоль ветра
      const len = 90 + seed * 110;
      ctx.globalAlpha = 0.5 * k * edge;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(st.angle);
      ctx.drawImage(streakSprite(), -len / 2, -3, len, 6);
      ctx.restore();
    } else {
      // частицы карты: чуть покачиваются поперёк ветра
      const wob = Math.sin(time * 3 + i) * 10;
      const x = cx + px * wob;
      const y = cy + py * wob;
      ctx.globalAlpha = 0.9 * k * edge;
      if (map === 2) {
        const s = 10 + seed * 12;
        ctx.drawImage(snowSprite(), x - s / 2, y - s / 2, s, s);
      } else if (map === 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * (1 + seed) + i);
        ctx.drawImage(leafSprite(i), -12, -8, 24, 16);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * (1.5 + seed) + i);
        ctx.drawImage(petalSprite(i), -8, -8, 16, 16);
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- «Сопілка пастуха» ----------
const waveSprite = () =>
  sprite("pipe-wave", 128, 128, (c) => {
    // кольцо радиуса: тонкая золотая линия и мягкая заливка у края (градиент рисуется один раз)
    const g = c.createRadialGradient(64, 64, 40, 64, 64, 62);
    g.addColorStop(0, "rgba(255,214,102,0)");
    g.addColorStop(0.85, "rgba(255,214,102,0.22)");
    g.addColorStop(1, "rgba(255,214,102,0.55)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(64, 64, 62, 0, TAU);
    c.fill();
  });

const noteSprite = (kind: number) =>
  sprite(`pipe-note-${kind}`, 28, 32, (c) => {
    c.fillStyle = "#ffcf4a";
    c.strokeStyle = "#8a5a10";
    c.lineWidth = 1.6;
    c.lineCap = "round";
    c.beginPath();
    c.ellipse(9, 24, 5.4, 4, -0.4, 0, TAU);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(13.6, 22.6);
    c.lineTo(13.6, 5);
    c.stroke();
    if (kind % 2) {
      c.beginPath();
      c.moveTo(13.6, 5);
      c.quadraticCurveTo(22, 8, 20, 16);
      c.stroke();
    } else {
      c.fillStyle = "#ffcf4a";
      c.beginPath();
      c.ellipse(21, 20, 4.4, 3.4, -0.4, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(25, 19);
      c.lineTo(25, 4);
      c.moveTo(13.6, 5);
      c.lineTo(25, 4);
      c.stroke();
    }
  });

const OWNERS: RCell[] = [];

/**
 * Сопілка в мировых координатах (под клетками): у владельца мягкая волна радиуса и ноты по кругу, от притягиваемых к владельцу
 * тонкая линия с бегущей ноткой. Притянутая СВОЯ клетка помечает `m.pipeCalledAt` (HUD покажет «Тебе кличе сопілка!»).
 */
export function drawPipeEffects(ctx: CanvasRenderingContext2D, m: FlockModel, cells: readonly RCell[], time: number, scale: number, reduce: boolean) {
  const radiusCells = m.cfg.pipeRadius ?? 0;
  if (!radiusCells) return;
  OWNERS.length = 0;
  for (const c of cells) if ((c.fx & FX_PIPE) !== 0 && (c.fx & FX_PAUSED) === 0) OWNERS.push(c);
  if (OWNERS.length === 0) return;
  for (const o of OWNERS) {
    const r = m.radiusOf(o.mass);
    const R = r * radiusCells;
    // волна: кольцо расходится от владельца к краю радиуса и гаснет
    const ph = reduce ? 0.85 : (time * 0.7 + o.id * 0.37) % 1;
    ctx.globalAlpha = reduce ? 0.5 : 1 - ph;
    const wr = R * (0.35 + 0.65 * ph);
    ctx.drawImage(waveSprite(), o.x - wr, o.y - wr, wr * 2, wr * 2);
    // ноты по кругу вокруг владельца
    if (!reduce) {
      ctx.globalAlpha = 0.95;
      const ns = Math.max(14, r * 0.5);
      for (let i = 0; i < 4; i++) {
        const a = time * 1.2 + (i / 4) * TAU;
        const rr = r * 1.35 + Math.sin(time * 3 + i) * r * 0.08;
        ctx.drawImage(noteSprite(i), o.x + Math.cos(a) * rr - ns / 2, o.y + Math.sin(a) * rr - ns / 2, ns * 0.9, ns);
      }
    }
    ctx.globalAlpha = 1;
    // притягиваемые: меньшие клетки в радиусе (кроме паузы и щита)
    for (const c of cells) {
      if (c.pid === o.pid || c.mass >= o.mass || (c.fx & (FX_PAUSED | FX_SHIELD)) !== 0) continue;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > R || d < r) continue;
      if (c.pid === m.cfg.pid) m.pipeCalledAt = m.localNow;
      if (reduce) continue;
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = "#ffcf4a";
      ctx.lineWidth = Math.max(1, 1.6 / scale);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
      const t = (time * 1.1 + c.id * 0.173) % 1;
      const ns = Math.max(12, 16 / scale);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(noteSprite(c.id), c.x + dx * t - ns / 2, c.y + dy * t - ns / 2, ns * 0.9, ns);
    }
    ctx.globalAlpha = 1;
  }
}
