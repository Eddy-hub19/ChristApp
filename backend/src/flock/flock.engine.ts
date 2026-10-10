import {
  BONUS_KINDS,
  FLOCK_CONFIG,
  NUM_SKINS,
  type BonusKind,
} from './flock.config';
import { SpatialGrid } from './flock.grid';

const C = FLOCK_CONFIG;
const TWO_PI = Math.PI * 2;
const CHUNKS = Math.ceil(C.worldSize / C.chunkSize);

export type Rng = () => number;

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
  alive: boolean;
  cells: Cell[];
  angle: number;
  power: number;
  effects: Partial<Record<BonusKind, number>>;
  frozenUntil: number;
  wantSplit: boolean;
  wantThrow: boolean;
  lastSplitAt: number;
  lastThrowAt: number;
  spawnedAt: number;
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

export interface Food {
  id: number;
  x: number;
  y: number;
  kind: number;
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

export const FOOD_ADD = 1;
export const FOOD_DEL = 0;
export const FOOD_MOVE = 2;
export interface FoodEvent {
  op: number;
  food: Food;
  chunk: number;
  oldChunk: number;
}

export interface DeathEvent {
  pid: number;
  killerPid: number;
}

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

  constructor(private readonly rng: Rng = Math.random) {
    for (let i = 0; i < C.maxThorns; i++) this.spawnThorn();
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
  addPlayer(opts: { name: string; skin: number; bot?: boolean }): Player {
    const id = this.nextId(this.nextPid, (i) => this.players.has(i));
    this.nextPid = id + 1;
    const player: Player = {
      id,
      name: opts.name,
      skin: Math.max(0, Math.min(NUM_SKINS - 1, Math.floor(opts.skin) || 0)),
      bot: !!opts.bot,
      alive: false,
      cells: [],
      angle: 0,
      power: 0,
      effects: {},
      frozenUntil: 0,
      wantSplit: false,
      wantThrow: false,
      lastSplitAt: -1e9,
      lastThrowAt: -1e9,
      spawnedAt: this.now,
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
    this.addCell(p, spot.x, spot.y, C.startMass);
    p.alive = true;
    p.effects = {};
    p.frozenUntil = 0;
    p.spawnedAt = this.now;
    p.maxMass = C.startMass;
    p.total = C.startMass;
    p.topMs = 0;
    p.killed = [];
    p.kills = 0;
    p.killerPid = 0;
    p.wantSplit = p.wantThrow = false;
    // коротка недоторканність після народження
    p.effects.shield = this.now + 2500;
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

  private removeFood(food: Food) {
    this.foodById.delete(food.id);
    const chunk = chunkIndexOf(food.x, food.y);
    this.foodChunks[chunk].delete(food.id);
    this.foodEvents.push({ op: FOOD_DEL, food, chunk, oldChunk: chunk });
  }

  private spawnThorn() {
    const id = this.nextId(this.nextThornId, (i) =>
      this.thorns.some((t) => t.id === i),
    );
    this.nextThornId = id + 1;
    this.thorns.push({
      id,
      x: this.rand(200, C.worldSize - 200),
      y: this.rand(200, C.worldSize - 200),
      mass: C.thornMass,
    });
  }

  private spawnBonus() {
    if (this.bonuses.length >= C.maxBonuses) return;
    const id = this.nextId(this.nextBonusId, (i) =>
      this.bonuses.some((b) => b.id === i),
    );
    this.nextBonusId = id + 1;
    this.bonuses.push({
      id,
      x: this.rand(120, C.worldSize - 120),
      y: this.rand(120, C.worldSize - 120),
      kind: BONUS_KINDS[Math.floor(this.rng() * BONUS_KINDS.length)],
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
    this.deaths.length = 0;
    const nowMs = this.now;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
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
      for (const c of p.cells) {
        if (c.mass > C.decayFromMass) c.mass -= c.mass * C.decayPerSec * dt;
        total += c.mass;
      }
      p.total = total;
      if (total > p.maxMass) p.maxMass = total;
      if (!leader || total > leader.total) leader = p;
    }
    this.leaderPid = leader?.id ?? 0;
    if (leader) leader.topMs += dt * 1000;

    // поповнення їжі (порціями, щоб не стрибало)
    for (let i = 0; i < 8 && this.foodById.size < C.maxFood; i++)
      this.spawnFood();
    this.bonusTimer += dt * 1000;
    if (this.bonusTimer >= C.bonusSpawnEveryMs) {
      this.bonusTimer = 0;
      this.spawnBonus();
    }
    void nowMs;
  }

  private speedFor(p: Player, c: Cell) {
    if (this.now < p.frozenUntil) return 0;
    let s = speedOf(c.mass);
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
      if (!p.alive || !this.hasEffect(p, 'magnet')) continue;
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
        if (!owner || this.isGhost(owner)) return;
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
      if (!p.alive || this.isGhost(p)) continue;
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
          if (!victim || !victim.alive) return;
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
      if (!p.alive || this.isGhost(p)) continue;
      const gain = C.foodMass * (this.hasEffect(p, 'double') ? 2 : 1);
      for (const c of p.cells) {
        const r = radiusOf(c.mass);
        const eat: Food[] = [];
        this.foodNear(c.x, c.y, r, (f) => {
          if (Math.hypot(f.x - c.x, f.y - c.y) < r) eat.push(f);
        });
        for (const f of eat) {
          if (!this.foodById.has(f.id)) continue;
          this.removeFood(f);
          c.mass += gain;
        }
      }
    }
  }

  private stepThorns() {
    for (const p of this.players.values()) {
      if (!p.alive || this.isGhost(p)) continue;
      for (const c of [...p.cells]) {
        if (
          c.mass <= C.thornMass * C.thornPopRatio ||
          this.now < c.thornImmuneUntil
        )
          continue;
        const r = radiusOf(c.mass);
        for (const t of this.thorns) {
          const tr = radiusOf(t.mass);
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
      this.cellGrid.query(b.x, b.y, 60, (c) => {
        if (taker) return;
        if (Math.hypot(c.x - b.x, c.y - b.y) < radiusOf(c.mass) + 14) {
          taker = this.players.get(c.pid) ?? null;
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
    if (kind === 'freeze') {
      const near: { p: Player; d: number }[] = [];
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
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
