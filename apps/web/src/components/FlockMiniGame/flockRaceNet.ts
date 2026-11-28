/**
 * Склейка клієнта гоночних режимів із сервером (контракт - docs/flock-maze.md): типи повідомлень `w.race`, `rr`, `rz`, `rv`, `rp`, `rs`, `rw`,
 * стан раунду на клієнті й ЧИСТІ перетворення (без DOM і сокета - їх перевіряє одноразовий e2e-скрипт). Нічого тут не малює.
 */
import { createMazeView, type MazeView } from "./flockMaze";
import type { MazeParams } from "./flockMazeGrid";
import { newDash, type DashState, type RaceMoveParams } from "./flockRaceShared";
import type { RaceHudData, RaceNoRewardReason, RacePhase, RaceResults } from "./flockRace";

/** Фази раунду на сервері (`race.phase` / `rz.p`). */
export const RACE_LOBBY = 0;
export const RACE_COUNTDOWN = 1;
export const RACE_RACING = 2;
export const RACE_RESULTS = 3;

/** Статус учасника (`rz.st`, `roster[].st`): 0 гонщик, 1 глядач, 2 фінішував, 3 вибув. */
export const ST_RACING = 0;
export const ST_SPECTATOR = 1;
export const ST_FINISHED = 2;
export const ST_DROPPED = 3;

export interface RaceRosterMsg {
  pid: number;
  n: string;
  s: number;
  b: number;
  st: number;
}

export interface RaceMazeCfgMsg {
  cols: number;
  rows: number;
  cell: number;
  wall: number;
  braid: number;
  world: number;
  pathMin: number;
  pathMax: number;
  foodMin: number;
  foodMax: number;
  checkpoints: number;
  finishRadius?: number;
  hash: string | null;
  traps?: boolean;
}

export interface RaceEatMsg {
  ratio: number;
  overlap: number;
  gain: number;
  startMass: number;
  maxMass: number;
  foodMass: number;
  foodReach?: number;
  foodRespawnMs: number;
  respawnAt: string;
  spawnProtectMs: number;
  dissolveMs: number;
  maxRespawns: number;
}

export interface RaceResultRowMsg {
  pid: number;
  name: string;
  bot: boolean;
  place: number;
  t: number | null;
  cp: number;
  ate: number;
  eatenBy: number;
  status: string;
}

export interface RaceResultsMsg {
  id: string;
  kind: string;
  seed: number;
  durationMs: number;
  win: number;
  rows: RaceResultRowMsg[];
  reward: { rubies: number; pending: boolean; reason?: string; limit: number };
}

/** `w.race` (і `rr`: той самий склад + id/seed). Усе, що не потрібне клієнту, ігнорується. */
export interface RaceWelcomeMsg {
  kind?: string;
  phase?: number;
  left?: number;
  elapsed?: number;
  round?: string | null;
  seed?: number | null;
  timings?: { lobbyMs: number; countdownMs: number; finishGraceMs: number; resultsMs: number; dropMs: number; maxParticipants: number };
  reward?: { rubies: number; dailyWinLimit: number; minHumans: number };
  roster?: RaceRosterMsg[];
  you?: { pid: number; st: number };
  results?: RaceResultsMsg;
  maze?: RaceMazeCfgMsg;
  move?: RaceMoveParams;
  eat?: RaceEatMsg;
  view?: { radius: number };
  hint?: { arrowAfterMs: number };
  maxDurationMs?: number;
  vis?: number[];
}

export interface RaceRoundMsg extends RaceWelcomeMsg {
  id?: string;
  seed?: number | null;
}

export interface RaceFrameMsg {
  p: number;
  l: number;
  e: number;
  st: number;
  pl: number;
  n: number;
  sp?: number;
  m: number[];
  c: number[][];
  f: number[][];
  nv?: number[];
  ha?: number;
}

export type RaceEventMsg =
  | { k: "lobby" }
  | { k: "go" }
  | { k: "cp"; i: number }
  | { k: "fin"; t: number; place: number }
  | { k: "win"; pid: number; name: string; t: number }
  | { k: "eaten"; by: string; pid: number }
  | { k: "ate"; name: string; pid: number }
  | { k: "respawn"; cp?: number }
  | { k: "drop"; why: string }
  | { k: "needcp"; cp: number; of: number };

export interface RaceRewardMsg {
  rubies: number;
  balance?: number;
  reason?: "daily" | "cap";
  limit: number;
}

/** Моя клітина (авторитетна) за останнім `rz.m`. */
export interface RaceMine {
  x: number;
  y: number;
  mass: number;
  dashLeftMs: number;
  dashCdMs: number;
  protectLeftMs: number;
  cp: number;
  dissolveLeftMs: number;
  /** performance.now() моменту прийому (для плавного зменшення таймерів між кадрами). */
  at: number;
}

export interface RacePlayerMeta {
  pid: number;
  name: string;
  skin: number;
  bot: boolean;
  st: number;
}

/** Стан гонки на клієнті (живе в `model.race`). Дані для HUD і передбачення; сітка - у `model.maze`. */
export interface RaceClientState {
  kind: string;
  phase: number;
  /** Мс до кінця фази на момент `phaseAt`. */
  phaseLeftMs: number;
  phaseAt: number;
  elapsedMs: number;
  round: string | null;
  seed: number | null;
  timings: NonNullable<RaceWelcomeMsg["timings"]>;
  reward: NonNullable<RaceWelcomeMsg["reward"]>;
  move: RaceMoveParams;
  eat: RaceEatMsg;
  mazeCfg: RaceMazeCfgMsg;
  hintArrowAfterMs: number;
  roster: Map<number, RacePlayerMeta>;
  /** Мій статус (`rz.st`). */
  status: number;
  place: number;
  racers: number;
  /** За ким дивимось: pid лідера, якщо я глядач/вибув; 0 - за собою. */
  specPid: number;
  mine: RaceMine;
  /** Моє передбачення ривка (та сама формула, що на сервері). */
  dash: DashState;
  /** Хеш сітки: true - збігся з `maze.hash`, false - розбіжність (помилка клієнта), null - ще нема сітки. */
  hashOk: boolean | null;
  /** Остання підказка HUD і коли вона з'явилась (performance.now). */
  hint: { kind: "go" | "checkpoint"; at: number } | null;
  /** Останній кадр: коли прийшов (performance.now) і звідки взяти час для кроку. */
  lastFrameAt: number;
}

export const DEFAULT_TIMINGS = { lobbyMs: 20000, countdownMs: 5000, finishGraceMs: 8000, resultsMs: 10000, dropMs: 10000, maxParticipants: 6 };
export const DEFAULT_REWARD = { rubies: 5, dailyWinLimit: 3, minHumans: 2 };

/** Параметри сітки з `maze` + seed раунду (контракт §4). */
export function mazeParamsOf(seed: number, m: RaceMazeCfgMsg): MazeParams {
  return {
    seed,
    cols: m.cols,
    rows: m.rows,
    cell: m.cell,
    wall: m.wall,
    braid: m.braid,
    world: m.world,
    foodMin: m.foodMin,
    foodMax: m.foodMax,
    checkpoints: m.checkpoints,
    pathMin: m.pathMin,
    pathMax: m.pathMax,
  };
}

export function rosterOf(list: RaceRosterMsg[] | undefined, prev?: Map<number, RacePlayerMeta>): Map<number, RacePlayerMeta> {
  const out = new Map<number, RacePlayerMeta>();
  for (const r of list ?? []) {
    if (typeof r?.pid !== "number") continue;
    // Скрін/ім'я не змінюються протягом раунду; боти малюються як звичайні гравці (bot: false).
    out.set(r.pid, { pid: r.pid, name: String(r.n ?? "").slice(0, 32), skin: Number(r.s) || 0, bot: false, st: Number(r.st) || 0 });
  }
  if (prev && out.size === 0) return prev;
  return out;
}

const EMPTY_MINE: RaceMine = { x: 0, y: 0, mass: 0, dashLeftMs: 0, dashCdMs: 0, protectLeftMs: 0, cp: 0, dissolveLeftMs: 0, at: 0 };

/** Створює стан із welcome. Без move/eat/maze (старий або чужий сервер) повертає null. */
export function createRaceState(w: RaceWelcomeMsg | undefined, now: number): RaceClientState | null {
  if (!w || !w.maze || !w.move || !w.eat) return null;
  return {
    kind: w.kind ?? "maze",
    phase: w.phase ?? RACE_LOBBY,
    phaseLeftMs: w.left ?? 0,
    phaseAt: now,
    elapsedMs: w.elapsed ?? 0,
    round: w.round ?? null,
    seed: typeof w.seed === "number" ? w.seed : null,
    timings: w.timings ?? DEFAULT_TIMINGS,
    reward: w.reward ?? DEFAULT_REWARD,
    move: w.move,
    eat: w.eat,
    mazeCfg: w.maze,
    hintArrowAfterMs: w.hint?.arrowAfterMs ?? 0,
    roster: rosterOf(w.roster),
    status: w.you?.st ?? ST_SPECTATOR,
    place: 0,
    racers: 0,
    specPid: 0,
    mine: { ...EMPTY_MINE, at: now },
    dash: newDash(),
    hashOk: null,
    hint: null,
    lastFrameAt: now,
  };
}

/** Будує сітку раунду з seed і звіряє хеш із сервером. null - seed ще нема (набір). */
export function buildRoundView(st: RaceClientState, seed: number | null, mazeCfg: RaceMazeCfgMsg | undefined, vis?: number[]): MazeView | null {
  if (seed === null || !Number.isFinite(seed)) return null;
  const cfg = mazeCfg ?? st.mazeCfg;
  const view = createMazeView(mazeParamsOf(seed, cfg), { dissolveMs: st.eat.dissolveMs, protectMs: st.eat.spawnProtectMs, hintArrowAfterMs: st.hintArrowAfterMs });
  st.seed = seed;
  st.mazeCfg = cfg;
  st.hashOk = cfg.hash == null ? true : view.grid.hash === cfg.hash;
  if (vis) for (const i of vis) if (i >= 0 && i < view.visited.length) view.visited[i] = 1;
  return view;
}

/** Серверні причини відсутності нагороди -> ключі підписів `flock.race.noReward.*`. */
export function noRewardKey(reason: string | undefined, iAmWinner: boolean): RaceNoRewardReason {
  if (!iAmWinner) return reason === "bot" ? "onlyBots" : reason === "humans" ? "minHumans" : "notWinner";
  switch (reason) {
    case "bot":
      return "onlyBots";
    case "humans":
      return "minHumans";
    case "afk":
      return "afk";
    case "daily":
    case "cap":
      return "dailyLimit";
    default:
      return "none";
  }
}

/** `rs` -> дані підсумкової картки. Нагорода - лише якщо переможець я (рубіни підтверджує `rw`). */
export function resultsOf(rs: RaceResultsMsg, myPid: number): RaceResults {
  const iWin = rs.win === myPid && myPid > 0;
  return {
    rows: rs.rows.map((r) => ({
      pid: r.pid,
      name: r.name,
      // Боти не відрізняються від людей і в підсумках
      bot: false,
      me: r.pid === myPid,
      place: r.place > 0 ? r.place : 0,
      timeMs: r.t === null || r.t === undefined ? null : r.t,
      ate: r.ate,
      eaten: r.eatenBy,
    })),
    rewardRubies: iWin && rs.reward?.pending ? rs.reward.rubies : 0,
    noRewardReason: iWin && rs.reward?.pending ? "none" : noRewardKey(rs.reward?.reason, iWin),
  };
}

/** `rw` -> оновлена картка (нагороду підтверджено або ні). */
export function applyReward(res: RaceResults, rw: RaceRewardMsg): RaceResults {
  if (rw.rubies > 0) return { ...res, rewardRubies: rw.rubies, noRewardReason: "none" };
  return { ...res, rewardRubies: 0, noRewardReason: noRewardKey(rw.reason, true) };
}

const PHASES: RacePhase[] = ["lobby", "countdown", "racing", "results"];

/** HUD з поточного стану (викликається ~4 Гц). */
export function hudOf(st: RaceClientState, now: number): RaceHudData {
  const leftMs = Math.max(0, st.phaseLeftMs - Math.max(0, now - st.phaseAt));
  const spectating = st.status === ST_SPECTATOR || st.status === ST_DROPPED;
  const base = PHASES[st.phase] ?? "lobby";
  const phase: RacePhase = spectating && (st.phase === RACE_RACING || st.phase === RACE_COUNTDOWN) ? "spectating" : base;
  const dashLeft = Math.max(st.dash.cdMs, st.mine.dashCdMs - Math.max(0, now - st.mine.at), 0);
  const hintAge = st.hint ? now - st.hint.at : Infinity;
  // «Гоу!»/«Чекпоінт!» показуються ~1.4 с
  const hint = st.hint && hintAge < 1400 ? st.hint.kind : null;
  return {
    phase,
    leftMs,
    place: st.status === ST_RACING || st.status === ST_FINISHED ? st.place : 0,
    total: st.racers,
    cpDone: st.mine.cp,
    cpTotal: st.mazeCfg.checkpoints,
    dashLeftMs: dashLeft,
    dashCdMs: st.move.dash.cooldownMs,
    hint,
  };
}
