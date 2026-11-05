import type { FlockModel } from "./flockModel";
import { BURN_MS } from "./flockLava";
import { FALL_MS } from "./flockSkyRender";
import { drawCreatureCached } from "./flockSprites";

/**
 * Показ смерти перед карточкой итогов: игрок погиб -> камера остаётся на месте гибели, мир вокруг рисуется дальше ->
 * анимация по причине -> плавное затемнение -> карточка. Сервер ничего не ждёт (рубины, рекорды, возрождение не зависят от анимации):
 * он лишь ещё ~4 с шлёт состояние мира вокруг места гибели (FLOCK_CONFIG.deathViewMs).
 * Лава и падение с неба используют уже существующие анимации (`lavaBurns`, `falls`), здесь мы только дожидаемся их конца.
 */
export const DEATH_ANIM = {
  /** Общая длительность анимации «съели» / круга / запасной (мс), включая затемнение в конце. */
  ms: 2500,
  /** Затемнение перед карточкой (мс). */
  fadeMs: 700,
  /** Раньше этого момента нажатие не пропускает анимацию (мс). */
  skipAfterMs: 400,
  /** «Уменьшить движение»: только короткое затухание (мс). */
  reducedMs: 600,
  /** Не дольше этого камера смещается к убийце, если его не видно (мс). */
  camShiftMs: 1000,
  /** Запас после существующих анимаций лавы / падения (мс). */
  afterExistingMs: 300,
  /** Насколько затемняется экран к концу (0..1). */
  dimMax: 0.88,
};

export type DeathKind = "eat" | "boss" | "lava" | "fall" | "zone" | "other";

export interface DeathInfoIn {
  burned?: boolean;
  fell?: boolean;
  zone?: boolean;
  killer?: string | null;
  /** pid убийцы и признак «убийца - Вожак» (сервер: kp, kb). */
  kp?: number;
  kb?: boolean;
}

export interface DeathAnim {
  t0: number;
  kind: DeathKind;
  /** Где и каким погиб: последняя клетка. */
  x: number;
  y: number;
  r: number;
  skin: number;
  killerPid: number;
  killerName: string;
  /** Позиция и радиус убийцы (обновляются, пока он виден). */
  kx: number;
  ky: number;
  kr: number;
  killerSeen: boolean;
  durMs: number;
  fadeMs: number;
  reduced: boolean;
  /** Камера смещается к убийце, пока не больше camShiftMs. */
  camShift: boolean;
  skipped: boolean;
}

export function deathKindOf(info: DeathInfoIn): DeathKind {
  if (info.burned) return "lava";
  if (info.fell) return "fall";
  if (info.zone) return "zone";
  if (info.kp && info.kp > 0) return info.kb ? "boss" : "eat";
  return "other";
}

export function startDeath(m: FlockModel, info: DeathInfoIn, now: number, reduced: boolean): DeathAnim {
  const last = m.lastOwn ?? { x: m.camX, y: m.camY, r: 24, skin: m.players.get(m.cfg.pid)?.skin ?? 0 };
  const kind = deathKindOf(info);
  const killerPid = info.kp ?? 0;
  let kx = last.x;
  let ky = last.y;
  let kr = last.r;
  let seen = false;
  let bestMass = 0;
  for (const c of m.cells.values()) {
    if (c.pid !== killerPid || c.mass <= bestMass) continue;
    bestMass = c.mass;
    kx = c.x;
    ky = c.y;
    kr = m.radiusOf(c.mass);
    seen = true;
  }
  let dur: number = DEATH_ANIM.ms;
  let fade: number = DEATH_ANIM.fadeMs;
  if (kind === "lava") dur = BURN_MS + DEATH_ANIM.afterExistingMs;
  else if (kind === "fall") dur = FALL_MS + DEATH_ANIM.afterExistingMs;
  if (kind === "lava" || kind === "fall") fade = Math.min(fade, Math.round(dur * 0.45));
  if (reduced) {
    dur = DEATH_ANIM.reducedMs;
    fade = dur;
  }
  return {
    t0: now,
    kind,
    x: last.x,
    y: last.y,
    r: last.r,
    skin: last.skin,
    killerPid,
    killerName: info.killer ?? "",
    kx,
    ky,
    kr,
    killerSeen: seen,
    durMs: dur,
    fadeMs: fade,
    reduced,
    camShift: !reduced && (kind === "eat" || kind === "boss") && seen,
    skipped: false,
  };
}

/** Раз в кадр: убийца двигается - следим за ним; если его не видно, плавно смещаем камеру (не дольше camShiftMs). */
export function stepDeath(m: FlockModel, d: DeathAnim, now: number, dt: number) {
  if (d.killerPid > 0) {
    let bestMass = 0;
    for (const c of m.cells.values()) {
      if (c.pid !== d.killerPid || c.mass <= bestMass) continue;
      bestMass = c.mass;
      d.kx = c.x;
      d.ky = c.y;
      d.kr = m.radiusOf(c.mass);
      d.killerSeen = true;
    }
  }
  if (!d.camShift || now - d.t0 > DEATH_ANIM.camShiftMs) return;
  const sa = Math.sqrt(m.aspect || 1);
  const visible = Math.abs(d.kx - m.camX) < m.camR * sa * 0.85 && Math.abs(d.ky - m.camY) < (m.camR / sa) * 0.85;
  if (visible) return;
  const k = 1 - Math.exp(-dt * 4);
  m.camX += (d.kx - m.camX) * k;
  m.camY += (d.ky - m.camY) * k;
}

export const deathElapsed = (d: DeathAnim, now: number) => now - d.t0;
export const deathDone = (d: DeathAnim, now: number) => now - d.t0 >= d.durMs;
/** Можно ли пропустить нажатием. */
export const deathSkippable = (d: DeathAnim, now: number) => now - d.t0 >= DEATH_ANIM.skipAfterMs;

/** Пропуск: короткое быстрое затемнение вместо мгновенного обрыва. */
export function skipDeath(d: DeathAnim, now: number) {
  if (d.skipped) return;
  d.skipped = true;
  d.fadeMs = 250;
  d.durMs = now - d.t0 + 250;
}

/** Прозрачность затемнения 0..dimMax в момент now. */
export function deathDim(d: DeathAnim, now: number): number {
  const left = d.durMs - (now - d.t0);
  if (left >= d.fadeMs) return 0;
  return Math.max(0, Math.min(1, 1 - left / d.fadeMs)) * DEATH_ANIM.dimMax;
}

// ---------- рисование ----------
const TAU = Math.PI * 2;
const ease = (k: number) => 1 - (1 - k) * (1 - k);
const TUFTS = 10;

const labels = new Map<string, HTMLCanvasElement>();
/** Кэшированный спрайт подписи (белый контур, цветной текст); не больше 12 штук. */
function labelSprite(text: string, color: string, px: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${text}|${color}|${px}`;
  const hit = labels.get(key);
  if (hit) return hit;
  if (labels.size > 12) labels.clear();
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const font = `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 16;
  const h = Math.ceil(px * 1.5);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  if (!c) return null;
  c.font = font;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = Math.max(3, px * 0.22);
  c.strokeStyle = "rgba(20,16,30,0.9)";
  c.strokeText(text, w / 2, h / 2);
  c.fillStyle = color;
  c.fillText(text, w / 2, h / 2);
  labels.set(key, cv);
  return cv;
}

/**
 * Анимация поверх мира (мировые координаты). «Съели»: овечка сжимается к убийце и растворяется в клочках шерсти, вокруг убийцы кольцо,
 * над ним подпись. Лава и падение рисуются своими существующими анимациями (здесь ничего). Запасной вариант и круг - растворение на месте.
 * `label` - готовая подпись (переводы), `tuft` - спрайт клочка шерсти (из рендера).
 */
export function drawDeath(ctx: CanvasRenderingContext2D, m: FlockModel, d: DeathAnim, now: number, scale: number, dpr: number, label: string | null, tuft: HTMLCanvasElement | null) {
  const t = now - d.t0;
  const body = Math.max(1, d.durMs - d.fadeMs);
  const p = Math.max(0, Math.min(1, t / body));
  if (d.kind === "lava" || d.kind === "fall") return;
  if (d.reduced) {
    // «уменьшить движение»: овечка просто гаснет на месте
    ctx.globalAlpha = 1 - Math.min(1, t / d.durMs);
    drawCreatureCached(ctx, d.skin, d.x, d.y, d.r, 0, 0, 0, scale, dpr);
    ctx.globalAlpha = 1;
    return;
  }
  const eaten = d.kind === "eat" || d.kind === "boss";
  const toward = eaten ? ease(p) : 0;
  const px = d.x + (d.kx - d.x) * toward;
  const py = d.y + (d.ky - d.y) * toward;
  const k = 1 - ease(p);
  const r = d.r * Math.max(0.02, eaten ? k : 1 - p * 0.35);
  ctx.globalAlpha = eaten ? Math.max(0, 1 - p * p) : Math.max(0, 1 - p);
  drawCreatureCached(ctx, d.skin, px, py, r, 0, 0, 0, scale, dpr);
  // клочки шерсти разлетаются (и тянутся к убийце) и гаснут
  if (tuft) {
    const ts = Math.max(16, d.r * 0.55);
    for (let i = 0; i < TUFTS; i++) {
      const a = (i / TUFTS) * TAU + i * 0.7;
      const spread = d.r * (0.4 + 1.5 * ease(Math.min(1, p * 1.4))) * (0.7 + 0.3 * (((i * 37) % 10) / 10));
      const bx = d.x + Math.cos(a) * spread + (eaten ? (d.kx - d.x) * toward * 0.5 : 0);
      const by = d.y + Math.sin(a) * spread + (eaten ? (d.ky - d.y) * toward * 0.5 : -p * 18);
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.drawImage(tuft, bx - ts / 2, by - ts / 2, ts, ts);
    }
  }
  ctx.globalAlpha = 1;
  if (!eaten) return;
  // кольцо вокруг убийцы (короткое) и подпись над ним
  const red = d.kind === "boss";
  const q = Math.max(0, Math.min(1, (t - 150) / 650));
  if (q > 0 && q < 1) {
    ctx.strokeStyle = red ? `rgba(255,70,70,${0.9 * (1 - q)})` : `rgba(255,230,120,${0.9 * (1 - q)})`;
    ctx.lineWidth = Math.max(3 / scale, d.kr * 0.12 * (1 - q));
    ctx.beginPath();
    ctx.arc(d.kx, d.ky, d.kr * (1.05 + 0.9 * ease(q)), 0, TAU);
    ctx.stroke();
  }
  if (label && t > 250) {
    const fadeIn = Math.min(1, (t - 250) / 250);
    const fadeOut = Math.max(0, Math.min(1, (d.durMs - d.fadeMs * 0.6 - t) / 300));
    const size = Math.max(14 / scale, Math.min(d.kr * 0.55, 42));
    const spr = labelSprite(label, red ? "#ff4d4d" : "#ffffff", Math.max(16, Math.round(size * scale * dpr)));
    if (spr) {
      const f = size / Math.max(1, spr.height / 1.5);
      ctx.globalAlpha = fadeIn * fadeOut;
      ctx.drawImage(spr, d.kx - (spr.width * f) / 2, d.ky - d.kr * 1.45 - spr.height * f, spr.width * f, spr.height * f);
      ctx.globalAlpha = 1;
    }
  }
}

/** Затемнение экрана перед карточкой (экранные координаты). */
export function drawDeathDim(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number) {
  if (alpha <= 0.005) return;
  ctx.fillStyle = `rgba(8,10,22,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}
