import type { NavHazard } from './flock.nav';
import { generateLava, inLava, lavaBlocked, type LavaLayout } from './flock.lava';
import {
  BONUS_KINDS,
  FLOCK_CONFIG,
  FLOCK_MAPS,
  NUM_SKINS,
  BOSS_SKIN,
  MONSTER_SKIN,
  isRemovedSkin,
  ARTIFACT,
  isArtifactId,
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
  const k = (lo + rng() * (hi - lo)) / cfg.sizeDivisor;
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
  /** Заборонена точка (лава з відступом): кущі там не ставляться. */
  avoid?: (x: number, y: number, mass: number) => boolean,
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
  const valid = (x: number, y: number) =>
    x >= cfg.edgeMargin &&
    y >= cfg.edgeMargin &&
    x <= world - cfg.edgeMargin &&
    y <= world - cfg.edgeMargin &&
    Math.hypot(x - mid, y - mid) >= cfg.centerClear;
  for (let n = 0; n < count; n++) {
    // «найкращий кандидат»: з кількох випадкових точок беремо ту, що найдалі від уже поставлених, -
    // розсип випадковий, але рівномірний (без злиплих кущів і великих порожніх зон)
    let best: { x: number; y: number } | null = null;
    let bestD = -1;
    let tries = cfg.candidates;
    for (let attempt = 0; attempt < cfg.candidates * 4; attempt++) {
      const { x, y } = candidate(n);
      if (!valid(x, y)) continue;
      if (avoid && avoid(x, y, cfg.massMax)) continue;
      let d = Infinity;
      for (const t of out) d = Math.min(d, Math.hypot(t.x - x, t.y - y));
      if (d < cfg.minGap) continue;
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
      if (--tries <= 0) break;
    }
    if (best) out.push({ ...best, mass: randomThornMass(rng, cfg) });
  }
  return out;
}

/** Номер випадкової карти (за вагами FLOCK_MAPS[].weight; рівні ваги - рівна ймовірність). */
export function pickMapId(rng: Rng): number {
  let total = 0;
  for (const m of FLOCK_MAPS) total += m.weight;
  let r = rng() * total;
  for (const m of FLOCK_MAPS) {
    r -= m.weight;
    if (r < 0) return m.id;
  }
  return FLOCK_MAPS[FLOCK_MAPS.length - 1].id;
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
  /** Надітий артефакт (0 - нічого; ARTIFACT.*). Ставить сервер за БД при вході; ботам завжди 0. */
  artifact: number;
  bot: boolean;
  /** «Вожак»: свої розпад і стеля маси, старт із більшою масою. */
  boss: boolean;
  /** «Лавове чудовисько» (орда карти «Вулкан»): бот без рубінів і без місця в таблиці лідерів, лаву ігнорує. Маса появи - у bossStart. */
  monster: boolean;
  /** Лише Вожак: маса появи, поріг таяння й поточна стеля маси (залежать від лідера на мить появи). */
  bossStart: number;
  bossDecayFrom: number;
  bossCeil: number;
  /** Лава не вбиває до цього моменту (старт, повернення з паузи, «Хрест»); гравець на паузі захищений завжди. */
  lavaSafeUntil: number;
  /** Загинув у лаві (екран смерті: «згорів»). */
  burned: boolean;
  /** Загинув поза колом режиму «Звужуване коло». */
  zoneDeath: boolean;
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
  /** Кнопка «Прискорення» утримується: кожен ввід із нею продовжує до now+SPRINT_HOLD_MS (клієнт шле ~10/с; обрив мережі = відпустив). */
  sprintUntil: number;
  /** «Прискорення» діє цього тіку (кнопка + умови за масою; ботам і паузі - ні). */
  sprinting: boolean;
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
  /** Скільки разів цей гравець за поточне життя запускав «Зорепад» (ліміт C.zorepad.maxPerPlayerLife). */
  zorepadCount: number;
  /** «Хрест»: «Друге життя» у цьому житті вже використане. */
  reviveUsed: boolean;
  /** Швидка фраза над овечкою (id з FLOCK_CONFIG.phrases.ids; until - мс світового часу). Скидається смертю й народженням. */
  phrase: { id: number; until: number; /** Свій текст (id = 0). */ text?: string } | null;
  /** Довільні дані ШІ. */
  brain?: unknown;
}

/** Вид їжі-шерсті: малюється окремим спрайтом (ножиці її більше не залишають, вид лишається для старих клієнтів). */
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
/** Калюжа «Дощу»: уповільнює клітини, чий центр у колі. */
export interface Puddle {
  id: number;
  x: number;
  y: number;
  r: number;
}

/** Старт дощу: l - скільки мс триватиме дощ, d - скільки підсихають калюжі після нього, p - [id, x, y, r]. */
export interface RainEvent {
  l: number;
  d: number;
  p: [number, number, number, number][];
}

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
  /** Скільки маси отримав той, хто взяв ножиці. */
  gain: number;
}

export interface DeathEvent {
  pid: number;
  killerPid: number;
}

/** Бонуси, що з'являються як звичайні (без рідкісних «Ножиць»: їх спавнить окремий шанс). */
const REGULAR_BONUS_KINDS = BONUS_KINDS.filter(
  (k) => k !== 'scissors' && k !== 'eagle',
);

export const radiusOf = (mass: number) => C.radiusK * Math.sqrt(mass);
/**
 * Множник швидкості з «Прискоренням»: +speedBonus до решти бонусів, але не вище maxSpeedMultiplier
 * (і ніколи не нижче того, що було без ривка: ривок швидкість не віднімає).
 */
/** Скільки мс «Прискорення» тримається після останнього вводу з утриманою кнопкою. */
const SPRINT_HOLD_MS = 450;

export const sprintedMultiplier = (m: number) =>
  Math.min(m * (1 + C.sprint.speedBonus), Math.max(m, C.sprint.maxSpeedMultiplier));

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
  /** pid гравців, що цього тіку ожили від «Хреста» (очищається щотіку). */
  readonly reviveEvents: number[] = [];
  /** «Дощ»: поточна подія (null - нема) і калюжі; rainEvents - що розіслати цього тіку (старт). */
  private rain: { endsAt: number; dryUntil: number } | null = null;
  readonly puddles: Puddle[] = [];
  /** Режим «Звужуване коло»: поточне коло (null - режиму нема). Клітини поза ним втрачають масу (stepCircle). */
  circle: { x: number; y: number; r: number } | null = null;
  readonly rainEvents: RainEvent[] = [];
  private rainNextAt = 0;
  private zActive = false;
  private zUntil = 0;
  private zNextSpawnAt = 0;
  private zNextStartAt = 0;
  private nextStarId = 1;
  readonly deaths: DeathEvent[] = [];
  /** Клітини, що цього тіку згоріли в лаві: [x, y, радіус] (очищається щотіку). */
  readonly lavaEvents: [number, number, number][] = [];
  /** Річка лави (лише карта «Вулкан»). */
  readonly lava: LavaLayout | null = null;
  /** Хто зараз перший за масою (для "часу в топ-1"). */
  leaderPid = 0;
  /** Заборонені для ШІ смуги (див. flock.nav.ts); лавова карта заповнює. */
  hazards: NavHazard[] = [];

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
    if (C.rain.maps.includes(mapId)) this.rainNextAt = this.rollRainDelay();
    if (map.lava) {
      this.lava = generateLava(rng, C.worldSize);
      this.hazards = [
        {
          y0: this.lava.y0,
          y1: this.lava.y1,
          gaps: this.lava.bridges.map((b) => ({ x0: b.x0, x1: b.x1 })),
        },
      ];
    }
    const lava = this.lava;
    const avoid = lava
      ? (x: number, y: number, mass: number) => lavaBlocked(lava, x, y, C.lava.clearMargin + radiusOf(mass))
      : undefined;
    for (const t of generateThorns(rng, { ...C.thorns, ...map.thorns }, C.worldSize, map.layout, avoid))
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
  /** Номер скіна не-боса: у межах нумерації, без зарезервованого скіна «Вожака». */
  private humanSkin(skin: number) {
    const id = Math.max(0, Math.min(NUM_SKINS - 1, Math.floor(skin) || 0));
    return id === BOSS_SKIN || isRemovedSkin(id) ? 0 : id;
  }

  addPlayer(opts: {
    name: string;
    skin: number;
    artifact?: number;
    bot?: boolean;
    boss?: boolean;
    /** Маса появи Вожака (за лідером); без неї - boss.startMass. */
    bossMass?: number;
    bossCeil?: number;
    /** «Лавове чудовисько»: скін MONSTER_SKIN, маса появи monsterMass (у bossStart), без щита й артефакта. */
    monster?: boolean;
    monsterMass?: number;
  }): Player {
    const id = this.nextId(this.nextPid, (i) => this.players.has(i));
    this.nextPid = id + 1;
    const player: Player = {
      id,
      name: opts.name,
      skin: opts.boss
        ? BOSS_SKIN
        : opts.monster
          ? MONSTER_SKIN
          : this.humanSkin(opts.skin),
      artifact: !opts.bot && isArtifactId(opts.artifact) ? opts.artifact : 0,
      bot: !!opts.bot,
      boss: !!opts.boss,
      monster: !!opts.monster,
      bossStart: opts.monster ? (opts.monsterMass ?? C.monsters.massMin) : (opts.bossMass ?? C.boss.startMass),
      bossDecayFrom: (opts.bossMass ?? C.boss.startMass) * C.boss.decayFromFraction,
      bossCeil: opts.bossCeil ?? C.boss.maxMass,
      lavaSafeUntil: 0,
      burned: false,
      zoneDeath: false,
      alive: false,
      cells: [],
      angle: 0,
      power: 0,
      effects: {},
      frozenUntil: 0,
      boostUntil: 0,
      wantSplit: false,
      wantThrow: false,
      sprintUntil: 0,
      sprinting: false,
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
      phrase: null,
      zorepadCount: 0,
      reviveUsed: false,
    };
    this.players.set(id, player);
    this.respawn(player);
    return player;
  }

  /** (Пере)народити гравця з початковою масою в безпечній точці. */
  respawn(p: Player) {
    for (const c of p.cells) this.cellsById.delete(c.id);
    p.cells = [];
    const spot = p.monster ? this.lavaSpawn() : this.safeSpawn();
    this.addCell(p, spot.x, spot.y, p.boss || p.monster ? p.bossStart : C.startMass);
    p.alive = true;
    p.effects = {};
    p.frozenUntil = 0;
    p.boostUntil = this.now + C.spawnBoost.durationMs;
    p.spawnedAt = this.now;
    p.paused = false;
    const start = p.boss || p.monster ? p.bossStart : C.startMass;
    p.maxMass = start;
    p.total = start;
    p.topMs = 0;
    p.killed = [];
    p.kills = 0;
    p.killerPid = 0;
    p.phrase = null;
    p.zorepadCount = 0;
    p.reviveUsed = false;
    p.wantSplit = p.wantThrow = false;
    p.sprintUntil = 0;
    p.sprinting = false;
    // коротка недоторканність після народження (чудовиська її не мають: з'являються в лаві, куди гравцям не можна)
    if (!p.monster) {
      p.effects.shield = this.now + C.spawnShieldMs;
      p.lavaSafeUntil = this.now + C.spawnShieldMs;
    }
    p.burned = false;
    p.zoneDeath = false;
  }

  removePlayer(pid: number) {
    const p = this.players.get(pid);
    if (!p) return;
    for (const c of p.cells) this.cellsById.delete(c.id);
    this.players.delete(pid);
  }

  /** Точка для чудовиська: випадкове місце в річці лави (у світі без лави - звичайна безпечна точка). */
  private lavaSpawn() {
    const lava = this.lava;
    if (!lava) return this.safeSpawn();
    return {
      x: this.rand(200, C.worldSize - 200),
      y: lava.y0 + this.rng() * (lava.y1 - lava.y0),
    };
  }

  private safeSpawn() {
    // запасна точка - центр світу; на карті з лавою центр у річці, тож береться ділянка над нею
    let best = this.lava
      ? { x: C.worldSize / 2, y: this.lava.y0 - 300 }
      : { x: C.worldSize / 2, y: C.worldSize / 2 };
    let bestD = -1;
    for (let i = 0; i < 8; i++) {
      let x = this.rand(150, C.worldSize - 150);
      let y = this.rand(150, C.worldSize - 150);
      // «Звужуване коло»: нові гравці з'являються всередині кола, а не поза ним (там одразу втрата маси)
      if (this.circle) {
        const a = this.rng() * TWO_PI;
        const d = Math.sqrt(this.rng()) * this.circle.r * 0.85;
        x = Math.min(C.worldSize - 150, Math.max(150, this.circle.x + Math.cos(a) * d));
        y = Math.min(C.worldSize - 150, Math.max(150, this.circle.y + Math.sin(a) * d));
      }
      if (this.lavaBlockedAt(x, y, C.lava.clearMargin + 160)) continue;
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
  setSprint(pid: number, on: boolean) {
    const p = this.players.get(pid);
    if (p) p.sprintUntil = on ? this.now + SPRINT_HOLD_MS : 0;
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
    p.sprintUntil = 0;
    p.sprinting = false;
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
    p.effects.shield = Math.max(
      p.effects.shield ?? 0,
      this.now + shieldMs,
    );
    p.lavaSafeUntil = Math.max(p.lavaSafeUntil, this.now + shieldMs);
  }

  /** Артефакт гравця (боти - завжди 0, навіть якщо поле підмінили). */
  hasArtifact(p: Player, a: number) {
    return !p.bot && p.artifact === a;
  }

  /** Новий артефакт при повторному вході (перерождення з того ж сокета). */
  setArtifact(p: Player, artifact: number) {
    p.artifact = !p.bot && isArtifactId(artifact) ? artifact : 0;
  }

  /**
   * «Шапка священника»: маса не тане перші priestHatFreeMs життя й перші priestHatFreeMs кожного
   * priestHatPeriodMs від початку життя (spawnedAt зсувається на тривалість паузи, тож пауза не рахується).
   */
  private priestHatActive(p: Player) {
    if (!this.hasArtifact(p, ARTIFACT.priestHat)) return false;
    const A = C.artifacts;
    const age = Math.max(0, this.now - p.spawnedAt);
    return age % A.priestHatPeriodMs < A.priestHatFreeMs;
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

  /** Точка в забороненій для об'єктів зоні лави (з відступом). Без лави - завжди false. */
  private lavaBlockedAt(x: number, y: number, margin: number = C.lava.clearMargin) {
    return this.lava !== null && lavaBlocked(this.lava, x, y, margin);
  }

  // ---------- спавн ----------
  private spawnFood() {
    if (this.foodById.size >= C.maxFood) return;
    const id = this.nextId(this.nextFoodId, (i) => this.foodById.has(i));
    this.nextFoodId = id + 1;
    let x = this.rand(20, C.worldSize - 20);
    let y = this.rand(20, C.worldSize - 20);
    // не в лаві й не впритул до неї (кілька спроб; лава - вузька смуга, тож майже завжди вистачає однієї)
    for (let t = 0; t < 6 && this.lavaBlockedAt(x, y, C.lava.clearMargin + C.foodRadius); t++) {
      x = this.rand(20, C.worldSize - 20);
      y = this.rand(20, C.worldSize - 20);
    }
    if (this.lavaBlockedAt(x, y, C.lava.clearMargin + C.foodRadius)) return;
    const food: Food = { id, x, y, kind: Math.floor(this.rng() * 3) };
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
    const eagle = !scissors && this.rng() < C.eagle.spawnChance;
    const kind = scissors
      ? 'scissors'
      : eagle
        ? 'eagle'
        : REGULAR_BONUS_KINDS[Math.floor(this.rng() * REGULAR_BONUS_KINDS.length)];
    let bx = this.rand(120, C.worldSize - 120);
    let by = this.rand(120, C.worldSize - 120);
    for (let t = 0; t < 6 && this.lavaBlockedAt(bx, by, C.lava.clearMargin + 40); t++) {
      bx = this.rand(120, C.worldSize - 120);
      by = this.rand(120, C.worldSize - 120);
    }
    if (this.lavaBlockedAt(bx, by, C.lava.clearMargin + 40)) return;
    this.bonuses.push({ id, x: bx, y: by, kind });
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
    const r = Math.min(
      C.viewMax,
      C.viewBase + C.viewPerSqrtMass * Math.sqrt(p.total),
    );
    // «Орлиний зір» (+ хвіст, поки камера клієнта повертається): ботів це не стосується - вони не користуються viewRadius
    return (p.effects.eagle ?? 0) + C.eagle.graceMs > this.now
      ? r * C.eagle.viewMultiplier
      : r;
  }

  // ---------- тік ----------
  tick(dt: number) {
    this.now += dt * 1000;
    this.tickNo++;
    this.foodEvents.length = 0;
    this.starEvents.length = 0;
    this.scissorsEvents.length = 0;
    this.reviveEvents.length = 0;
    this.deaths.length = 0;
    this.lavaEvents.length = 0;
    this.rainEvents.length = 0;
    const nowMs = this.now;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.paused) {
        // стоїмо: імпульс (поділ/кидок) плавно згасає, керування й злиття не працюють
        p.power = 0;
        p.sprinting = false;
        this.moveCells(p, dt);
        continue;
      }
      if (p.wantSplit) this.doSplit(p);
      if (p.wantThrow) this.doThrow(p);
      p.wantSplit = p.wantThrow = false;
      this.stepSprint(p, dt);
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
    this.stepLava(dt);
    this.stepCircle(dt);
    this.stepBonuses();

    // total, decay, статистика
    let leader: Player | null = null;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      let total = 0;
      // «Шапка священника»: у свої вікна маса не тане
      const noDecay = this.priestHatActive(p);
      const from = p.boss ? p.bossDecayFrom : C.decayFromMass;
      const rate = p.boss ? C.boss.decayPerSec : C.decayPerSec;
      for (const c of p.cells) {
        if (!p.paused && c.mass > from && !noDecay) {
          // «Вожак» тане лише від надлишку над порогом (м'яко, без обвалу); решта - від усієї маси
          c.mass -= (p.boss ? c.mass - from : c.mass) * rate * dt;
        }
        total += c.mass;
      }
      // «Вожак»: стеля маси - зайве зникає, щоб не захопив арену
      if (p.boss && total > p.bossCeil) {
        const k = p.bossCeil / total;
        for (const c of p.cells) c.mass *= k;
        total = p.bossCeil;
      }
      // чудовиська: стеля маси - надлишок після з'їдених гравців зникає
      if (p.monster && total > C.monsters.ceilMass) {
        const k = C.monsters.ceilMass / total;
        for (const c of p.cells) c.mass *= k;
        total = C.monsters.ceilMass;
      }
      p.total = total;
      if (total > p.maxMass) p.maxMass = total;
      // «Вожак» не лідер: від нього не відганяємо зірки «Зорепаду» і йому не йде час першого місця; чудовиська - теж
      if (!p.boss && !p.monster && (!leader || total > leader.total)) leader = p;
    }
    this.leaderPid = leader?.id ?? 0;
    if (leader && !leader.paused) leader.topMs += dt * 1000;

    this.stepZorepad();
    this.stepRain();

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

  /**
   * «Прискорення»: умови (кнопка, не бот, не пауза, не заморожений, маса не менша за minTotalMass) і спалювання маси.
   * Згоріла маса просто зникає; загальна маса не падає нижче max(startMass, floorMass). Щит і інші ефекти не чіпаємо.
   */
  private stepSprint(p: Player, dt: number) {
    const S = C.sprint;
    const floor = Math.max(C.startMass, S.floorMass);
    p.sprinting =
      this.now < p.sprintUntil &&
      !p.bot &&
      !p.paused &&
      this.now >= p.frozenUntil &&
      p.total >= S.minTotalMass &&
      p.total > floor;
    if (!p.sprinting) return;
    let total = 0;
    for (const c of p.cells) total += c.mass;
    if (total <= floor) {
      p.sprinting = false;
      return;
    }
    const burn = Math.min(total * S.burnPerSec * dt, total - floor);
    const k = (total - burn) / total;
    for (const c of p.cells) c.mass *= k;
  }

  private speedFor(p: Player, c: Cell) {
    if (this.now < p.frozenUntil) return 0;
    let m = p.monster ? C.monsters.speedMultiplier : this.spawnBoostFactor(p);
    if (this.hasEffect(p, 'speed')) m *= C.speedMultiplier;
    if (this.hasArtifact(p, ARTIFACT.shoes)) m *= 1 + C.artifacts.shoesSpeedBonus;
    if (p.sprinting) m = sprintedMultiplier(m);
    return Math.min(speedOf(c.mass) * m, C.maxSpeedHard) * this.puddleFactor(c.x, c.y);
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
      if (!p.alive || p.paused) continue;
      // бонус «Магніт» сильніший і не складається з артефактом: діє лише він
      let radius: number;
      let pull: number;
      if (this.hasEffect(p, 'magnet')) {
        radius = C.magnetRadius;
        pull = C.magnetPull;
      } else if (this.hasArtifact(p, ARTIFACT.magnet)) {
        radius = C.artifacts.magnetRadius;
        pull = C.artifacts.magnetPull * (1 + C.artifacts.magnetPullBonus);
      } else continue;
      for (const c of p.cells) {
        this.foodNear(c.x, c.y, radius, (f) => {
          const dx = c.x - f.x;
          const dy = c.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d > radius || d < 1) return;
          const step = Math.min(d, pull * dt);
          const oldChunk = chunkIndexOf(f.x, f.y);
          // їжа, що тягнеться магнітом, не заходить у лаву: стоїть на березі
          const nx = f.x + (dx / d) * step;
          const ny = f.y + (dy / d) * step;
          if (this.lava && inLava(this.lava, nx, ny)) return;
          f.x = nx;
          f.y = ny;
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
      // кинута маса, що приземлилась у лаву, згорає
      if (!eaten && this.lava && inLava(this.lava, b.x, b.y)) eaten = true;
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
    a.mass += victim.boss ? b.mass * C.boss.eatMassGain : b.mass;
    this.dropCell(victim, b);
    if (victim.cells.length === 0 && this.tryRevive(victim, b)) return;
    if (victim.cells.length === 0) {
      victim.alive = false;
      victim.diedAt = this.now;
      victim.killerPid = eater.id;
      victim.phrase = null;
      eater.kills++;
      if (eater.killed.length < 8) eater.killed.push(victim.name);
      this.deaths.push({ pid: victim.id, killerPid: eater.id });
    }
  }

  /**
   * «Хрест» - «Друге життя»: раз за життя, коли з'їли останню клітину, гравець одразу оживає на тому ж місці
   * з reviveMassFraction маси (за останнім відомим totalом) і коротким щитом, щоб його не з'їли знову в ту ж мить.
   */
  private tryRevive(victim: Player, last: Cell): boolean {
    if (victim.reviveUsed || !this.hasArtifact(victim, ARTIFACT.cross)) return false;
    const A = C.artifacts;
    victim.reviveUsed = true;
    const mass = Math.max(C.startMass, victim.total * A.reviveMassFraction);
    const cell = this.addCell(victim, last.x, last.y, mass);
    cell.thornImmuneUntil = this.now + A.reviveShieldMs;
    victim.total = mass;
    victim.effects.shield = Math.max(
      victim.effects.shield ?? 0,
      this.now + A.reviveShieldMs,
    );
    victim.lavaSafeUntil = Math.max(victim.lavaSafeUntil, this.now + A.reviveShieldMs);
    this.reviveEvents.push(victim.id);
    return true;
  }

  private stepFood() {
    for (const p of this.players.values()) {
      if (!p.alive || p.paused || this.isGhost(p)) continue;
      const base =
        C.foodMass *
        (this.hasEffect(p, 'double') ? 2 : 1) *
        (this.hasArtifact(p, ARTIFACT.crown) ? 1 + C.artifacts.crownFoodBonus : 1);
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

  /**
   * Лава: клітина, чий центр у лаві поза мостом, згоряє (маса нікому, кожна клітина окремо; остання - смерть гравця).
   * Не вбиває новачка на стартовому щиті, гравця на паузі й після «Хреста»: їх м'яко виштовхує на найближчий берег.
   * «Привид» і бонус «Щит» від лави не рятують.
   */
  private stepLava(dt: number) {
    const lava = this.lava;
    if (!lava) return;
    const mid = (lava.y0 + lava.y1) / 2;
    for (const p of this.players.values()) {
      if (!p.alive || p.monster) continue;
      const safe = p.paused || this.now < p.lavaSafeUntil;
      for (const c of [...p.cells]) {
        if (!inLava(lava, c.x, c.y)) continue;
        if (safe) {
          const step = C.lava.pushOutSpeed * dt;
          if (c.y < mid) c.y = Math.max(lava.y0 - 1, c.y - step);
          else c.y = Math.min(lava.y1 + 1, c.y + step);
          continue;
        }
        this.burnCell(p, c);
      }
    }
  }

  /** «Звужуване коло»: поза колом клітина втрачає масу (частка або мінімум за секунду), зовсім мала - зникає; гравець без клітин гине. */
  private stepCircle(dt: number) {
    const z = this.circle;
    if (!z) return;
    const Z = C.circle;
    for (const p of this.players.values()) {
      if (!p.alive || p.paused || p.monster) continue;
      for (const c of [...p.cells]) {
        if (Math.hypot(c.x - z.x, c.y - z.y) <= z.r) continue;
        c.mass -= Math.max(c.mass * Z.outsideLossPerSec, Z.outsideMinLossPerSec) * dt;
        if (c.mass >= Z.dieBelowMass) continue;
        this.dropCell(p, c);
        if (p.cells.length > 0) continue;
        p.alive = false;
        p.zoneDeath = true;
        p.diedAt = this.now;
        p.killerPid = 0;
        p.phrase = null;
        this.deaths.push({ pid: p.id, killerPid: 0 });
        break;
      }
    }
  }

  private burnCell(p: Player, c: Cell) {
    this.lavaEvents.push([Math.round(c.x), Math.round(c.y), Math.round(radiusOf(c.mass))]);
    this.dropCell(p, c);
    if (p.cells.length > 0) return;
    p.alive = false;
    p.burned = true;
    p.diedAt = this.now;
    p.killerPid = 0;
    p.phrase = null;
    this.deaths.push({ pid: p.id, killerPid: 0 });
  }

  private stepThorns() {
    for (const p of this.players.values()) {
      if (!p.alive || p.paused || p.monster || this.isGhost(p)) continue;
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
        n.p.frozenUntil = this.now + this.bonusMs(p, C.bonusDurations.freeze);
      }
      return;
    }
    p.effects[kind] = this.now + this.bonusMs(p, C.bonusDurations[kind]);
  }

  /** Тривалість підібраного бонуса з «Пісочним годинником» (+30%). */
  private bonusMs(p: Player, ms: number) {
    return this.hasArtifact(p, ARTIFACT.hourglass)
      ? ms * (1 + C.artifacts.hourglassDurationBonus)
      : ms;
  }

  /** «Ножиці»: хвиля навколо клітини, що підібрала бонус; зрізана маса йде тому, хто взяв (правила - у C.scissors). */
  private applyScissors(taker: Player, cell: Cell) {
    const S = C.scissors;
    const R = Math.max(S.minRadius, radiusOf(cell.mass) * S.radiusMul);
    const victims: number[] = [];
    let cutTotal = 0;
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
      const minAfter = o.boss
        ? Math.max(S.minMassAfter, C.boss.scissorsMinMassAfter)
        : S.minMassAfter;
      const allowed = Math.max(0, total - minAfter);
      const k = want > allowed ? allowed / want : 1;
      if (k <= 0) continue;
      for (const c of hit) {
        const cut = c.mass * S.cutFraction * k;
        c.mass -= cut;
        cutTotal += cut;
      }
      victims.push(o.id);
    }
    // виграш того, хто взяв: частка зрізаного, але не більше maxGainOfOwnMass його поточної маси
    let ownMass = 0;
    for (const c of taker.cells) ownMass += c.mass;
    const gain = Math.min(
      cutTotal * S.takerShare,
      ownMass * S.maxGainOfOwnMass,
    );
    if (gain > 0) cell.mass += gain;
    this.scissorsEvents.push({
      x: Math.round(cell.x),
      y: Math.round(cell.y),
      r: Math.round(R),
      taker: taker.id,
      victims,
      gain: Math.round(gain),
    });
  }

  // ---------- «Дощ» ----------
  private rollRainDelay() {
    const R = C.rain;
    return this.now + R.intervalMinMs + this.rng() * (R.intervalMaxMs - R.intervalMinMs);
  }

  /** Дощ іде просто зараз (калюжі ще й підсихають після нього - див. puddleFactor). */
  rainActive() {
    return this.rain !== null && this.now < this.rain.endsAt;
  }

  /** Множник швидкості від калюж у точці: 1 - сухо; у калюжі 1 - slowFraction (лінійно слабшає, поки калюжі підсихають). */
  puddleFactor(x: number, y: number): number {
    const rain = this.rain;
    if (!rain || this.puddles.length === 0) return 1;
    const f = this.now < rain.endsAt ? 1 : Math.max(0, (rain.dryUntil - this.now) / C.rain.dryMs);
    for (const q of this.puddles) {
      const dx = x - q.x;
      const dy = y - q.y;
      if (dx * dx + dy * dy < q.r * q.r) return 1 - C.rain.slowFraction * f;
    }
    return 1;
  }

  /** Точка в калюжі з запасом (для ботів: туди за їжею не йдуть, поки калюжі діють). */
  inPuddle(x: number, y: number, margin = 0): boolean {
    if (!this.rain) return false;
    for (const q of this.puddles) {
      const rr = q.r + margin;
      const dx = x - q.x;
      const dy = y - q.y;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  /** Стан дощу для нового клієнта (welcome): l - лишилось дощу, y - лишилось підсихання після нього, d - повне підсихання. */
  rainSnapshot() {
    const rain = this.rain;
    if (!rain) return undefined;
    return {
      l: Math.max(0, Math.round(rain.endsAt - this.now)),
      y: Math.max(0, Math.round(rain.dryUntil - Math.max(this.now, rain.endsAt))),
      d: C.rain.dryMs,
      p: this.puddles.map((q) => [q.id, Math.round(q.x), Math.round(q.y), Math.round(q.r)] as [number, number, number, number]),
    };
  }

  private stepRain() {
    if (!C.rain.maps.includes(this.mapId)) return;
    const R = C.rain;
    const rain = this.rain;
    if (rain) {
      if (this.now >= rain.dryUntil) {
        this.rain = null;
        this.puddles.length = 0;
        this.rainNextAt = this.rollRainDelay();
      }
      return;
    }
    if (this.now < this.rainNextAt || this.zActive) return;
    let human = false;
    for (const p of this.players.values()) {
      if (p.alive && !p.bot && !p.paused) {
        human = true;
        break;
      }
    }
    if (!human) return;

    const duration = R.durationMinMs + this.rng() * (R.durationMaxMs - R.durationMinMs);
    this.rain = { endsAt: this.now + duration, dryUntil: this.now + duration + R.dryMs };
    this.puddles.length = 0;
    const want = R.puddlesMin + Math.floor(this.rng() * (R.puddlesMax - R.puddlesMin + 1));
    const half = C.worldSize / 2;
    const lo = R.edgeMargin;
    const hi = C.worldSize - R.edgeMargin;
    for (let attempt = 0; attempt < want * 30 && this.puddles.length < want; attempt++) {
      const r = R.puddleRadiusMin + this.rng() * (R.puddleRadiusMax - R.puddleRadiusMin);
      const x = lo + this.rng() * (hi - lo);
      const y = lo + this.rng() * (hi - lo);
      if (Math.hypot(x - half, y - half) < R.centerClear + r) continue;
      if (this.puddles.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + r + R.gap)) continue;
      let underPlayer = false;
      for (const p of this.players.values()) {
        if (!p.alive || p.bot) continue;
        for (const c of p.cells) {
          if (Math.hypot(x - c.x, y - c.y) < r + R.gap) underPlayer = true;
        }
      }
      if (underPlayer) continue;
      this.puddles.push({ id: this.puddles.length + 1, x, y, r });
    }
    this.rainEvents.push({
      l: Math.round(duration),
      d: R.dryMs,
      p: this.puddles.map((q) => [q.id, Math.round(q.x), Math.round(q.y), Math.round(q.r)] as [number, number, number, number]),
    });
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
      const starter = this.now >= this.zNextStartAt ? this.zorepadStarter() : null;
      if (starter) {
        starter.zorepadCount++;
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

  /**
   * Хто запускає подію: найбільша жива людина (не на паузі) з масою від triggerMass, яка ще не вичерпала
   * maxPerPlayerLife запусків у цьому житті; на арені має бути хоча б minAlive живих гравців.
   */
  private zorepadStarter(): Player | null {
    const Z = C.zorepad;
    // під час дощу «Зорепад» чекає його кінця (дощ і зорепад не йдуть разом)
    if (this.rainActive()) return null;
    let alive = 0;
    let starter: Player | null = null;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      alive++;
      if (p.bot || p.paused || p.total < Z.triggerMass) continue;
      if (p.zorepadCount >= Z.maxPerPlayerLife) continue;
      if (!starter || p.total > starter.total) starter = p;
    }
    return alive >= Z.minAlive ? starter : null;
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
      if (this.lavaBlockedAt(x, y, C.lava.clearMargin + 60)) continue;
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
      .filter((p) => p.alive && !p.monster)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.alive) n++;
    return n;
  }
}
