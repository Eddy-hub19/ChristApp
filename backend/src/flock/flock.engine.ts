import {
  BONUS_KINDS,
  FLOCK_CONFIG,
  FLOCK_MAPS,
  NUM_SKINS,
  BOSS_SKIN,
  type MapLayout,
  type ThornCfg,
  type BonusKind,
} from './flock.config';
import { SpatialGrid } from './flock.grid';

const C = FLOCK_CONFIG;
const TWO_PI = Math.PI * 2;
const CHUNKS = Math.ceil(C.worldSize / C.chunkSize);

export type Rng = () => number;

/** Додаткова відстань підбору їжі понад радіус клітини (візуальний дотик до спрайта). */
export const FOOD_REACH = C.foodRadius * C.foodTouch;
/** Буфер для stepFood: без виділення масиву на кожну клітину щотіку. */
const EAT: Food[] = [];

export type ThornSpec = { x: number; y: number; mass: number };

/** Маса куща з рівномірним розподілом за радіусом (радіус ~ sqrt(маса)): і вузькі, і широкі кущі трапляються часто. */
function randomThornMass(rng: Rng, cfg: ThornCfg): number {
  const lo = Math.sqrt(cfg.massMin);
  const hi = Math.sqrt(cfg.massMax);
  const k = lo + rng() * (hi - lo);
  return k * k;
}

/**
 * Випадкова розкладка кущів для нової арени: випадкова кількість, мінімальна відстань між кущами й від країв,
 * без центру світу (запасна точка появи), маса (отже й розмір) трохи різна. Чиста функція від rng - тестується окремо.
 */
export function generateThorns(
  rng: Rng,
  cfg: ThornCfg = C.thorns,
  world: number = C.worldSize,
  layout: MapLayout = 'scatter',
): ThornSpec[] {
  const count = cfg.min + Math.floor(rng() * (cfg.max - cfg.min + 1));
  const out: ThornSpec[] = [];
  const mid = world / 2;
  const span = world - 2 * cfg.edgeMargin;
  // центри купок (clusters): 3-4 точки, довкола яких сидять кущі
  const hubs =
    layout === 'clusters'
      ? Array.from({ length: 3 + Math.floor(rng() * 2) }, () => ({
          x: cfg.edgeMargin + rng() * span,
          y: cfg.edgeMargin + rng() * span,
        }))
      : [];
  const candidate = (n: number) => {
    if (layout === 'clusters') {
      const h = hubs[n % hubs.length];
      const a = rng() * TWO_PI;
      const d = rng() * world * 0.1;
      return { x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d };
    }
    if (layout === 'ring') {
      const a = rng() * TWO_PI;
      const d = world * 0.3 + (rng() - 0.5) * world * 0.08;
      return { x: mid + Math.cos(a) * d, y: mid + Math.sin(a) * d };
    }
    return { x: cfg.edgeMargin + rng() * span, y: cfg.edgeMargin + rng() * span };
  };
  for (let n = 0; n < count; n++) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const { x, y } = candidate(n);
      if (
        x < cfg.edgeMargin ||
        y < cfg.edgeMargin ||
        x > world - cfg.edgeMargin ||
        y > world - cfg.edgeMargin
      )
        continue;
      if (Math.hypot(x - mid, y - mid) < cfg.centerClear) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.y - y) < cfg.minGap)) continue;
      out.push({
        x,
        y,
        mass: randomThornMass(rng, cfg),
      });
      break;
    }
  }
  return out;
}

/** Номер випадкової карти (рівноймовірно). */
export function pickMapId(rng: Rng): number {
  return FLOCK_MAPS[Math.min(FLOCK_MAPS.length - 1, Math.floor(rng() * FLOCK_MAPS.length))].id;
}

export interface Cell {
  id: number;
  pid: number;
  x: number;
  y: number;
  mass: number;
  /** Імпульс від поділу / кидка / вибуху об кущ, згасає. */
  vx: number;
  vy: number;
  mergeAt: number;
  /** Імунітет до куща (щоб клітина не вибухала щотіку). */
  thornImmuneUntil: number;
}

export interface Player {
  id: number;
  name: string;
  skin: number;
  bot: boolean;
  /** «Вожак»: свої розпад і стеля маси, старт із більшою масою. */
  boss: boolean;
  alive: boolean;
  cells: Cell[];
  angle: number;
  power: number;
  effects: Partial<Record<BonusKind, number>>;
  frozenUntil: number;
  /** Коли спливає розгін на старті (мс світового часу). */
  boostUntil: number;
  wantSplit: boolean;
  wantThrow: boolean;
  lastSplitAt: number;
  lastThrowAt: number;
  spawnedAt: number;
  /** Пауза після розриву зʼєднання: стоїть, недоторкана, нікого не їсть, ефекти не тікають. */
  paused: boolean;
  pausedAt: number;
  diedAt: number;
  total: number;
  maxMass: number;
  topMs: number;
  killed: string[];
  kills: number;
  killerPid: number;
  /** Довільні дані ШІ. */
  brain?: unknown;
}

/** Вид їжі-шерсті (клаптики після «Ножиць»): малюється окремим спрайтом. */
export const FOOD_KIND_WOOL = 3;
export interface Food {
  id: number;
  x: number;
  y: number;
  kind: number;
  /** Своя маса (для шерсті після «Ножиць»); без неї - стандартна foodMass. */
  mass?: number;
}
export interface Thorn {
  id: number;
  x: number;
  y: number;
  mass: number;
}
export interface Blob {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  ownerPid: number;
}
export interface Bonus {
  id: number;
  x: number;
  y: number;
  kind: BonusKind;
}

/** Зірка події «Зорепад»: падає fallMs, підбирається після landAt. */
export interface Star {
  id: number;
  x: number;
  y: number;
  landAt: number;
  expiresAt: number;
}
/** Подія для клієнтів: [0, тривалість] старт; [1, id, x, y, fallMs] зірка з'явилась; [2, id, pid] з'їдена (pid 0 - зникла сама). */
export type StarEvent =
  | [0, number]
  | [1, number, number, number, number]
  | [2, number, number];

export const FOOD_ADD = 1;
export const FOOD_DEL = 0;
export const FOOD_MOVE = 2;
export interface FoodEvent {
  op: number;
  food: Food;
  chunk: number;
  oldChunk: number;
}

/** Подія «Ножиць» для клієнтів: де спрацювало, радіус, хто підібрав і кого підстригло. */
export interface ScissorsEvent {
  x: number;
  y: number;
  r: number;
  taker: number;
  victims: number[];
}

export interface DeathEvent {
  pid: number;
  killerPid: number;
}

/** Бонуси, що з'являються як звичайні (без рідкісних «Ножиць»: їх спавнить окремий шанс). */
const REGULAR_BONUS_KINDS = BONUS_KINDS.filter((k) => k !== 'scissors');

export const radiusOf = (mass: number) => C.radiusK * Math.sqrt(mass);
export const speedOf = (mass: number) =>
  Math.max(C.minSpeed, C.baseSpeed * Math.pow(mass, C.speedMassExp));
export const chunkIndexOf = (x: number, y: number) => {
  const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor(x / C.chunkSize)));
  const cy = Math.min(CHUNKS - 1, Math.max(0, Math.floor(y / C.chunkSize)));
  return cy * CHUNKS + cx;
};
export const CHUNKS_PER_SIDE = CHUNKS;

export class FlockWorld {
  now = 0;
  tickNo = 0;
  readonly players = new Map<number, Player>();
  readonly cellsById = new Map<number, Cell>();
  readonly foodById = new Map<number, Food>();
  readonly foodChunks: Map<number, Food>[] = Array.from(
    { length: CHUNKS * CHUNKS },
    () => new Map(),
  );
  readonly thorns: Thorn[] = [];
  readonly blobs: Blob[] = [];
  readonly bonuses: Bonus[] = [];
  readonly foodEvents: FoodEvent[] = [];
  /** «Зорепад»: зірки на арені й події цього тіку (очищаються щотіку, як foodEvents). */
  readonly stars: Star[] = [];
  readonly starEvents: StarEvent[] = [];
  readonly scissorsEvents: ScissorsEvent[] = [];
  private zActive = false;
  private zUntil = 0;
  private zNextSpawnAt = 0;
  private zNextStartAt = 0;
  /** Скільки разів «Зорепад» уже був на цій арені (максимум C.zorepad.maxPerGame). */
  private zCount = 0;
  private nextStarId = 1;
  readonly deaths: DeathEvent[] = [];
  /** Хто зараз перший за масою (для "часу в топ-1"). */
  leaderPid = 0;

  private readonly cellGrid = new SpatialGrid<Cell>(220);
  private nextPid = 1;
  private nextCellId = 1;
  private nextFoodId = 1;
  private nextThornId = 1;
  private nextBlobId = 1;
  private nextBonusId = 1;
  private bonusTimer = 0;

  constructor(
    private readonly rng: Rng = Math.random,
    /** Вид карти (FLOCK_MAPS): задає розкладку й параметри кущів. */
    readonly mapId: number = 0,
  ) {
    const map = FLOCK_MAPS.find((m) => m.id === mapId) ?? FLOCK_MAPS[0];
    for (const t of generateThorns(rng, { ...C.thorns, ...map.thorns }, C.worldSize, map.layout))
      this.thorns.push({ id: this.nextThornId++, ...t });
    for (let i = 0; i < C.maxFood; i++) this.spawnFood();
  }

  // ---------- id (u16, з обгорткою; пропускаємо зайняті) ----------
  private nextId(counter: number, has: (id: number) => boolean) {
    let id = counter;
    for (let i = 0; i < 65535; i++) {
      if (id > 65535) id = 1;
      if (!has(id)) return id;
      id++;
    }
    throw new Error('flock: id space exhausted');
  }

  private rand(min: number, max: number) {
    return min + this.rng() * (max - min);
  }

  // ---------- гравці ----------
  addPlayer(opts: {
    name: string;
    skin: number;
    bot?: boolean;
    boss?: boolean;
  }): Player {
    const id = this.nextId(this.nextPid, (i) => this.players.has(i));
    this.nextPid = id + 1;
    const player: Player = {
      id,
      name: opts.name,
      skin: opts.boss
        ? BOSS_SKIN
        : Math.max(0, Math.min(NUM_SKINS - 1, Math.floor(opts.skin) || 0)),
      bot: !!opts.bot,
      boss: !!opts.boss,
      alive: false,
      cells: [],
      angle: 0,
      power: 0,
      effects: {},
      frozenUntil: 0,
      boostUntil: 0,
      wantSplit: false,
      wantThrow: false,
      lastSplitAt: -1e9,
      lastThrowAt: -1e9,
      spawnedAt: this.now,
      paused: false,
      pausedAt: 0,
      diedAt: 0,
      total: 0,
      maxMass: 0,
      topMs: 0,
      killed: [],
      kills: 0,
      killerPid: 0,
    };
    this.players.set(id, player);
    this.respawn(player);
    return player;
  }

  /** (Пере)народити гравця з початковою масою в безпечній точці. */
  respawn(p: Player) {
    for (const c of p.cells) this.cellsById.delete(c.id);
    p.cells = [];
    const spot = this.safeSpawn();
    this.addCell(p, spot.x, spot.y, p.boss ? C.boss.startMass : C.startMass);
    p.alive = true;
    p.effects = {};
    p.frozenUntil = 0;
    p.boostUntil = this.now + C.spawnBoost.durationMs;
    p.spawnedAt = this.now;
    p.paused = false;
    const start = p.boss ? C.boss.startMass : C.startMass;
    p.maxMass = start;
    p.total = start;
    p.topMs = 0;
    p.killed = [];
    p.kills = 0;
    p.killerPid = 0;
    p.wantSplit = p.wantThrow = false;
    // коротка недоторканність після народження
    p.effects.shield = this.now + C.spawnShieldMs;
  }

  removePlayer(pid: number) {
    const p = this.players.get(pid);
    if (!p) return;
    for (const c of p.cells) this.cellsById.delete(c.id);
    this.players.delete(pid);
  }

  private safeSpawn() {
    let best = { x: C.worldSize / 2, y: C.worldSize / 2 };
    let bestD = -1;
    for (let i = 0; i < 8; i++) {
      const x = this.rand(150, C.worldSize - 150);
      const y = this.rand(150, C.worldSize - 150);
      let d = Infinity;
      for (const c of this.cellsById.values()) {
        const dd = Math.hypot(c.x - x, c.y - y) - radiusOf(c.mass);
        if (dd < d) d = dd;
      }
      for (const t of this.thorns) {
        const dd = Math.hypot(t.x - x, t.y - y) - radiusOf(t.mass);
        if (dd < d) d = dd;
      }
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  }

  private addCell(p: Player, x: number, y: number, mass: number) {
    const id = this.nextId(this.nextCellId, (i) => this.cellsById.has(i));
    this.nextCellId = id + 1;
    const cell: Cell = {
      id,
      pid: p.id,
      x,
      y,
      mass,
      vx: 0,
      vy: 0,
      mergeAt: this.now + C.mergeDelayMs,
      thornImmuneUntil: 0,
    };
    p.cells.push(cell);
    this.cellsById.set(id, cell);
    return cell;
  }

  /** Ввід від клієнта: тільки напрямок і сила (0..1). Усе інше рахує сервер. */
  setInput(pid: number, angle: number, power: number) {
    const p = this.players.get(pid);
    if (!p || !Number.isFinite(angle) || !Number.isFinite(power)) return;
    p.angle = angle;
    p.power = Math.max(0, Math.min(1, power));
  }
  queueSplit(pid: number) {
    const p = this.players.get(pid);
    if (p) p.wantSplit = true;
  }
  queueThrow(pid: number) {
    const p = this.players.get(pid);
    if (p) p.wantThrow = true;
  }

  /** Гравець відключився не за власним бажанням: тримаємо його овечку на арені в режимі паузи. */
  pausePlayer(pid: number) {
    const p = this.players.get(pid);
    if (!p || !p.alive || p.paused) return;
    p.paused = true;
    p.pausedAt = this.now;
    p.power = 0;
    p.wantSplit = p.wantThrow = false;
  }

  /**
   * Повернення після паузи: усі таймери, що йшли "у світовому часі", зсуваємо на тривалість паузи,
   * щоб бонуси, злиття частин і статистика не "згоріли" поки гравця не було. Далі - короткий щит.
   */
  resumePlayer(pid: number, shieldMs: number) {
    const p = this.players.get(pid);
    if (!p) return;
    if (p.paused) {
      const delta = Math.max(0, this.now - p.pausedAt);
      for (const k of Object.keys(p.effects) as BonusKind[]) {
        const until = p.effects[k] ?? 0;
        if (until > p.pausedAt) p.effects[k] = until + delta;
      }
      if (p.frozenUntil > p.pausedAt) p.frozenUntil += delta;
      if (p.boostUntil > p.pausedAt) p.boostUntil += delta;
      for (const c of p.cells) {
        c.mergeAt += delta;
        if (c.thornImmuneUntil > p.pausedAt) c.thornImmuneUntil += delta;
      }
      p.spawnedAt += delta;
      p.paused = false;
    }
    p.effects.shield = Math.max(p.effects.shield ?? 0, this.now + shieldMs);
  }

  isShielded(p: Player) {
    return (p.effects.shield ?? 0) > this.now;
  }
  isGhost(p: Player) {
    return (p.effects.ghost ?? 0) > this.now;
  }
  hasEffect(p: Player, k: BonusKind) {
    return (p.effects[k] ?? 0) > this.now;
  }

  // ---------- спавн ----------
  private spawnFood() {
    if (this.foodById.size >= C.maxFood) return;
    const id = this.nextId(this.nextFoodId, (i) => this.foodById.has(i));
    this.nextFoodId = id + 1;
    const food: Food = {
      id,
      x: this.rand(20, C.worldSize - 20),
      y: this.rand(20, C.worldSize - 20),
      kind: Math.floor(this.rng() * 3),
    };
    this.foodById.set(id, food);
    const chunk = chunkIndexOf(food.x, food.y);
    this.foodChunks[chunk].set(id, food);
    this.foodEvents.push({ op: FOOD_ADD, food, chunk, oldChunk: chunk });
  }

  /** Додає їжу в задану точку (шерсть після «Ножиць»): ті самі події, що й у звичайної їжі. */
  private addFoodAt(x: number, y: number, kind: number, mass?: number) {
    const id = this.nextId(this.nextFoodId, (i) => this.foodById.has(i));
    this.nextFoodId = id + 1;
    const food: Food = { id, x, y, kind, mass };
    this.foodById.set(id, food);
    const chunk = chunkIndexOf(x, y);
    this.foodChunks[chunk].set(id, food);
    this.foodEvents.push({ op: FOOD_ADD, food, chunk, oldChunk: chunk });
  }

  private removeFood(food: Food) {
    this.foodById.delete(food.id);
    const chunk = chunkIndexOf(food.x, food.y);
    this.foodChunks[chunk].delete(food.id);
    this.foodEvents.push({ op: FOOD_DEL, food, chunk, oldChunk: chunk });
  }

  private spawnBonus() {
    if (this.bonuses.length >= C.maxBonuses) return;
    const id = this.nextId(this.nextBonusId, (i) =>
      this.bonuses.some((b) => b.id === i),
    );
    this.nextBonusId = id + 1;
    // «Ножиці» рідкісні: окремий шанс, і не більше одних на полі
    const scissors =
      !this.bonuses.some((b) => b.kind === 'scissors') &&
      this.rng() < C.scissors.spawnChance;
    const kind = scissors
      ? 'scissors'
      : REGULAR_BONUS_KINDS[Math.floor(this.rng() * REGULAR_BONUS_KINDS.length)];
    this.bonuses.push({
      id,
      x: this.rand(120, C.worldSize - 120),
      y: this.rand(120, C.worldSize - 120),
      kind,
    });
  }

  // ---------- публічні запити (боти, протокол) ----------
  queryCells(x: number, y: number, r: number, cb: (c: Cell) => void) {
    this.cellGrid.query(x, y, r, cb);
  }

  foodNear(x: number, y: number, r: number, cb: (f: Food) => void) {
    const cs = C.chunkSize;
    const x0 = Math.max(0, Math.floor((x - r) / cs));
    const x1 = Math.min(CHUNKS - 1, Math.floor((x + r) / cs));
    const y0 = Math.max(0, Math.floor((y - r) / cs));
    const y1 = Math.min(CHUNKS - 1, Math.floor((y + r) / cs));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const f of this.foodChunks[cy * CHUNKS + cx].values()) cb(f);
      }
    }
  }

  centroid(p: Player) {
    let m = 0;
    let x = 0;
    let y = 0;
    for (const c of p.cells) {
      m += c.mass;
      x += c.x * c.mass;
      y += c.y * c.mass;
    }
    return m > 0 ? { x: x / m, y: y / m, mass: m } : { x: 0, y: 0, mass: 0 };
  }

  viewRadius(p: Player) {
    return Math.min(
      C.viewMax,
      C.viewBase + C.viewPerSqrtMass * Math.sqrt(p.total),
    );
  }

  // ---------- тік ----------
  tick(dt: number) {
    this.now += dt * 1000;
    this.tickNo++;
    this.foodEvents.length = 0;
    this.starEvents.length = 0;
    this.scissorsEvents.length = 0;
    this.deaths.length = 0;
    const nowMs = this.now;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.paused) {
        // стоїмо: імпульс (поділ/кидок) плавно згасає, керування й злиття не працюють
        p.power = 0;
        this.moveCells(p, dt);
        continue;
      }
      if (p.wantSplit) this.doSplit(p);
      if (p.wantThrow) this.doThrow(p);
      p.wantSplit = p.wantThrow = false;
      this.moveCells(p, dt);
      this.mergeOwn(p, dt);
    }

    this.cellGrid.clear();
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const c of p.cells) this.cellGrid.insert(c);
    }

    this.stepMagnet(dt);
    this.stepBlobs(dt);
    this.stepCellVsCell();
    this.stepFood();
    this.stepThorns();
    this.stepBonuses();

    // total, decay, статистика
    let leader: Player | null = null;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      let total = 0;
      const from = p.boss ? C.boss.decayFromMass : C.decayFromMass;
      const rate = p.boss ? C.boss.decayPerSec : C.decayPerSec;
      for (const c of p.cells) {
        if (!p.paused && c.mass > from) {
          c.mass -= c.mass * rate * dt;
        }
        total += c.mass;
      }
      // «Вожак»: стеля маси - зайве зникає, щоб не захопив арену
      if (p.boss && total > C.boss.maxMass) {
        const k = C.boss.maxMass / total;
        for (const c of p.cells) c.mass *= k;
        total = C.boss.maxMass;
      }
      p.total = total;
      if (total > p.maxMass) p.maxMass = total;
      if (!leader || total > leader.total) leader = p;
    }
    this.leaderPid = leader?.id ?? 0;
    if (leader && !leader.paused) leader.topMs += dt * 1000;

    this.stepZorepad();

    // поповнення їжі (порціями, щоб не стрибало)
    for (let i = 0; i < C.foodRegrowPerTick && this.foodById.size < C.maxFood; i++)
      this.spawnFood();
    this.bonusTimer += dt * 1000;
    if (this.bonusTimer >= C.bonusSpawnEveryMs) {
      this.bonusTimer = 0;
      this.spawnBonus();
    }
    void nowMs;
  }

  /** Скільки мс лишилось розгону на старті (0 - не діє: бот, час вийшов або маса вже за порогом). */
  spawnBoostLeftMs(p: Player): number {
    if (p.bot || p.total >= C.spawnBoost.massLimit) return 0;
    return Math.max(
      0,
      Math.min(C.spawnBoost.durationMs, p.boostUntil - this.now),
    );
  }

  /** Множник швидкості від розгіну: 1 + speedBonus * (залишок / тривалість), тобто плавно спадає до 1. */
  spawnBoostFactor(p: Player): number {
    const left = this.spawnBoostLeftMs(p);
    return 1 + (C.spawnBoost.speedBonus * left) / C.spawnBoost.durationMs;
  }

  private speedFor(p: Player, c: Cell) {
    if (this.now < p.frozenUntil) return 0;
    let s = speedOf(c.mass) * this.spawnBoostFactor(p);
    if (this.hasEffect(p, 'speed')) s *= C.speedMultiplier;
    return Math.min(s, C.maxSpeedHard);
  }

  private moveCells(p: Player, dt: number) {
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    const decay = Math.exp(-C.impulseFriction * dt);
    for (const c of p.cells) {
      const s = this.speedFor(p, c) * p.power;
      c.x += (dx * s + c.vx) * dt;
      c.y += (dy * s + c.vy) * dt;
      c.vx *= decay;
      c.vy *= decay;
      const r = radiusOf(c.mass);
      c.x = Math.min(C.worldSize - r * 0.3, Math.max(r * 0.3, c.x));
      c.y = Math.min(C.worldSize - r * 0.3, Math.max(r * 0.3, c.y));
    }
  }

  private mergeOwn(p: Player, dt: number) {
    const cells = p.cells;
    if (cells.length < 2) return;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        const ra = radiusOf(a.mass);
        const rb = radiusOf(b.mass);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const canMerge = this.now >= a.mergeAt && this.now >= b.mergeAt;
        if (canMerge) {
          if (d < Math.max(ra, rb) * 0.9) {
            this.mergeInto(p, a, b);
            j--;
            // a могла змінити масу - повторно перевіряємо з тим самим i
          }
        } else if (d < ra + rb) {
          const push = ((ra + rb - d) / 2) * Math.min(1, dt * 12);
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  private mergeInto(p: Player, a: Cell, b: Cell) {
    const total = a.mass + b.mass;
    a.x = (a.x * a.mass + b.x * b.mass) / total;
    a.y = (a.y * a.mass + b.y * b.mass) / total;
    a.vx += b.vx;
    a.vy += b.vy;
    a.mass = total;
    this.dropCell(p, b);
  }

  private dropCell(p: Player, c: Cell) {
    const i = p.cells.indexOf(c);
    if (i >= 0) p.cells.splice(i, 1);
    this.cellsById.delete(c.id);
  }

  private doSplit(p: Player) {
    if (this.now - p.lastSplitAt < C.splitCooldownMs) return;
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    const snapshot = [...p.cells];
    for (const c of snapshot) {
      if (p.cells.length >= C.maxCellsPerPlayer) break;
      if (c.mass < C.minSplitMass) continue;
      const half = c.mass / 2;
      c.mass = half;
      c.mergeAt = this.now + C.mergeDelayMs;
      p.lastSplitAt = this.now;
      const piece = this.addCell(p, c.x, c.y, half);
      piece.vx = dx * C.splitImpulse;
      piece.vy = dy * C.splitImpulse;
    }
  }

  private doThrow(p: Player) {
    if (this.now - p.lastThrowAt < C.throwCooldownMs) return;
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    for (const c of p.cells) {
      if (c.mass < C.minThrowMass) continue;
      if (this.blobs.length >= C.maxBlobs) return;
      p.lastThrowAt = this.now;
      c.mass -= C.throwMass;
      const r = radiusOf(c.mass);
      const id = this.nextId(this.nextBlobId, (i) =>
        this.blobs.some((b) => b.id === i),
      );
      this.nextBlobId = id + 1;
      this.blobs.push({
        id,
        x: c.x + dx * (r + 6),
        y: c.y + dy * (r + 6),
        vx: dx * C.throwImpulse,
        vy: dy * C.throwImpulse,
        bornAt: this.now,
        ownerPid: p.id,
      });
    }
  }

  private stepMagnet(dt: number) {
    for (const p of this.players.values()) {
      if (!p.alive || p.paused || !this.hasEffect(p, 'magnet')) continue;
      for (const c of p.cells) {
        this.foodNear(c.x, c.y, C.magnetRadius, (f) => {
          const dx = c.x - f.x;
          const dy = c.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d > C.magnetRadius || d < 1) return;
          const step = Math.min(d, C.magnetPull * dt);
          const oldChunk = chunkIndexOf(f.x, f.y);
          f.x += (dx / d) * step;
          f.y += (dy / d) * step;
          const chunk = chunkIndexOf(f.x, f.y);
          if (chunk !== oldChunk) {
            this.foodChunks[oldChunk].delete(f.id);
            this.foodChunks[chunk].set(f.id, f);
          }
          this.foodEvents.push({ op: FOOD_MOVE, food: f, chunk, oldChunk });
        });
      }
    }
  }

  private stepBlobs(dt: number) {
    const decay = Math.exp(-5 * dt);
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      b.x = Math.min(C.worldSize - 5, Math.max(5, b.x + b.vx * dt));
      b.y = Math.min(C.worldSize - 5, Math.max(5, b.y + b.vy * dt));
      b.vx *= decay;
      b.vy *= decay;
      let eaten = false;
      this.cellGrid.query(b.x, b.y, 80, (c) => {
        if (eaten) return;
        const owner = this.players.get(c.pid);
        if (!owner || owner.paused || this.isGhost(owner)) return;
        if (c.pid === b.ownerPid && this.now - b.bornAt < 350) return;
        if (Math.hypot(c.x - b.x, c.y - b.y) < radiusOf(c.mass)) {
          c.mass +=
            C.throwMass * 0.85 * (this.hasEffect(owner, 'double') ? 2 : 1);
          eaten = true;
        }
      });
      if (eaten) this.blobs.splice(i, 1);
    }
  }

  private stepCellVsCell() {
    for (const p of this.players.values()) {
      if (!p.alive || p.paused || this.isGhost(p)) continue;
      for (const a of [...p.cells]) {
        if (!this.cellsById.has(a.id)) continue;
        const ra = radiusOf(a.mass);
        this.cellGrid.query(a.x, a.y, ra + 80, (b) => {
          if (
            b.pid === a.pid ||
            !this.cellsById.has(b.id) ||
            !this.cellsById.has(a.id)
          )
            return;
          if (a.mass < b.mass * C.eatRatio) return;
          const victim = this.players.get(b.pid);
          if (!victim || !victim.alive || victim.paused) return;
          // боти не чіпають новачків (жорстке правило рушія, а не лише ШІ)
          if (
            p.bot &&
            !victim.bot &&
            this.now - victim.spawnedAt < C.botGraceMs
          )
            return;
          if (this.isShielded(victim) || this.isGhost(victim)) return;
          const rb = radiusOf(b.mass);
          if (Math.hypot(a.x - b.x, a.y - b.y) >= ra - rb * C.eatOverlap)
            return;
          this.eatCell(p, a, victim, b);
        });
      }
    }
  }

  private eatCell(eater: Player, a: Cell, victim: Player, b: Cell) {
    a.mass += b.mass;
    this.dropCell(victim, b);
    if (victim.cells.length === 0) {
      victim.alive = false;
      victim.diedAt = this.now;
      victim.killerPid = eater.id;
      eater.kills++;
      if (eater.killed.length < 8) eater.killed.push(victim.name);
      this.deaths.push({ pid: victim.id, killerPid: eater.id });
    }
  }

  private stepFood() {
    for (const p of this.players.values()) {
      if (!p.alive || p.paused || this.isGhost(p)) continue;
      const base = C.foodMass * (this.hasEffect(p, 'double') ? 2 : 1);
      for (const c of p.cells) {
        // підбір за візуальним дотиком: край клітини торкається спрайта їжі (foodReach), а не лише центр усередині
        const reach = radiusOf(c.mass) + FOOD_REACH;
        EAT.length = 0;
        this.foodNear(c.x, c.y, reach, (f) => {
          if (Math.hypot(f.x - c.x, f.y - c.y) < reach) EAT.push(f);
        });
        for (const f of EAT) {
          if (!this.foodById.has(f.id)) continue;
          this.removeFood(f);
          // шерсть несе свою масу (зрізану «Ножицями»), без подвоєння: маса не береться з повітря
          c.mass += f.mass ?? base;
        }
      }
    }
  }

  private stepThorns() {
    for (const p of this.players.values()) {
      if (!p.alive || p.paused || this.isGhost(p)) continue;
      // popCell додає шматки в кінець p.cells: ітеруємо по початковій довжині без копії масиву
      const n = p.cells.length;
      for (let i = 0; i < n; i++) {
        const c = p.cells[i];
        if (
          c.mass <= C.thornMass * C.thornPopRatio ||
          this.now < c.thornImmuneUntil
        )
          continue;
        const r = radiusOf(c.mass);
        for (const t of this.thorns) {
          const tr = radiusOf(t.mass);
          // клітина менша за кущ може залізти всередину (ховається) і не рветься
          if (r <= tr) continue;
          if (Math.hypot(c.x - t.x, c.y - t.y) < r - tr * 0.3) {
            this.popCell(p, c);
            break;
          }
        }
      }
    }
  }

  private popCell(p: Player, c: Cell) {
    const room = C.maxCellsPerPlayer - p.cells.length;
    const pieces = Math.min(C.thornPieces, room);
    c.thornImmuneUntil = this.now + 1500;
    c.mergeAt = this.now + C.mergeDelayMs;
    if (pieces <= 0) return;
    const pieceMass = (c.mass * 0.5) / pieces;
    c.mass *= 0.5;
    for (let i = 0; i < pieces; i++) {
      const ang = (i / pieces) * TWO_PI + this.rng() * 0.5;
      const piece = this.addCell(p, c.x, c.y, pieceMass);
      piece.vx = Math.cos(ang) * C.splitImpulse;
      piece.vy = Math.sin(ang) * C.splitImpulse;
      piece.thornImmuneUntil = this.now + 1500;
    }
  }

  private stepBonuses() {
    for (let i = this.bonuses.length - 1; i >= 0; i--) {
      const b = this.bonuses[i];
      let taker: Player | null = null;
      let takerCell: Cell | null = null;
      this.cellGrid.query(b.x, b.y, 66, (c) => {
        if (taker) return;
        const pl = this.players.get(c.pid);
        if (!pl || pl.paused) return; // у паузі бонуси не підбираються
        if (Math.hypot(c.x - b.x, c.y - b.y) < radiusOf(c.mass) + C.bonusReach) {
          taker = pl;
          takerCell = c;
        }
      });
      if (!taker || !takerCell) continue;
      this.bonuses.splice(i, 1);
      this.applyBonus(taker, takerCell, b.kind);
    }
  }

  applyBonus(p: Player, cell: Cell, kind: BonusKind) {
    if (kind === 'golden') {
      let big = cell;
      for (const c of p.cells) if (c.mass > big.mass) big = c;
      big.mass += Math.max(C.goldenMinMass, big.mass * C.goldenMassFraction);
      return;
    }
    if (kind === 'scissors') {
      this.applyScissors(p, cell);
      return;
    }
    if (kind === 'freeze') {
      const near: { p: Player; d: number }[] = [];
      for (const o of this.players.values()) {
        if (o === p || !o.alive || o.paused) continue;
        const cc = this.centroid(o);
        const d = Math.hypot(cc.x - cell.x, cc.y - cell.y);
        if (d <= C.freezeRadius) near.push({ p: o, d });
      }
      near.sort((a, b) => a.d - b.d);
      for (const n of near.slice(0, C.freezeMaxTargets)) {
        n.p.frozenUntil = this.now + C.bonusDurations.freeze;
      }
      return;
    }
    p.effects[kind] = this.now + C.bonusDurations[kind];
  }

  /** «Ножиці»: хвиля навколо клітини, що підібрала бонус; подробиці правил - у C.scissors. */
  private applyScissors(taker: Player, cell: Cell) {
    const S = C.scissors;
    const R = Math.max(S.minRadius, radiusOf(cell.mass) * S.radiusMul);
    const victims: number[] = [];
    for (const o of this.players.values()) {
      if (o === taker || !o.alive) continue;
      if (S.immunePaused && o.paused) continue;
      if (S.immuneShield && this.isShielded(o)) continue;
      if (this.now - o.spawnedAt < S.newbieImmuneMs) continue;
      let total = 0;
      for (const c of o.cells) total += c.mass;
      if (total <= S.massThreshold) continue;
      const hit = o.cells.filter(
        (c) => Math.hypot(c.x - cell.x, c.y - cell.y) <= R,
      );
      if (!hit.length) continue;
      // нижче minMassAfter не опускаємо: якщо половини забагато, зменшуємо зріз пропорційно
      let want = 0;
      for (const c of hit) want += c.mass * S.cutFraction;
      const allowed = Math.max(0, total - S.minMassAfter);
      const k = want > allowed ? allowed / want : 1;
      if (k <= 0) continue;
      for (const c of hit) {
        const cut = c.mass * S.cutFraction * k;
        c.mass -= cut;
        this.scatterWool(c.x, c.y, radiusOf(c.mass + cut) * S.woolScatter, cut);
      }
      victims.push(o.id);
    }
    this.scissorsEvents.push({
      x: Math.round(cell.x),
      y: Math.round(cell.y),
      r: Math.round(R),
      taker: taker.id,
      victims,
    });
  }

  /** Розсипає зрізану масу жмутами шерсті навколо точки (маса зберігається повністю). */
  private scatterWool(x: number, y: number, spread: number, mass: number) {
    const S = C.scissors;
    const n = Math.max(1, Math.min(S.woolMaxPieces, Math.ceil(mass / S.woolPieceMass)));
    const each = mass / n;
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TWO_PI;
      const d = Math.sqrt(this.rng()) * spread;
      const fx = Math.min(C.worldSize - 20, Math.max(20, x + Math.cos(a) * d));
      const fy = Math.min(C.worldSize - 20, Math.max(20, y + Math.sin(a) * d));
      this.addFoodAt(fx, fy, FOOD_KIND_WOOL, each);
    }
  }

  // ---------- «Зорепад» ----------
  /** Зірки для нового клієнта (welcome): скільки мс лишилось до приземлення (0 - уже лежить). */
  starsSnapshot() {
    return this.stars.map((s) => ({
      id: s.id,
      x: Math.round(s.x),
      y: Math.round(s.y),
      fall: Math.max(0, Math.round(s.landAt - this.now)),
    }));
  }

  private stepZorepad() {
    const Z = C.zorepad;
    // підбір приземлених зірок і зникання старих
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      if (this.now >= s.expiresAt) {
        this.stars.splice(i, 1);
        this.starEvents.push([2, s.id, 0]);
        continue;
      }
      if (this.now < s.landAt) continue;
      let taker: Player | null = null;
      let takerCell: Cell | null = null;
      this.cellGrid.query(s.x, s.y, 260, (c) => {
        if (taker) return;
        const pl = this.players.get(c.pid);
        if (!pl || !pl.alive || pl.paused || this.isGhost(pl)) return;
        if (Math.hypot(c.x - s.x, c.y - s.y) < radiusOf(c.mass) + Z.pickupReach) {
          taker = pl;
          takerCell = c;
        }
      });
      if (!taker || !takerCell) continue;
      this.stars.splice(i, 1);
      (takerCell as Cell).mass += Z.starMass;
      this.starEvents.push([2, s.id, (taker as Player).id]);
    }

    if (!this.zActive) {
      if (this.zCount < Z.maxPerGame && this.now >= this.zNextStartAt && this.canStartZorepad()) {
        this.zCount++;
        this.zActive = true;
        this.zUntil = this.now + Z.durationMs;
        this.zNextSpawnAt = this.now;
        this.zNextStartAt =
          this.now +
          Z.cooldownMinMs +
          this.rng() * (Z.cooldownMaxMs - Z.cooldownMinMs);
        this.starEvents.push([0, Z.durationMs]);
      }
      return;
    }
    if (this.now >= this.zUntil) {
      this.zActive = false;
      return;
    }
    while (this.now >= this.zNextSpawnAt) {
      this.zNextSpawnAt += Z.spawnEveryMs;
      this.spawnStar();
    }
  }

  /** Подія стартує, коли жива людина досягла triggerMass і на арені є хоча б minAlive живих гравців. */
  private canStartZorepad() {
    const Z = C.zorepad;
    let alive = 0;
    let big = false;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      alive++;
      if (!p.bot && p.total >= Z.triggerMass) big = true;
    }
    return big && alive >= Z.minAlive;
  }

  private spawnStar() {
    const Z = C.zorepad;
    if (this.stars.length >= Z.maxStars) return;
    const pos = this.pickStarPos();
    if (!pos) return;
    const id = this.nextId(this.nextStarId, (i) =>
      this.stars.some((s) => s.id === i),
    );
    this.nextStarId = id + 1;
    const landAt = this.now + Z.fallMs;
    this.stars.push({
      id,
      x: pos.x,
      y: pos.y,
      landAt,
      expiresAt: landAt + Z.lifetimeMs,
    });
    this.starEvents.push([
      1,
      id,
      Math.round(pos.x),
      Math.round(pos.y),
      Z.fallMs,
    ]);
  }

  /** Точка для зірки: подалі від лідера (поруч - нічого, далі - рідко), здебільшого біля менших за нього. */
  private pickStarPos(): { x: number; y: number } | null {
    const Z = C.zorepad;
    const leader = this.players.get(this.leaderPid);
    const lc = leader && leader.alive ? this.centroid(leader) : null;
    const smaller: Player[] = [];
    if (leader && lc) {
      for (const p of this.players.values())
        if (p.alive && p !== leader && p.total < leader.total) smaller.push(p);
    }
    const lo = Z.edgeMargin;
    const hi = C.worldSize - Z.edgeMargin;
    for (let attempt = 0; attempt < 12; attempt++) {
      let x: number;
      let y: number;
      if (smaller.length && this.rng() < Z.nearSmallerShare) {
        const c = this.centroid(
          smaller[Math.floor(this.rng() * smaller.length)],
        );
        const a = this.rng() * TWO_PI;
        const d = this.rng() * Z.nearSmallerRadius;
        x = c.x + Math.cos(a) * d;
        y = c.y + Math.sin(a) * d;
      } else {
        x = this.rand(lo, hi);
        y = this.rand(lo, hi);
      }
      x = Math.min(hi, Math.max(lo, x));
      y = Math.min(hi, Math.max(lo, y));
      if (lc) {
        const dl = Math.hypot(x - lc.x, y - lc.y);
        if (dl < Z.leaderClearRadius) continue;
        if (dl < Z.leaderSparseRadius) {
          const k =
            (dl - Z.leaderClearRadius) /
            (Z.leaderSparseRadius - Z.leaderClearRadius);
          if (this.rng() > k) continue;
        }
      }
      return { x, y };
    }
    return null;
  }

  leaderboard(limit = 10) {
    return [...this.players.values()]
      .filter((p) => p.alive)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.alive) n++;
    return n;
  }
}
