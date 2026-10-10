import {
  decodeBoard,
  decodeState,
  BONUS_CODE,
  FX_FROZEN,
  type DecodedBoard,
  type DecodedState,
} from "./flockProtocol";

export interface FlockCfg {
  pid: number;
  arenaId: number;
  world: number;
  chunk: number;
  tickHz: number;
  radiusK: number;
  speed: { base: number; exp: number; min: number; boost: number };
  durations: Record<string, number>;
  magnetRadius: number;
  /** Радіус огляду від маси: base + perSqrtMass*sqrt(маса), не більше max (дзеркало серверної формули). */
  view: { base: number; perSqrtMass: number; max: number };
}

export interface RCell {
  id: number;
  pid: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  mass: number;
  tmass: number;
  fx: number;
  /** Фаза погойдування. */
  phase: number;
  /** Швидкість, оцінена за оновленнями (для нахилу/погойдування). */
  speed: number;
}
export interface RFood {
  id: number;
  x: number;
  y: number;
  kind: number;
}
export interface RBlob {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}
export interface RDying {
  x: number;
  y: number;
  tx: number;
  ty: number;
  mass: number;
  pid: number;
  fx: number;
  life: number;
}
export interface PlayerMeta {
  skin: number;
  bot: boolean;
  name: string;
}
export interface ActiveEffect {
  kind: string;
  remainingMs: number;
  totalMs: number;
}

const PHASE_STEP = 1.37;

export class FlockModel {
  cfg: FlockCfg;
  readonly cells = new Map<number, RCell>();
  readonly foods = new Map<number, RFood>();
  readonly blobs = new Map<number, RBlob>();
  readonly dying: RDying[] = [];
  readonly players = new Map<number, PlayerMeta>();
  thorns: { id: number; x: number; y: number; mass: number }[] = [];
  bonuses: { id: number; kind: string; x: number; y: number }[] = [];
  effects: ActiveEffect[] = [];
  board: DecodedBoard = { top: [], selfRank: 0, alive: 0, map: [] };
  total = 0;
  alive = false;
  tick = 0;
  /** Камера (згладжена). */
  camX = 0;
  camY = 0;
  camR = 700;
  /** Співвідношення сторін екрана (ширина/висота); сервер шле область такої ж форми. */
  aspect = 1;
  private haveCam = false;

  constructor(cfg: FlockCfg) {
    this.cfg = cfg;
  }

  chunkOf(x: number, y: number) {
    const n = Math.ceil(this.cfg.world / this.cfg.chunk);
    const cx = Math.min(n - 1, Math.max(0, Math.floor(x / this.cfg.chunk)));
    const cy = Math.min(n - 1, Math.max(0, Math.floor(y / this.cfg.chunk)));
    return cy * n + cx;
  }

  radiusOf(mass: number) {
    return this.cfg.radiusK * Math.sqrt(mass);
  }

  speedOf(mass: number, boosted: boolean) {
    const s = this.cfg.speed;
    const v = Math.max(s.min, s.base * Math.pow(mass, s.exp));
    return boosted ? v * s.boost : v;
  }

  hasEffect(kind: string) {
    return this.effects.some((e) => e.kind === kind);
  }

  ownCells(): RCell[] {
    const out: RCell[] = [];
    for (const c of this.cells.values()) if (c.pid === this.cfg.pid) out.push(c);
    return out;
  }

  applyState(pkt: ArrayBuffer | Uint8Array | DecodedState) {
    const s = pkt instanceof ArrayBuffer || pkt instanceof Uint8Array ? decodeState(pkt) : pkt;
    this.tick = s.tick;
    this.alive = s.alive;
    this.total = s.total;
    this.effects = s.effects.map((e) => {
      const kind = BONUS_CODE[e.kind] ?? "speed";
      return { kind, remainingMs: e.remainingMs, totalMs: this.cfg.durations[kind] ?? e.remainingMs };
    });

    if (s.forgetChunks.length) {
      const forget = new Set(s.forgetChunks);
      for (const f of this.foods.values()) {
        if (forget.has(this.chunkOf(f.x, f.y))) this.foods.delete(f.id);
      }
    }
    for (const ch of s.chunks) for (const f of ch.foods) this.foods.set(f.id, { id: f.id, x: f.x, y: f.y, kind: f.kind });
    for (const e of s.foodEvents) {
      if (e.op === 0) this.foods.delete(e.id);
      else this.foods.set(e.id, { id: e.id, x: e.x, y: e.y, kind: e.kind });
    }

    for (const p of s.players) this.players.set(p.pid, { skin: p.skin, bot: p.bot, name: p.name });

    const seen = new Set<number>();
    for (const c of s.cells) {
      seen.add(c.id);
      const cur = this.cells.get(c.id);
      if (cur) {
        cur.speed = Math.hypot(c.x - cur.tx, c.y - cur.ty) * this.cfg.tickHz;
        cur.tx = c.x;
        cur.ty = c.y;
        cur.tmass = c.mass;
        cur.fx = c.fx;
        cur.pid = c.pid;
      } else {
        this.cells.set(c.id, {
          id: c.id,
          pid: c.pid,
          x: c.x,
          y: c.y,
          tx: c.x,
          ty: c.y,
          mass: c.mass,
          tmass: c.mass,
          fx: c.fx,
          phase: (c.id * PHASE_STEP) % (Math.PI * 2),
          speed: 0,
        });
      }
    }
    for (const c of this.cells.values()) {
      if (seen.has(c.id)) continue;
      this.cells.delete(c.id);
      // з'їдену клітину анімуємо: тане в бік найближчого більшого сусіда
      let best: RCell | null = null;
      let bd = 400 * 400;
      for (const o of this.cells.values()) {
        if (o.pid === c.pid || o.tmass < c.tmass) continue;
        const d = (o.tx - c.tx) ** 2 + (o.ty - c.ty) ** 2;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best && this.dying.length < 40) {
        this.dying.push({ x: c.x, y: c.y, tx: best.x, ty: best.y, mass: c.mass, pid: c.pid, fx: c.fx, life: 1 });
      }
    }

    const seenBlobs = new Set<number>();
    for (const b of s.blobs) {
      seenBlobs.add(b.id);
      const cur = this.blobs.get(b.id);
      if (cur) {
        cur.tx = b.x;
        cur.ty = b.y;
      } else this.blobs.set(b.id, { id: b.id, x: b.x, y: b.y, tx: b.x, ty: b.y });
    }
    for (const id of this.blobs.keys()) if (!seenBlobs.has(id)) this.blobs.delete(id);

    this.thorns = s.thorns;
    this.bonuses = s.bonuses.map((b) => ({ id: b.id, kind: BONUS_CODE[b.kind] ?? "golden", x: b.x, y: b.y }));
  }

  applyBoard(pkt: ArrayBuffer | Uint8Array) {
    this.board = decodeBoard(pkt);
  }

  /**
   * Крок кадру: згладжування чужих клітин, ПЕРЕДБАЧЕННЯ своїх (рухаються одразу за вводом,
   * сервер лише м'яко підтягує), анімація маси, камера.
   */
  step(dt: number, input: { angle: number; power: number }) {
    dt = Math.min(dt, 0.1);
    const kOther = 1 - Math.exp(-dt * 16);
    const kMass = 1 - Math.exp(-dt * 9);
    const kOwn = 1 - Math.exp(-dt * 7);
    const boosted = this.hasEffect("speed");
    const frozen = this.cells.size > 0 && this.ownCells().every((c) => (c.fx & FX_FROZEN) !== 0);
    const dx = Math.cos(input.angle);
    const dy = Math.sin(input.angle);
    const world = this.cfg.world;
    for (const c of this.cells.values()) {
      c.mass += (c.tmass - c.mass) * kMass;
      if (c.pid === this.cfg.pid) {
        if (!frozen) {
          const v = this.speedOf(c.mass, boosted) * input.power;
          c.x = Math.min(world, Math.max(0, c.x + dx * v * dt));
          c.y = Math.min(world, Math.max(0, c.y + dy * v * dt));
        }
        c.x += (c.tx - c.x) * kOwn;
        c.y += (c.ty - c.y) * kOwn;
      } else {
        c.x += (c.tx - c.x) * kOther;
        c.y += (c.ty - c.y) * kOther;
      }
      c.phase += dt * (3 + Math.min(c.speed, 300) / 40);
    }
    for (const b of this.blobs.values()) {
      b.x += (b.tx - b.x) * kOther;
      b.y += (b.ty - b.y) * kOther;
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.life -= dt * 7;
      d.x += (d.tx - d.x) * kOther;
      d.y += (d.ty - d.y) * kOther;
      if (d.life <= 0) this.dying.splice(i, 1);
    }

    // камера по центру мас власних клітин
    let m = 0;
    let cx = 0;
    let cy = 0;
    for (const c of this.cells.values()) {
      if (c.pid !== this.cfg.pid) continue;
      m += c.mass;
      cx += c.x * c.mass;
      cy += c.y * c.mass;
    }
    if (m > 0) {
      cx /= m;
      cy /= m;
      const v = this.cfg.view;
      const targetR = Math.min(v.max, v.base + v.perSqrtMass * Math.sqrt(m));
      if (!this.haveCam) {
        this.camX = cx;
        this.camY = cy;
        this.camR = targetR;
        this.haveCam = true;
      } else {
        const kc = 1 - Math.exp(-dt * 10);
        this.camX += (cx - this.camX) * kc;
        this.camY += (cy - this.camY) * kc;
        this.camR += (targetR - this.camR) * (1 - Math.exp(-dt * 2.5));
      }
    }
  }

  resetCamera() {
    this.haveCam = false;
  }
}

/**
 * Масштаб "світ -> екран". Сервер шле прямокутник площі (2R)² під форму екрана
 * (півсторони R*sqrt(a)*1.15 і R/sqrt(a)*1.15), тож видима область (R*sqrt(a) × R/sqrt(a)) завжди менша за надіслану.
 */
export function viewScale(width: number, height: number, camR: number) {
  return Math.sqrt(width * height) / (2 * camR * 1.04);
}
