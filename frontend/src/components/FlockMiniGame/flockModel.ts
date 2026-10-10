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
  /** Скільки сервер тримає овечку в паузі після розриву. */
  pauseMs: number;
  resumeToken: string;
  resumed: boolean;
  resumeFailed: boolean;
  /** Радіус огляду від маси: base + perSqrtMass*sqrt(маса), не більше max (дзеркало серверної формули). */
  view: { base: number; perSqrtMass: number; max: number };
}

export interface RCell {
  id: number;
  pid: number;
  /** Позиція для малювання: чужі - інтерполяція між знімками сервера, свої - передбачення. */
  x: number;
  y: number;
  /** Останній знімок сервера (для зʼїдання/камери). */
  tx: number;
  ty: number;
  mass: number;
  tmass: number;
  fx: number;
  /** Фаза погойдування. */
  phase: number;
  /** Швидкість (од/с), оцінена за знімками (для нахилу/погойдування). */
  speed: number;
  /** Історія знімків сервера (до HIST штук, від старих до нових) + найновіший і швидкість (од/мс) між двома останніми. */
  ht: Float64Array;
  hx: Float64Array;
  hy: Float64Array;
  hn: number;
  t1: number;
  x1: number;
  y1: number;
  vx: number;
  vy: number;
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
  ht: Float64Array;
  hx: Float64Array;
  hy: Float64Array;
  hn: number;
  t1: number;
  x1: number;
  y1: number;
  vx: number;
  vy: number;
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
  /** pid -> локальний час (Date.now), коли пауза гравця спливе. */
  readonly pausedUntil = new Map<number, number>();
  board: DecodedBoard = { top: [], alive: 0, map: [] };
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
  /** Локальний годинник моделі (мс). У браузері його задає кадр (performance.now), у тестах - сума dt. */
  localNow = 0;
  /**
   * Звʼязок годинників: локальний час - час сервера. Береться з "найраніших" пакетів (асиметрична EMA), тож
   * джитер мережі не псує часову шкалу; затримку інтерполяції беремо з запасом на розкид.
   */
  private clockBase: number | null = null;
  private lastSrvT = -1;
  private spacing = 100;
  /** Затримка відмальовки чужих (мс): ~1.25 інтервалу між знімками + запас; клємпи [110, 260]. */
  interpDelay = 130;
  /** Час сервера, який зараз малюємо для чужих; наздоганяє ціль плавно (до +35% швидкості), а не стрибком. */
  private renderT: number | null = null;

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

  /** Скільки мс лишилось у гравця на паузі (0, якщо не на паузі). */
  pauseLeftMs(pid: number, now = Date.now()) {
    const until = this.pausedUntil.get(pid);
    return until ? Math.max(0, until - now) : 0;
  }

  hasEffect(kind: string) {
    return this.effects.some((e) => e.kind === kind);
  }

  /** Місце гравця за масою (1 = лідер): таблиця надсилається одна на всіх, відсортована, тож шукаємо свій pid. */
  rank(): number {
    const i = this.board.map.findIndex((p) => p.pid === this.cfg.pid);
    return i < 0 ? 0 : i + 1;
  }

  ownCells(): RCell[] {
    const out: RCell[] = [];
    for (const c of this.cells.values()) if (c.pid === this.cfg.pid) out.push(c);
    return out;
  }

  applyState(pkt: ArrayBuffer | Uint8Array | DecodedState, recvMs: number = this.localNow) {
    const s = pkt instanceof ArrayBuffer || pkt instanceof Uint8Array ? decodeState(pkt) : pkt;
    const srvT = s.tick; // час сервера, мс
    const sample = recvMs - srvT;
    if (this.clockBase === null) this.clockBase = sample;
    else this.clockBase += (sample - this.clockBase) * (sample < this.clockBase ? 0.25 : 0.03);
    if (this.lastSrvT >= 0 && srvT > this.lastSrvT) {
      this.spacing += (srvT - this.lastSrvT - this.spacing) * 0.2;
      this.interpDelay = Math.min(260, Math.max(110, this.spacing * 1.25 + 25));
    }
    this.lastSrvT = srvT;
    this.tick = srvT;
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
        pushSnap(cur, srvT, c.x, c.y);
        cur.speed = Math.hypot(cur.vx, cur.vy) * 1000;
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
          ...newHist(srvT, c.x, c.y),
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
        pushSnap(cur, srvT, b.x, b.y);
        cur.tx = b.x;
        cur.ty = b.y;
      } else {
        this.blobs.set(b.id, { id: b.id, x: b.x, y: b.y, tx: b.x, ty: b.y, ...newHist(srvT, b.x, b.y) });
      }
    }
    for (const id of this.blobs.keys()) if (!seenBlobs.has(id)) this.blobs.delete(id);

    this.pausedUntil.clear();
    const nowLocal = Date.now();
    for (const p of s.paused) this.pausedUntil.set(p.pid, nowLocal + p.remainingMs);

    this.thorns = s.thorns;
    this.bonuses = s.bonuses.map((b) => ({ id: b.id, kind: BONUS_CODE[b.kind] ?? "golden", x: b.x, y: b.y }));
  }

  applyBoard(pkt: ArrayBuffer | Uint8Array) {
    this.board = decodeBoard(pkt);
  }

  /**
   * Крок кадру. Чужі клітини малюємо у минулому на `interpDelay` мс - між двома знімками сервера (лінійна
   * інтерполяція; якщо знімок запізнюється - коротка екстраполяція за швидкістю). Свої - ПЕРЕДБАЧЕННЯ за
   * вводом (рух одразу), а сервер м'яко підтягує до свого знімка, екстрапольованого "на зараз".
   * `now` - локальний час кадру (performance.now()); без нього рахуємо від dt (тести).
   */
  step(dt: number, input: { angle: number; power: number }, now?: number) {
    dt = Math.min(dt, 0.1);
    this.localNow = now ?? this.localNow + dt * 1000;
    const base = this.clockBase ?? this.localNow;
    const srvNow = this.localNow - base; // оцінка поточного часу сервера
    const target = srvNow - this.interpDelay; // момент, який хочемо малювати для чужих
    if (this.renderT === null || Math.abs(target - this.renderT) > 800) this.renderT = target;
    else {
      // після затримки пакетів (пачка) наздоганяємо трохи швидше за реальний час, а не стрибаємо
      const err = target - this.renderT;
      this.renderT += dt * 1000 * (1 + Math.max(-0.25, Math.min(0.35, err / 400)));
    }
    // не забігаємо за дані: поки пакетів нема, тримаємось (екстраполяція до 120 мс), інакше після пачки був би стрибок
    if (this.lastSrvT >= 0 && this.renderT > this.lastSrvT + 120) this.renderT = this.lastSrvT + 120;
    const tr = this.renderT;
    const kMass = 1 - Math.exp(-dt * 9);
    const kOther = 1 - Math.exp(-dt * 16);
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
        // ціль: знімок сервера, екстрапольований до "зараз" за його ж швидкістю (враховує поділ/імпульси)
        const age = Math.min(250, Math.max(0, srvNow - c.t1));
        const ex = c.x1 + c.vx * age - c.x;
        const ey = c.y1 + c.vy * age - c.y;
        const dist = Math.hypot(ex, ey);
        if (dist > 400) {
          c.x += ex;
          c.y += ey;
        } else if (dist > 6) {
          const k = 1 - Math.exp(-dt * (dist > 60 ? 10 : 4));
          c.x += ex * k;
          c.y += ey * k;
        }
      } else {
        sampleSnap(c, tr);
      }
      c.phase += dt * (3 + Math.min(c.speed, 300) / 40);
    }
    for (const b of this.blobs.values()) sampleSnap(b, tr);
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

/** Скільки знімків тримаємо: 8 = ~800 мс при 10 Гц - вистачає і на затримку інтерполяції, і на пачку пакетів після затримки мережі. */
const HIST = 8;

type Snap = {
  x: number;
  y: number;
  ht: Float64Array;
  hx: Float64Array;
  hy: Float64Array;
  hn: number;
  t1: number;
  x1: number;
  y1: number;
  vx: number;
  vy: number;
};

function newHist(t: number, x: number, y: number) {
  const ht = new Float64Array(HIST);
  const hx = new Float64Array(HIST);
  const hy = new Float64Array(HIST);
  ht[0] = t;
  hx[0] = x;
  hy[0] = y;
  return { ht, hx, hy, hn: 1, t1: t, x1: x, y1: y, vx: 0, vy: 0 };
}

/** Додає знімок (час сервера мс, позиція); пакети з несвіжим часом ігноруємо. */
function pushSnap(c: Snap, t: number, x: number, y: number) {
  if (t <= c.t1) return;
  if (c.hn === HIST) {
    c.ht.copyWithin(0, 1);
    c.hx.copyWithin(0, 1);
    c.hy.copyWithin(0, 1);
    c.hn--;
  }
  const i = c.hn++;
  c.ht[i] = t;
  c.hx[i] = x;
  c.hy[i] = y;
  const dt = t - c.t1;
  c.vx = (x - c.x1) / dt;
  c.vy = (y - c.y1) / dt;
  c.t1 = t;
  c.x1 = x;
  c.y1 = y;
}

/**
 * Позиція в момент `tr` (час сервера): лінійна інтерполяція між двома знімками, що його охоплюють;
 * новіше за останній знімок - коротка екстраполяція за швидкістю, давніше за найстаріший - він же.
 */
function sampleSnap(c: Snap, tr: number) {
  const n = c.hn;
  if (tr >= c.ht[n - 1]) {
    const ext = Math.min(tr - c.ht[n - 1], 120);
    c.x = c.x1 + c.vx * ext;
    c.y = c.y1 + c.vy * ext;
    return;
  }
  if (tr <= c.ht[0]) {
    c.x = c.hx[0];
    c.y = c.hy[0];
    return;
  }
  let i = n - 2;
  while (i > 0 && c.ht[i] > tr) i--;
  const f = (tr - c.ht[i]) / (c.ht[i + 1] - c.ht[i]);
  c.x = c.hx[i] + (c.hx[i + 1] - c.hx[i]) * f;
  c.y = c.hy[i] + (c.hy[i + 1] - c.hy[i]) * f;
}
