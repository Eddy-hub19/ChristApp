import {
  decodeBoard,
  decodeState,
  BONUS_CODE,
  FX_FROZEN,
  type DecodedBoard,
  type DecodedState,
} from "./flockProtocol";
import { PHRASE_MAX_MS } from "./flockPhrases";
import type { LavaBurn, LavaGeom } from "./flockLava";

export interface FlockCfg {
  pid: number;
  arenaId: number;
  world: number;
  chunk: number;
  tickHz: number;
  radiusK: number;
  /** spawnBoost - частка розгону на старті (0.4 = +40%), що спадає до 0 за durations.boost. */
  speed: {
    base: number;
    exp: number;
    min: number;
    boost: number;
    spawnBoost?: number;
    /** «Прискорення» (дзеркало серверного FLOCK_CONFIG.sprint); без поля - старий сервер, кнопки нема. */
    sprint?: { speedBonus: number; burnPerSec: number; minTotalMass: number; floorMass: number; maxSpeedMultiplier: number };
  };
  durations: Record<string, number>;
  magnetRadius: number;
  /** Скільки сервер тримає овечку в паузі після розриву. */
  pauseMs: number;
  resumeToken: string;
  resumed: boolean;
  resumeFailed: boolean;
  /** Радіус огляду від маси: base + perSqrtMass*sqrt(маса), не більше max (дзеркало серверної формули). */
  view: { base: number; perSqrtMass: number; max: number };
  /** Відсування камери при бонусі «Орлиний зір» (1 - немає; без поля - старий сервер). */
  eagleZoom?: number;
  /** Річка лави карти «Вулкан» (серверна геометрія); без поля - лави нема. */
  lava?: LavaGeom;
  /** Кущі арени: сервер шле їх один раз у welcome (для клієнтів v2); без поля - старий сервер, кущі беремо з пакетів стану. */
  thorns?: { id: number; x: number; y: number; mass: number }[];
  /** Піврозмір спрайта їжі (світові одиниці). Без поля - 8.5 (старий сервер). */
  foodRadius?: number;
  /** Вид карти арени (палітра, flockMaps.ts). Без поля - 0 (старий сервер). */
  map?: number;
  /** Вид кустов карты (bush | autumn | fir); без поля (старый сервер) - по номеру карты. */
  thornStyle?: "bush" | "autumn" | "fir" | "charred";
  /** Зірки «Зорепаду», що вже падають або лежать на момент входу (fall - мс до приземлення). */
  stars?: { id: number; x: number; y: number; fall: number }[];
  /** Режим арени (без поля - звичайна) і коло «Звужуване коло» на момент входу. */
  mode?: "normal" | "circle";
  circle?: CircleMsgIn;
  /** На скільки калюжа уповільнює клітини (частка); без поля - 0.2. */
  rainSlow?: number;
  /** «Дощ», що йде на момент входу: l - лишилось дощу (мс), y - підсихання після нього, d - повне підсихання, p - калюжі [id, x, y, r]. */
  rain?: { l: number; y?: number; d: number; p: [number, number, number, number][] };
  /** «Вітер» на момент входу: a - напрям (рад), w - мс до початку, l - скільки лишилось сносу. */
  wind?: { a: number; w: number; l: number };
  /** Формула сносу (дзеркало сервера): швидкість = windSpeed0 / (1 + маса / windMassHalf). Без полів - вітру нема. */
  /** «Сопілка пастуха»: радіус дії в радіусах клітини власника (без поля - візуал не малюється). */
  pipeRadius?: number;
  windSpeed0?: number;
  windMassHalf?: number;
  /** Серія днів на 1-му місці: p - pid держателя на цій арені (0 - його тут нема), d - днів поспіль. Без поля - серії нема. */
  streak?: { p: number; d: number };
}

/** Повідомлення сервера про коло режиму «Звужуване коло» (welcome.circle або подія `cz`). */
export interface CircleMsgIn {
  x: number;
  y: number;
  r0: number;
  r1: number;
  hold: number;
  shrink: number;
  stage: number;
  stages: number;
}

/** Коло в локальному годиннику моделі: t0 - момент отримання, hold/shrink - що лишалось на цю мить. */
export interface RCircle extends CircleMsgIn {
  t0: number;
}

/** Калюжа «Дощу» (світові координати). */
export interface RPuddle {
  id: number;
  x: number;
  y: number;
  r: number;
}

/** «Дощ»: часові мітки в локальному годиннику моделі (мс). Калюжі діють до dryEndsAt, слабшаючи після rainEndsAt. */
export interface RRain {
  rainEndsAt: number;
  dryEndsAt: number;
  dryMs: number;
  puddles: RPuddle[];
}

/** Зірка «Зорепаду»: падає fall мс від t0 (локальний час, мс), потім лежить, поки її не з'їдять. */
export interface RStar {
  id: number;
  x: number;
  y: number;
  t0: number;
  fall: number;
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
/** Хвиля «Ножиць» для анімації: t0 - локальний час появи (performance.now). */
export interface RScissorsWave {
  x: number;
  y: number;
  r: number;
  t0: number;
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
  /** Надітий артефакт (0 - нічого; старий сервер не шле - 0). */
  artifact?: number;
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
  /** Бонусы своего скина (из config /flock/me): клиент предсказывает по ним скорость и разгон на старте. */
  selfPerks: { speed?: number; spawnBoostBonus?: number; spawnBoostMs?: number } = {};
  readonly cells = new Map<number, RCell>();
  readonly foods = new Map<number, RFood>();
  readonly blobs = new Map<number, RBlob>();
  readonly dying: RDying[] = [];
  readonly players = new Map<number, PlayerMeta>();
  thorns: { id: number; x: number; y: number; mass: number }[] = [];
  /** Зірки «Зорепаду»: з'являються/зникають за подіями сервера, позицій щотіку нема. */
  readonly stars = new Map<number, RStar>();
  /** Коло режиму «Звужуване коло» (null - режиму нема або раунд закінчився й чекаємо новий). */
  circle: RCircle | null = null;
  /** Поточний «Дощ» (null - нема). */
  rain: RRain | null = null;
  /** Коли (локальний час, мс) своя клітина востаннє була під «Сопілкою»: HUD коротко показує «Тебе кличе сопілка!». */
  pipeCalledAt = -Infinity;
  /** «Вітер»: напрям і локальні мітки початку/кінця сносу (мс); null - нема. */
  wind: { angle: number; startAt: number; endsAt: number } | null = null;
  /** «Прискорення» своєї клітини діє цього кадру (для сліду й індикатора). */
  sprintActive = false;
  bonuses: { id: number; kind: string; x: number; y: number }[] = [];
  /** Активні хвилі «Ножиць» (анімація ~SCISSORS_WAVE_MS, потім прибираються при малюванні). */
  readonly scissorsWaves: RScissorsWave[] = [];
  /** Клітини, що згоріли в лаві (анімація «згоріла»). */
  readonly lavaBurns: LavaBurn[] = [];
  effects: ActiveEffect[] = [];
  /** pid -> активна швидка фраза: id і локальний час (годинник кадру) її кінця. Прибирається, коли гравець зник із зони. */
  readonly phrases = new Map<number, { id: number; end: number; /** Свій текст (id = 0). */ text?: string }>();
  /** pid -> локальний час (Date.now), коли пауза гравця спливе. */
  readonly pausedUntil = new Map<number, number>();
  board: DecodedBoard = { top: [], alive: 0, map: [] };
  /** Серія днів на 1-му місці в Топ-10: шлеться один раз у welcome й подією `sk` при зміні (не в пакеті таблиці). */
  streak: { pid: number; days: number } | null = null;
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
    this.thorns = cfg.thorns ?? [];
    this.applyStreak(cfg.streak);
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

  speedOf(mass: number, boosted: boolean, startFactor = 1, sprint = false) {
    const s = this.cfg.speed;
    let v = Math.max(s.min, s.base * Math.pow(mass, s.exp)) * startFactor * (1 + (this.selfPerks.speed ?? 0));
    if (boosted) v *= s.boost;
    if (sprint && s.sprint) {
      // та сама формула, що на сервері (sprintedMultiplier): +бонус до решти множників, але не вище стелі
      const m = startFactor * (boosted ? s.boost : 1);
      v *= Math.min(m * (1 + s.sprint.speedBonus), Math.max(m, s.sprint.maxSpeedMultiplier)) / m;
    }
    return v;
  }

  /** Чи можна зараз користуватись «Прискоренням» (достатньо маси): для активності кнопки й передбачення. */
  sprintReady(): boolean {
    const sp = this.cfg.speed.sprint;
    return Boolean(sp) && this.alive && this.total >= sp!.minTotalMass && this.total > sp!.floorMass;
  }

  /** Коло з welcome / події `cz`: далі радіус рахується за локальним часом (circleRadius). */
  applyCircle(msg: CircleMsgIn | null | undefined, recvMs: number = this.localNow) {
    if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.r0)) return;
    this.circle = { ...msg, t0: recvMs };
  }

  /** Радіус кола зараз: до кінця hold стоїть, далі лінійно до r1 за shrink. */
  circleRadius(now: number = this.localNow): number {
    const c = this.circle;
    if (!c) return 0;
    const t = now - c.t0;
    if (t <= c.hold || c.shrink <= 0) return t <= c.hold ? c.r0 : c.r1;
    return c.r0 + (c.r1 - c.r0) * Math.min(1, (t - c.hold) / c.shrink);
  }

  /** Що показати в шапці: розминка, очікування, звуження або фінал; left - секунди до наступної зміни. */
  circleStatus(now: number = this.localNow): { phase: "warmup" | "hold" | "shrink" | "final"; leftMs: number; stage: number; stages: number } | null {
    const c = this.circle;
    if (!c) return null;
    const t = now - c.t0;
    if (t < c.hold) return { phase: c.stage === 0 ? "warmup" : "hold", leftMs: c.hold - t, stage: c.stage, stages: c.stages };
    if (t < c.hold + c.shrink) return { phase: "shrink", leftMs: c.hold + c.shrink - t, stage: c.stage, stages: c.stages };
    return { phase: "final", leftMs: 0, stage: c.stage, stages: c.stages };
  }

  /** Події «Дощу»: msg з welcome (rain) або події "rn": { l, d, y?, p }. */
  applyRain(msg: { l?: number; y?: number; d?: number; p?: unknown } | null | undefined, recvMs: number = this.localNow) {
    if (!msg || !Array.isArray(msg.p)) return;
    const l = Math.max(0, Number(msg.l) || 0);
    const dryMs = Math.max(1, Number(msg.d) || 1);
    const y = msg.y === undefined ? dryMs : Math.max(0, Number(msg.y) || 0);
    this.rain = {
      rainEndsAt: recvMs + l,
      dryEndsAt: recvMs + l + y,
      dryMs,
      puddles: (msg.p as unknown[]).flatMap((q) =>
        Array.isArray(q) && q.length >= 4 ? [{ id: Number(q[0]), x: Number(q[1]), y: Number(q[2]), r: Number(q[3]) }] : [],
      ),
    };
  }

  /** Події «Вітру»: msg з welcome (wind) або події "wd": { a, w, l }. */
  applyWind(msg: { a?: number; w?: number; l?: number } | null | undefined, recvMs: number = this.localNow) {
    if (!msg || !Number.isFinite(msg.a)) return;
    const w = Math.max(0, Number(msg.w) || 0);
    const l = Math.max(0, Number(msg.l) || 0);
    this.wind = { angle: Number(msg.a), startAt: recvMs + w, endsAt: recvMs + w + l };
  }

  /** Стан вітру для HUD: попередження (warn), снос іде (active) або нічого (null); leftMs - до зміни фази. */
  windStatus(now: number = this.localNow): { phase: "warn" | "active"; angle: number; leftMs: number } | null {
    const w = this.wind;
    if (!w || now >= w.endsAt) return null;
    return now < w.startAt ? { phase: "warn", angle: w.angle, leftMs: w.startAt - now } : { phase: "active", angle: w.angle, leftMs: w.endsAt - now };
  }

  /** Швидкість сносу клітини маси mass (од./с): та сама формула, що на сервері. */
  windSpeed(mass: number): number {
    const s0 = this.cfg.windSpeed0;
    if (!s0) return 0;
    return s0 / (1 + mass / (this.cfg.windMassHalf ?? 600));
  }

  /** Клітина всередині куща (менша за кущ, центр у його межах): вітер її не зносить. */
  private insideBush(x: number, y: number, mass: number): boolean {
    const r = this.radiusOf(mass);
    for (const t of this.thorns) {
      const tr = this.radiusOf(t.mass);
      if (r <= tr && Math.hypot(x - t.x, y - t.y) < tr) return true;
    }
    return false;
  }

  /** Сила калюж: 1 - дощ іде, до 0 - підсихають, 0 - немає. */
  rainStrength(now: number = this.localNow): number {
    const r = this.rain;
    if (!r) return 0;
    if (now < r.rainEndsAt) return 1;
    return Math.max(0, (r.dryEndsAt - now) / r.dryMs);
  }

  /** Дощ іде просто зараз (не лише калюжі підсихають). */
  isRaining(now: number = this.localNow): boolean {
    return this.rain !== null && now < this.rain.rainEndsAt;
  }

  /** Множник швидкості від калюж (дзеркало серверного puddleFactor): 1 - сухо, у калюжі 0.8 (слабшає, поки підсихають). */
  puddleFactor(x: number, y: number): number {
    const r = this.rain;
    const slow = this.cfg.rainSlow ?? 0.2;
    if (!r) return 1;
    const f = this.rainStrength();
    if (f <= 0) return 1;
    for (const q of r.puddles) {
      const dx = x - q.x;
      const dy = y - q.y;
      if (dx * dx + dy * dy < q.r * q.r) return 1 - slow * f;
    }
    return 1;
  }

  /** Множник розгіну на старті: 1 + бонус × (залишок / тривалість); 1, якщо сервер не надіслав ефект «boost». */
  startBoostFactor(): number {
    const e = this.effects.find((x) => x.kind === "boost");
    const bonus = (this.cfg.speed.spawnBoost ?? 0) + (this.selfPerks.spawnBoostBonus ?? 0);
    if (!e || bonus <= 0) return 1;
    const total = e.totalMs + (this.selfPerks.spawnBoostMs ?? 0);
    return 1 + (bonus * Math.min(e.remainingMs, total)) / Math.max(1, total);
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

    for (const p of s.players) this.players.set(p.pid, { skin: p.skin, artifact: p.artifact ?? 0, bot: p.bot, name: p.name });

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
    if (this.phrases.size) {
      // гравця вже не видно (вийшов із зони / з'їдений): хмаринку забуваємо, сервер надішле її знову, коли він зʼявиться
      const pids = new Set<number>();
      for (const c of s.cells) pids.add(c.pid);
      for (const pid of this.phrases.keys()) if (!pids.has(pid)) this.phrases.delete(pid);
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

    // кущі сервер шле один раз у welcome; зі стану беремо лише для старого сервера (без cfg.thorns)
    if (!this.cfg.thorns) this.thorns = s.thorns;
    this.bonuses = s.bonuses.map((b) => ({ id: b.id, kind: BONUS_CODE[b.kind] ?? "golden", x: b.x, y: b.y }));
  }

  /** Зірки, що вже були на арені, коли ми зайшли (з welcome). */
  applyStarsSnapshot(list: { id: number; x: number; y: number; fall: number }[] | undefined, recvMs: number) {
    for (const s of list ?? []) this.stars.set(s.id, { id: s.id, x: s.x, y: s.y, t0: recvMs, fall: Math.max(1, s.fall) });
  }

  /**
   * Події «Зорепаду»: [0, мс] старт, [1, id, x, y, fallMs] зірка з'явилась, [2, id, pid] з'їдена/зникла.
   * Повертає тривалість, якщо в пакеті був старт події (для напису «Зорепад!»), інакше 0.
   */
  applyStarEvents(events: unknown, recvMs: number = this.localNow): number {
    if (!Array.isArray(events)) return 0;
    let started = 0;
    for (const e of events) {
      if (!Array.isArray(e)) continue;
      if (e[0] === 0) started = Number(e[1]) || 1;
      else if (e[0] === 1) this.stars.set(e[1], { id: e[1], x: e[2], y: e[3], t0: recvMs, fall: Math.max(1, Number(e[4]) || 1000) });
      else if (e[0] === 2) this.stars.delete(e[1]);
    }
    return started;
  }

  /**
   * Подія «Ножиць» ({x, y, r, t: хто підібрав, v: кого підстригло}): додає хвилю для анімації.
   * Повертає, чи ми той, хто підібрав, чи нас підстригли, і скільки гравців зачепило.
   */
  applyScissors(msg: unknown, recvMs: number = this.localNow): { taker: boolean; victim: boolean; count: number; gain: number } | null {
    const e = msg as { x?: number; y?: number; r?: number; t?: number; v?: number[]; g?: number } | null;
    if (!e || typeof e.x !== "number" || typeof e.y !== "number" || typeof e.r !== "number") return null;
    if (this.scissorsWaves.length >= 8) this.scissorsWaves.shift();
    this.scissorsWaves.push({ x: e.x, y: e.y, r: e.r, t0: recvMs });
    const victims = Array.isArray(e.v) ? e.v : [];
    return { taker: e.t === this.cfg.pid, victim: victims.includes(this.cfg.pid), count: victims.length, gain: typeof e.g === "number" ? e.g : 0 };
  }

  /** Клітини, що згоріли в лаві: [[x, y, r], ...] - короткий спалах на їхньому місці (не більше 24 одночасно). */
  applyLava(msg: unknown, recvMs: number = this.localNow) {
    const list = (msg as { e?: unknown } | null)?.e;
    if (!Array.isArray(list)) return;
    for (const e of list) {
      if (!Array.isArray(e) || typeof e[0] !== "number" || typeof e[1] !== "number") continue;
      if (this.lavaBurns.length >= 24) this.lavaBurns.shift();
      this.lavaBurns.push({ x: e[0], y: e[1], r: Number(e[2]) || 20, t0: recvMs });
    }
  }

  /** Серія днів на 1-му місці ({p: pid держателя, d: днів}); d <= 0 - серії нема. */
  applyStreak(msg: unknown) {
    const e = msg as { p?: unknown; d?: unknown } | null;
    if (!e || typeof e.d !== "number" || typeof e.p !== "number") return;
    this.streak = e.d > 0 && e.p > 0 ? { pid: e.p, days: e.d } : null;
  }

  /**
   * Подія `q` ({p: pid, i: id фрази (0 - скинути), t: кінець у часі сервера, мс}). Час сервера переводимо в локальний
   * годинник кадру через звʼязок годинників зі станів; не довше PHRASE_MAX_MS від отримання.
   */
  applyPhrase(msg: unknown, recvMs: number = this.localNow) {
    const e = msg as { p?: unknown; i?: unknown; t?: unknown } | null;
    if (!e || typeof e.p !== "number" || typeof e.i !== "number") return;
    if (e.i <= 0) {
      this.phrases.delete(e.p);
      return;
    }
    const cap = recvMs + PHRASE_MAX_MS;
    const end = typeof e.t === "number" && this.clockBase !== null ? e.t + this.clockBase : cap;
    if (end <= recvMs) return;
    this.phrases.set(e.p, { id: e.i, end: Math.min(end, cap) });
  }

  /** Подія `qt` (свій текст): ({p: pid, x: текст, t: кінець у часі сервера}). Замінює попередню хмаринку гравця. */
  applyText(msg: unknown, recvMs: number = this.localNow) {
    const e = msg as { p?: unknown; x?: unknown; t?: unknown } | null;
    if (!e || typeof e.p !== "number" || typeof e.x !== "string" || !e.x) return;
    const cap = recvMs + PHRASE_MAX_MS;
    const end = typeof e.t === "number" && this.clockBase !== null ? e.t + this.clockBase : cap;
    if (end <= recvMs) return;
    this.phrases.set(e.p, { id: 0, end: Math.min(end, cap), text: e.x.slice(0, 80) });
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
  step(dt: number, input: { angle: number; power: number; sprint?: boolean }, now?: number) {
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
    const startFactor = this.startBoostFactor();
    const frozen = this.cells.size > 0 && this.ownCells().every((c) => (c.fx & FX_FROZEN) !== 0);
    const dx = Math.cos(input.angle);
    const dy = Math.sin(input.angle);
    const world = this.cfg.world;
    if (this.rain && this.localNow >= this.rain.dryEndsAt) this.rain = null;
    if (this.wind && this.localNow >= this.wind.endsAt) this.wind = null;
    const windOn = this.wind !== null && this.localNow >= this.wind.startAt;
    const wdx = this.wind ? Math.cos(this.wind.angle) : 0;
    const wdy = this.wind ? Math.sin(this.wind.angle) : 0;
    const sprinting = Boolean(input.sprint) && !frozen && this.sprintReady();
    this.sprintActive = sprinting;
    for (const c of this.cells.values()) {
      c.mass += (c.tmass - c.mass) * kMass;
      if (c.pid === this.cfg.pid) {
        if (!frozen) {
          const v = this.speedOf(c.mass, boosted, startFactor, sprinting) * input.power * this.puddleFactor(c.x, c.y);
          c.x = Math.min(world, Math.max(0, c.x + dx * v * dt));
          c.y = Math.min(world, Math.max(0, c.y + dy * v * dt));
        }
        // снос вітром (ту саму формулу рахує сервер); на паузі й у кущі не діє
        if (windOn && !this.insideBush(c.x, c.y, c.mass)) {
          const wv = this.windSpeed(c.mass) * dt;
          c.x = Math.min(world, Math.max(0, c.x + wdx * wv));
          c.y = Math.min(world, Math.max(0, c.y + wdy * wv));
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
      const eagle = this.hasEffect("eagle") ? (this.cfg.eagleZoom ?? 1) : 1;
      const targetR = Math.min(v.max, v.base + v.perSqrtMass * Math.sqrt(m)) * eagle;
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
