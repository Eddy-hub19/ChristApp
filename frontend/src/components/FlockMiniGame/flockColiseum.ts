/**
 * Карта «Арена» (колізей): геометрія з `welcome.coliseum`, палітра й чисті допоміжні функції HUD. Малювання - flockColiseumRender.ts.
 * Сервер і клієнт рахують по одному колу (cx, cy, r); палітра не залежить від теми застосунку.
 */
export const COLISEUM_MAP_ID = 7;
/** Скін тигра-боса (поза NUM_SKINS, як скіни «Вожака»; дзеркало FLOCK_CONFIG.coliseum.tigerSkin). */
export const TIGER_SKIN = 70;
export const isTigerSkin = (id: number) => id === TIGER_SKIN;

/** Геометрія з welcome: коло, ворота (кути в градусах), колони й камені [x, y, r] (лише вигляд). */
export interface ColiseumGeo {
  cx: number;
  cy: number;
  r: number;
  gates: number[];
  gateWidth: number;
  pillars: [number, number, number][];
  stones: [number, number, number][];
  waves: number;
}

export function parseColiseum(raw: unknown): ColiseumGeo | null {
  const g = raw as Partial<ColiseumGeo> | null | undefined;
  if (!g || typeof g.cx !== "number" || typeof g.cy !== "number" || typeof g.r !== "number") return null;
  return {
    cx: g.cx,
    cy: g.cy,
    r: g.r,
    gates: Array.isArray(g.gates) ? g.gates : [],
    gateWidth: g.gateWidth ?? 280,
    pillars: Array.isArray(g.pillars) ? g.pillars : [],
    stones: Array.isArray(g.stones) ? g.stones : [],
    waves: g.waves ?? 5,
  };
}

/** Точка всередині арени (для мінікарти й клієнтських перевірок). */
export const inColiseum = (g: ColiseumGeo, x: number, y: number, margin = 0) => Math.hypot(x - g.cx, y - g.cy) <= g.r - margin;

/** Палітра «Арени»: однакова на обидві теми застосунку. */
export const COLISEUM = {
  sand: "#e2c48a",
  sandDark: "#c9a468",
  sandLight: "#f0d9a6",
  sandSpeck: "rgba(120,80,30,0.22)",
  out: "#241c19",
  wall: "#a89572",
  wallDark: "#6f6048",
  wallLight: "#d2c29c",
  tribune: ["#8d7d62", "#7a6b53", "#675a46", "#54493a"],
  gateDark: "#17110d",
} as const;

// ---------- HUD (чисті функції) ----------
/** Повідомлення `cw` від сервера. */
export interface ColiseumHud {
  ph: 0 | 1 | 2 | 3;
  w: number;
  n: number;
  t: number;
  next?: number;
  tg?: { m: number; M: number };
  tgNext?: boolean;
  e?: ("wave" | "tiger" | "tigerDown")[];
}

/** Частка маси тигра 0..1 для полоски. */
export const tigerFraction = (tg: { m: number; M: number } | undefined) => (tg && tg.M > 0 ? Math.max(0, Math.min(1, tg.m / tg.M)) : 0);

/** Колір полоски: зелений -> жовтий -> червоний за часткою, що лишилась. */
export function tigerBarColor(f: number): string {
  return f > 0.6 ? "#e8872a" : f > 0.3 ? "#e0561f" : "#c4281a";
}

/** «0:07» для таймера до наступної хвилі (мс). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Скільки вовків лишилось із усіх у хвилі: "3/8". */
export const wolvesLabel = (h: ColiseumHud) => `${h.n}/${h.t}`;

/** Мінікарта «Арени»: коло зі стіною, ворота позначені рисками. `size` - сторона квадрата в px. */
export function drawColiseumMinimap(ctx: CanvasRenderingContext2D, g: ColiseumGeo, world: number, size: number) {
  const k = size / world;
  ctx.save();
  ctx.fillStyle = "rgba(36,28,25,0.85)";
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(g.cx * k, g.cy * k, g.r * k, 0, Math.PI * 2);
  ctx.fillStyle = COLISEUM.sand;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.strokeStyle = COLISEUM.wall;
  ctx.stroke();
  ctx.strokeStyle = COLISEUM.gateDark;
  ctx.lineWidth = Math.max(2, size * 0.05);
  for (const deg of g.gates) {
    const a = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(g.cx * k, g.cy * k, g.r * k, a - 0.1, a + 0.1);
    ctx.stroke();
  }
  ctx.restore();
}
