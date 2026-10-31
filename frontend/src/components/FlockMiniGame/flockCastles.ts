/**
 * Режим «Замки»: типи подій сервера, геометрія карти «Лес и озеро» (та сама чиста математика, що на сервері),
 * кольори команд і детермінований декор (з seed). Нічого тут не малює.
 */

export const CASTLES_MAP_ID = 4;
export type Team = 1 | 2;
/** Кольори команд: 1 - «Вівці» (синій), 2 - «Вовки» (червоний). */
export const TEAM_COLOR: Record<Team, { main: string; dark: string; light: string }> = {
  1: { main: "#3b82f6", dark: "#1d4ed8", light: "#93c5fd" },
  2: { main: "#ef4444", dark: "#b91c1c", light: "#fca5a5" },
};
/** Безкоштовні скіни сторін (дзеркало серверних списків). */
export const SHEEP_SIDE_SKINS: readonly number[] = [0, 1, 2, 3, 4, 5];
export const WOLF_SIDE_SKINS: readonly number[] = [8, 9, 37, 38, 39, 40];
export const sideSkins = (team: Team) => (team === 1 ? SHEEP_SIDE_SKINS : WOLF_SIDE_SKINS);

export interface CastleCfg {
  team: Team;
  river: { hw: number; bridges: number[]; bw: number; over: number };
  castles: { team: Team; x: number; y: number; r: number }[];
  steal: number;
  speed: number;
  mass: number;
  carrySlow: number;
  waterSlow: number;
  seed: number;
  world: number;
}

/** Числа режиму з /flock/me (config.game.castles). */
export interface CastlesGameConfig {
  hp?: number;
  damage?: number;
  deliverToWin?: number;
  matchMs?: number;
  minMatchMs?: number;
  countdownMs?: number;
  teamSize?: number;
  maxTeamSize?: number;
  stealHoldMs?: number;
  carrySlowPct?: number;
  waterSlowPct?: number;
  respawnMs?: number;
  respawnShieldMs?: number;
  lyingReturnMs?: number;
  bushRevealRadius?: number;
  reward?: number;
  dailyWinLimit?: number;
  botOnlyRewardLimit?: number;
  speed?: number;
  mass?: number;
  afkMinActions?: number;
}

/** Повідомлення `cm` (≈5 Гц). */
export interface CastleMsg {
  ph: 0 | 1 | 2 | 3;
  left: number;
  sc: [number, number];
  hp: [number, number];
  st: [number, number];
  hu: [number, number];
  tm: [number, number][];
  cr: [number, number, number, number][];
  ls: [number, number, number, number, number][];
  al: [number, number, number][];
  sp: number;
  rs: number;
  ev?: { k: "steal" | "deliver" | "drop" | "return" | "castle" | "win" | "lose"; p: number; t: number }[];
}

export type CastleEvent = NonNullable<CastleMsg["ev"]>[number];

/** Підсумок матчу (подія `te`). */
export interface CastleEndInfo {
  win: 0 | 1 | 2;
  sc: [number, number];
  hp: [number, number];
  rows: { n: string; t: number; b: 0 | 1; d: number; c: number; s: number }[];
  restartMs: number;
  you: { team: Team; pid: number };
}

/** Результат нагороди (подія `tr`). */
export interface CastleRewardInfo {
  rubies: number;
  balance?: number;
  reason?: "lose" | "draw" | "short" | "afk" | "daily" | "botLimit";
  botOnly: boolean;
  botLeft: number;
  botLimit: number;
}

/** Відповідь GET /flock/castles/lobby. */
export interface CastlesLobby {
  enabled: boolean;
  sheep: number;
  wolves: number;
  teamSize: number;
  maxTeamSize: number;
  phase: 0 | 1 | 2 | 3;
  leftMs: number;
}

const SQ = Math.SQRT2;

export const riverD = (x: number, y: number) => (x - y) / SQ;
export const riverS = (x: number, y: number) => (x + y) / SQ;

/** Точка на мосту (поперек ріки |d| < hw+over, вздовж - у межах bw/2 від центра моста). */
export function onBridge(g: CastleCfg["river"], x: number, y: number): boolean {
  if (Math.abs(riverD(x, y)) >= g.hw + g.over) return false;
  const s = riverS(x, y);
  for (const b of g.bridges) if (Math.abs(s - b) < g.bw / 2) return true;
  return false;
}

/** Точка у воді (смуга ріки без мостів). */
export function inWater(g: CastleCfg["river"], x: number, y: number): boolean {
  if (Math.abs(riverD(x, y)) >= g.hw) return false;
  const s = riverS(x, y);
  for (const b of g.bridges) if (Math.abs(s - b) < g.bw / 2) return false;
  return true;
}

export const castleOf = (c: CastleCfg, team: Team) => c.castles.find((k) => k.team === team) ?? c.castles[0];

function rng(seed: number) {
  let s = (Math.floor(seed) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export type DecorKind = "tree" | "rock" | "barrel" | "fence" | "puddle" | "flower" | "tuft";
export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  /** Розмір (радіус / довжина) і варіант (відтінок, кут). */
  s: number;
  v: number;
}

const decorCache = new Map<number, Decor[]>();

/** Декор карти з seed: не у воді, не на мостах і не в зонах замків, не в кущах. Рахується один раз. */
export function decorFor(c: CastleCfg, thorns: { x: number; y: number; mass: number }[], radiusK: number): Decor[] {
  const key = c.seed * 31 + thorns.length;
  const hit = decorCache.get(key);
  if (hit) return hit;
  const r = rng(c.seed);
  const out: Decor[] = [];
  const W = c.world;
  const riverPad = c.river.hw + c.river.over + 60;
  const free = (x: number, y: number, rad: number): boolean => {
    if (x < 70 || y < 70 || x > W - 70 || y > W - 70) return false;
    if (Math.abs(riverD(x, y)) < riverPad + rad) {
      // біля ріки: лише подалі від води й підходів до мостів
      if (Math.abs(riverD(x, y)) < c.river.hw + rad + 50) return false;
      const s = riverS(x, y);
      for (const b of c.river.bridges) if (Math.abs(s - b) < c.river.bw / 2 + rad + 70) return false;
    }
    for (const k of c.castles) if (Math.hypot(x - k.x, y - k.y) < k.r + rad + 60) return false;
    for (const t of thorns) if (Math.hypot(x - t.x, y - t.y) < radiusK * Math.sqrt(t.mass) + rad + 12) return false;
    for (const d of out) {
      if (d.kind === "flower" || d.kind === "tuft" || d.kind === "puddle") continue;
      if (Math.hypot(x - d.x, y - d.y) < d.s + rad + 14) return false;
    }
    return true;
  };
  const place = (kind: DecorKind, n: number, smin: number, smax: number) => {
    let tries = n * 30;
    let left = n;
    while (left > 0 && tries-- > 0) {
      const s = smin + r() * (smax - smin);
      const x = r() * W;
      const y = r() * W;
      if (!free(x, y, kind === "flower" || kind === "tuft" ? 4 : s)) continue;
      out.push({ kind, x, y, s, v: r() });
      left--;
    }
  };
  place("tree", 78, 46, 78);
  place("rock", 46, 22, 46);
  place("barrel", 16, 20, 26);
  place("fence", 12, 70, 120);
  // калюжі можна й біля берега (але не у воді)
  place("puddle", 20, 50, 100);
  place("flower", 150, 8, 12);
  place("tuft", 120, 10, 16);
  decorCache.set(key, out);
  return out;
}

export function resetCastleCache() {
  decorCache.clear();
}
