import { FLOCK_CONFIG, TEAM_SHEEP, TEAM_WOLF, TEAM_FREE_SKINS, teamViewRadius } from './flock.config';
import type { Cell, FlockWorld, Player, Rng } from './flock.engine';
import { radiusOf } from './flock.engine';
import { buildTerraces, circleOnIsland, islandAt, nearestLand, onLand as tOnLand, routeTerraces, type TerracesGeom } from './flock.terraces';

const T = FLOCK_CONFIG.teamMode;
const W = FLOCK_CONFIG.worldSize;
const SQ2 = Math.SQRT2;

// ---------------------------------------------------------------------------
// Геометрія карти «Ліс і озеро» (однакова на сервері й клієнті: клієнт отримує ці числа в welcome)
// ---------------------------------------------------------------------------

/** Річка: діагональна смуга вздовж y = x; мости - прямокутники поперек неї (s - позиція центра моста вздовж осі). */
export interface RiverGeom {
  hw: number;
  bridges: number[];
  bw: number;
  over: number;
}

export interface CastlePos {
  team: number;
  x: number;
  y: number;
  /** Радіус зони бази навколо замка. */
  r: number;
}

export interface CastleMapGeom {
  /** Вид карти: 'river' - «Ліс і озеро» (діагональна річка), 'terraces' - «Небесні тераси» (острови з мостами). */
  kind: 'river' | 'terraces';
  /** Оформлення островної карти: 'ruins' - «Затонулі руїни» (ті самі острови й мости, але на воді); без поля - небо. Механіка не залежить від оформлення. */
  skin?: 'ruins';
  river: RiverGeom;
  /** Лише для kind 'terraces'. */
  terraces?: TerracesGeom;
  castles: [CastlePos, CastlePos];
  /** Радіус сховища навколо центра замка (де краде злодій). */
  steal: number;
  bushes: { x: number; y: number; mass: number }[];
  seed: number;
}

/** Відстань вздовж осі річки (s) та поперек неї (d, зі знаком: d < 0 - бік овець у лівому нижньому куті). */
export const riverD = (x: number, y: number) => (x - y) / SQ2;
export const riverS = (x: number, y: number) => (x + y) / SQ2;

/** Точка у воді: у смузі річки й поза мостом. */
export function inWater(g: RiverGeom, x: number, y: number): boolean {
  if (Math.abs(riverD(x, y)) >= g.hw) return false;
  const s = riverS(x, y);
  for (const b of g.bridges) if (Math.abs(s - b) < g.bw / 2) return false;
  return true;
}

/** Чия територія: 1 (вівці, d <= 0) або 2 (вовки, d > 0). Річка ділиться навпіл. */
export const sideOf = (x: number, y: number) => (riverD(x, y) <= 0 ? TEAM_SHEEP : TEAM_WOLF);
export const enemyOf = (team: number) => (team === TEAM_SHEEP ? TEAM_WOLF : TEAM_SHEEP);

/** Чия територія на цій карті: на річковій - за діагоналлю, на терасах - за половиною (овечий бік знизу). */
export const sideAt = (g: CastleMapGeom, x: number, y: number) => (g.kind === 'terraces' ? (y >= W / 2 ? TEAM_SHEEP : TEAM_WOLF) : sideOf(x, y));

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cachedMaps = new Map<string, CastleMapGeom>();

/** Геометрія карти (будується один раз на вид; детермінована за seed). Обидва боки дзеркальні відносно центра світу. */
export function castleMap(kind: 'river' | 'terraces' | 'ruins' = 'river'): CastleMapGeom {
  const hit = cachedMaps.get(kind);
  if (hit) return hit;
  const made =
    kind === 'terraces' ? buildTerracesMap() : kind === 'ruins' ? { ...buildTerracesMap(T.terraces.seed + 7), skin: 'ruins' as const } : buildRiverMap();
  cachedMaps.set(kind, made);
  return made;
}

function buildRiverMap(): CastleMapGeom {
  const M = T.map;
  const axis = W * SQ2;
  const river: RiverGeom = {
    hw: M.riverHalfWidth,
    bridges: M.bridgeAt.map((k) => Math.round(axis * k)),
    bw: M.bridgeWidth,
    over: M.bridgeOver,
  };
  const sheep: CastlePos = { team: TEAM_SHEEP, x: M.sheepCastle.x, y: M.sheepCastle.y, r: T.baseRadius };
  const wolf: CastlePos = { team: TEAM_WOLF, x: W - sheep.x, y: W - sheep.y, r: T.baseRadius };
  const rng = mulberry32(M.seed);
  const half: { x: number; y: number; r: number }[] = [];
  for (let tries = 0; half.length < M.bushesPerSide && tries < 6000; tries++) {
    const r = M.bushRadiusMin + rng() * (M.bushRadiusMax - M.bushRadiusMin);
    const x = 150 + r + rng() * (W - 300 - 2 * r);
    const y = 150 + r + rng() * (W - 300 - 2 * r);
    const d = riverD(x, y);
    // лише бік овець (дзеркало дає вовчий)
    if (d > -(river.hw + M.bushRiverGap + r)) continue;
    if (Math.hypot(x - sheep.x, y - sheep.y) < sheep.r + M.bushBaseGap + r) continue;
    // не перекривати підходи до мостів
    const s = riverS(x, y);
    if (river.bridges.some((b) => Math.abs(s - b) < river.bw / 2 + r && Math.abs(d) < river.hw + 360)) continue;
    if (half.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + M.bushGap)) continue;
    half.push({ x, y, r });
  }
  const bushes: CastleMapGeom['bushes'] = [];
  for (const b of half) {
    const mass = Math.round((b.r / FLOCK_CONFIG.radiusK) ** 2);
    bushes.push({ x: Math.round(b.x), y: Math.round(b.y), mass });
    bushes.push({ x: Math.round(W - b.x), y: Math.round(W - b.y), mass });
  }
  return { kind: 'river', river, castles: [sheep, wolf], steal: T.stealRadius, bushes, seed: M.seed };
}

/** «Небесні тераси»: острови, мости, замки на крайніх островах і кущі-укриття на островах (одна половина + дзеркало). */
function buildTerracesMap(seed: number = T.terraces.seed): CastleMapGeom {
  const TT = T.terraces;
  const g = buildTerraces(W, TT.bridgeWidth);
  const sheepIsland = g.islands[0][0];
  const sheep: CastlePos = { team: TEAM_SHEEP, x: sheepIsland[0], y: sheepIsland[1], r: TT.baseRadius };
  const wolf: CastlePos = { team: TEAM_WOLF, x: W - sheep.x, y: W - sheep.y, r: TT.baseRadius };
  const rng = mulberry32(seed);
  const M = T.map;
  const half: { x: number; y: number; r: number }[] = [];
  for (let tries = 0; half.length < TT.bushesPerSide && tries < 8000; tries++) {
    const r = TT.bushRadiusMin + rng() * (TT.bushRadiusMax - TT.bushRadiusMin);
    const x = 150 + rng() * (W - 300);
    const y = W / 2 + rng() * (W / 2 - 150); // овечий бік (знизу), дзеркало дає вовчий
    if (!circleOnIsland(g, x, y, r, 22)) continue;
    if (Math.hypot(x - sheep.x, y - sheep.y) < sheep.r + M.bushBaseGap + r) continue;
    // не на підходах до мостів
    if (g.bridges.some((b) => Math.hypot(x - b.x1, y - b.y1) < r + 130 || Math.hypot(x - b.x2, y - b.y2) < r + 130)) continue;
    if (half.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + M.bushGap)) continue;
    // центральний острів самозеркальний: кущ не ближче середини до свого дзеркала
    if (Math.hypot(x - (W - x), y - (W - y)) < 2 * r + M.bushGap) continue;
    half.push({ x, y, r });
  }
  const bushes: CastleMapGeom['bushes'] = [];
  for (const b of half) {
    const mass = Math.round((b.r / FLOCK_CONFIG.radiusK) ** 2);
    bushes.push({ x: Math.round(b.x), y: Math.round(b.y), mass });
    bushes.push({ x: Math.round(W - b.x), y: Math.round(W - b.y), mass });
  }
  // «річки» тут нема: вироджена, щоб спільний код (вода, укриття) нічого не знаходив
  const river: RiverGeom = { hw: 0, bridges: [], bw: 0, over: 0 };
  return { kind: 'terraces', river, terraces: g, castles: [sheep, wolf], steal: T.stealRadius, bushes, seed };
}

// ---------------------------------------------------------------------------
// Правила рушія для командного режиму
// ---------------------------------------------------------------------------

export interface TeamRules {
  mass: number;
  viewRadius: number;
  spawnPoint(p: Player): { x: number; y: number };
  speed(p: Player, c: Cell): number;
}

// ---------------------------------------------------------------------------
// Матч
// ---------------------------------------------------------------------------

/** 0 - чекаємо гравців, 1 - відлік до старту, 2 - бій, 3 - підсумки. */
export type TeamPhase = 0 | 1 | 2 | 3;
type Role = 'thief' | 'guard';

interface CP {
  pid: number;
  team: number;
  bot: boolean;
  userId: string | null;
  role: Role;
  /** Пост захисника: 0 - сховище, далі входи на територію (див. guardPosts). */
  post: number;
  /** Команда-власник камінця, що несе гравець (0 - нічого не несе). */
  carry: number;
  stealMs: number;
  /** Скільки мс центр клітини вже над порожнечею («Небесні тераси»). */
  voidMs: number;
  /** Світовий час, коли закінчиться відродження (0 - не відроджується). */
  respawnUntil: number;
  actions: number;
  moved: number;
  lastAngle: number;
  lastPower: number;
  lastX: number;
  lastY: number;
  delivered: number;
  caught: number;
  stolen: number;
}

interface Stone {
  id: number;
  x: number;
  y: number;
  owner: number;
  expiresAt: number;
  /** Кинутий камінь: до цього світового часу він летить із (fx, fy) у (x, y) і не підбирається. */
  flyUntil?: number;
  fx?: number;
  fy?: number;
  /** Кидальник не підбирає камінь до цього часу. */
  lockPid?: number;
  lockUntil?: number;
}

export interface TeamEvent {
  k: 'steal' | 'deliver' | 'drop' | 'return' | 'castle' | 'fall' | 'throw';
  p: number;
  t: number;
}

export interface TeamSummaryRow {
  n: string;
  t: number;
  b: 0 | 1;
  d: number;
  c: number;
  s: number;
}

export interface TeamSummary {
  win: number;
  sc: [number, number];
  hp: [number, number];
  rows: TeamSummaryRow[];
  restartMs: number;
}

/** Підсумок матчу для нарахування нагород (шлюз рахує БД; тут лише вимірювання). */
export interface TeamSettlement {
  matchId: string;
  win: number;
  durationMs: number;
  /** Скільки мс матчу в команді була хоч одна жива людина. */
  humanMs: [number, number];
  players: {
    pid: number;
    userId: string;
    team: number;
    actions: number;
    moved: number;
  }[];
}

const STONE_R = 28;

export class CastleMatch {
  readonly geom: CastleMapGeom;
  phase: TeamPhase = 0;
  readonly hp: [number, number] = [T.castleHp, T.castleHp];
  readonly score: [number, number] = [0, 0];
  readonly stock: [number, number] = [T.stonesPerCastle, T.stonesPerCastle];
  private readonly cps = new Map<number, CP>();
  private stones: Stone[] = [];
  private nextStoneId = 1;
  private countAt = 0;
  private matchStart = 0;
  private endAt = 0;
  private matchNo = 0;
  private matchId = '';
  private humanMs: [number, number] = [0, 0];
  private events: TeamEvent[] = [];
  private lastWin = 0;
  /** Підсумок, що ще не розіслано (забирає менеджер). */
  private pendingEnd: { summary: TeamSummary; settlement: TeamSettlement } | null = null;
  /** Хто кому прихований у кущах: ключ - команда глядача. */
  private readonly hidden: [Set<number>, Set<number>] = [new Set(), new Set()];
  /** «Хвиля» нападу кожної команди: злодії збираються на плацдармі й вирушають разом (до якого часу триває хвиля / коли можна наступну). */
  private readonly waveUntil: [number, number] = [0, 0];
  private readonly waveNext: [number, number] = [0, 0];

  constructor(
    private readonly world: FlockWorld,
    private readonly rng: Rng,
    kind: 'river' | 'terraces' | 'ruins' = 'river',
  ) {
    this.geom = castleMap(kind);
  }

  /** Правила для рушія (world.team). */
  readonly rules: TeamRules = {
    mass: T.playerMass,
    viewRadius: teamViewRadius(),
    spawnPoint: (p) => this.spawnPoint(p.team, p.id),
    speed: (p) => this.speedOf(p),
  };

  // ---------- склад ----------
  humans(team: number) {
    let n = 0;
    for (const cp of this.cps.values()) if (!cp.bot && cp.team === team) n++;
    return n;
  }

  botsOf(team: number): number[] {
    const out: number[] = [];
    for (const cp of this.cps.values()) if (cp.bot && cp.team === team) out.push(cp.pid);
    return out;
  }

  teamOf(pid: number) {
    return this.cps.get(pid)?.team ?? 0;
  }

  add(p: Player, team: number, userId: string | null) {
    const bot = userId === null;
    let role: Role = 'guard';
    let post = 0;
    if (bot) {
      const mates = this.botsOf(team).map((id) => this.cps.get(id)!);
      const thieves = mates.filter((m) => m.role === 'thief').length;
      role = thieves / (mates.length + 1) < T.bots.thiefShare ? 'thief' : 'guard';
      // захисники розходяться по постах по черзі (0 - сховище)
      post = mates.filter((m) => m.role === 'guard').length;
    }
    const c = p.cells[0];
    this.cps.set(p.id, {
      pid: p.id,
      team,
      bot,
      userId,
      role,
      post,
      carry: 0,
      stealMs: 0,
      voidMs: 0,
      respawnUntil: 0,
      actions: 0,
      moved: 0,
      lastAngle: 0,
      lastPower: 0,
      lastX: c?.x ?? 0,
      lastY: c?.y ?? 0,
      delivered: 0,
      caught: 0,
      stolen: 0,
    });
  }

  /** Гравець іде (вихід, кінець паузи, прибраний бот): камінь, що він ніс, лишається лежати на місці. */
  remove(pid: number) {
    const cp = this.cps.get(pid);
    if (!cp) return;
    const p = this.world.players.get(pid);
    if (cp.carry && p?.cells[0]) this.dropStone(cp, p.cells[0].x, p.cells[0].y);
    this.cps.delete(pid);
  }

  /** Скільки ботів потрібно команді зараз (до регулятора навантаження). */
  wantedBots(team: number) {
    if (this.phase === 0) return 0;
    return Math.max(0, T.teamSize - this.humans(team));
  }

  /** Лобі: скільки людей на кожній стороні. */
  lobby() {
    return {
      sheep: this.humans(TEAM_SHEEP),
      wolves: this.humans(TEAM_WOLF),
      phase: this.phase,
      leftMs: this.leftMs(),
    };
  }

  /** Чи можна людині зайняти сторону (баланс: не випереджати іншу на balanceGap і більше; не більше maxTeamSize). */
  canJoin(team: number): 'ok' | 'team_full' | 'team_unbalanced' {
    const mine = this.humans(team);
    if (mine >= T.maxTeamSize) return 'team_full';
    if (mine - this.humans(enemyOf(team)) >= T.balanceGap) return 'team_unbalanced';
    return 'ok';
  }

  /** Ввід гравця: зміна напрямку чи сили - це «дія» (для захисту від AFK). */
  noteInput(pid: number, angle: number, power: number) {
    const cp = this.cps.get(pid);
    if (!cp || this.phase !== 2) return;
    const da = Math.abs(Math.atan2(Math.sin(angle - cp.lastAngle), Math.cos(angle - cp.lastAngle)));
    if (da > 0.12 || Math.abs(power - cp.lastPower) > 0.25) cp.actions++;
    cp.lastAngle = angle;
    cp.lastPower = power;
  }

  // ---------- геометрія й правила ----------
  private castleOf(team: number) {
    return this.geom.castles[team - 1];
  }

  spawnPoint(team: number, pid: number) {
    const c = this.castleOf(team);
    // до центра світу, віялом поперек цього напрямку
    const toward = Math.atan2(W / 2 - c.y, W / 2 - c.x);
    const k = (pid % 7) - 3;
    const along = 120 + (pid % 3) * 28;
    // 8 на 8: ще один ряд назад, щоб стартові точки не накладались
    const back = Math.floor(pid / 7) % 2 === 1 ? -70 : 0;
    const px = Math.cos(toward + Math.PI / 2);
    const py = Math.sin(toward + Math.PI / 2);
    return {
      x: c.x + Math.cos(toward) * (along + back) + px * k * 46,
      y: c.y + Math.sin(toward) * (along + back) + py * k * 46,
    };
  }

  private speedOf(p: Player) {
    const cp = this.cps.get(p.id);
    if (!cp || cp.respawnUntil > 0 || p.paused) return 0;
    let v = T.playerSpeed;
    const c = p.cells[0];
    if (c && this.geom.kind === 'river' && inWater(this.geom.river, c.x, c.y)) v *= 1 - T.waterSlow;
    if (cp.carry) v *= 1 - T.carrySlow;
    return v;
  }

  /** Гравця pid не показуємо глядачам команди viewerTeam (кущі, відродження). */
  hiddenFrom(viewerTeam: number, pid: number) {
    return this.hidden[viewerTeam - 1]?.has(pid) ?? false;
  }

  private computeHidden() {
    const w = this.world;
    this.hidden[0].clear();
    this.hidden[1].clear();
    const R2 = T.bushRevealRadius * T.bushRevealRadius;
    for (const cp of this.cps.values()) {
      const o = w.players.get(cp.pid);
      const c = o?.cells[0];
      if (!o || !o.alive || !c) continue;
      const viewer = enemyOf(cp.team);
      let hide = cp.respawnUntil > 0;
      if (!hide && (this.geom.kind === 'terraces' ? tOnLand(this.geom.terraces!, c.x, c.y) : !inWater(this.geom.river, c.x, c.y))) {
        for (const t of w.thorns) {
          const tr = radiusOf(t.mass);
          if (Math.hypot(c.x - t.x, c.y - t.y) < tr) {
            hide = true;
            break;
          }
        }
        if (hide) {
          // ворог (будь-хто з команди глядача) ближче за радіус виявлення - кущ не ховає
          for (const q of this.cps.values()) {
            if (q.team !== viewer) continue;
            const qc = w.players.get(q.pid)?.cells[0];
            if (!qc) continue;
            const dx = qc.x - c.x;
            const dy = qc.y - c.y;
            if (dx * dx + dy * dy < R2) {
              hide = false;
              break;
            }
          }
        }
      }
      if (hide) this.hidden[viewer - 1].add(cp.pid);
    }
  }

  // ---------- крок ----------
  private leftMs(): number {
    const now = this.world.now;
    if (this.phase === 1) return Math.max(0, this.countAt - now);
    if (this.phase === 2) return Math.max(0, this.matchStart + T.matchMs - now);
    if (this.phase === 3) return Math.max(0, this.endAt - now);
    return 0;
  }

  private startCondition() {
    const h1 = this.humans(TEAM_SHEEP);
    const h2 = this.humans(TEAM_WOLF);
    if (h1 + h2 === 0) return false;
    return h1 >= T.startMinHumansEachTeam && h2 >= T.startMinHumansEachTeam;
  }

  private resetMatch() {
    this.hp[0] = this.hp[1] = T.castleHp;
    this.score[0] = this.score[1] = 0;
    this.stock[0] = this.stock[1] = T.stonesPerCastle;
    this.stones = [];
    this.humanMs = [0, 0];
    for (const cp of this.cps.values()) {
      cp.carry = 0;
      cp.stealMs = 0;
      cp.voidMs = 0;
      cp.respawnUntil = 0;
      cp.actions = 0;
      cp.moved = 0;
      cp.delivered = cp.caught = cp.stolen = 0;
      const p = this.world.players.get(cp.pid);
      if (p) {
        this.world.respawn(p);
        const c = p.cells[0];
        if (c) {
          cp.lastX = c.x;
          cp.lastY = c.y;
        }
      }
    }
  }

  private startMatch() {
    this.matchNo++;
    this.matchId = `${this.matchNo}-${Math.floor(this.rng() * 1e9).toString(36)}-${Date.now().toString(36)}`;
    this.resetMatch();
    this.phase = 2;
    this.matchStart = this.world.now;
    this.events.length = 0;
    this.waveUntil[0] = this.waveUntil[1] = 0;
    this.waveNext[0] = this.waveNext[1] = this.world.now + T.bots.waveFirstMs;
  }

  /** Один крок після тіку світу: фази, крадіжка, доставка, піймання, камені на землі. */
  step(dt: number) {
    const w = this.world;
    const now = w.now;
    this.events.length = 0;
    if (this.phase === 0) {
      if (this.startCondition()) {
        this.phase = 1;
        this.countAt = now + T.countdownMs;
      }
    } else if (this.phase === 1) {
      if (!this.startCondition()) this.phase = 0;
      else if (now >= this.countAt) this.startMatch();
    } else if (this.phase === 3) {
      if (now >= this.endAt) {
        this.phase = 0;
        this.resetMatch();
      }
    }
    if (this.phase === 2) {
      this.updateWaves();
      this.stepPlay(dt);
    } else this.trackMovement(false);
    if (this.geom.kind === 'terraces') this.stepTerraces(dt);
    this.computeHidden();
  }

  /**
   * «Небесні тераси»: клітина, чий центр поза островами й мостами довше fallMs, падає: камінь, що вона несла, лишається лежати на найближчій
   * опорі, а сама клітина відроджується у своєму замку (як спійманий злодій). Бот у порожнечу не потрапляє (його повертає на опору),
   * а в паузах між фазами, під щитом і на паузі гравця падіння не діє: клітину м'яко повертає на острів.
   */
  private stepTerraces(dt: number) {
    const g = this.geom.terraces as TerracesGeom;
    const TT = T.terraces;
    const w = this.world;
    for (const cp of this.cps.values()) {
      const p = w.players.get(cp.pid);
      const c = p?.cells[0];
      if (!p || !c) continue;
      if (tOnLand(g, c.x, c.y)) {
        cp.voidMs = 0;
        continue;
      }
      const spot = nearestLand(g, c.x, c.y);
      if (cp.bot) {
        c.x = spot.x;
        c.y = spot.y;
        cp.voidMs = 0;
        continue;
      }
      if (this.phase !== 2 || cp.respawnUntil > 0 || w.isShielded(p) || p.paused) {
        // м'яко до найближчої опори
        const dx = spot.x - c.x;
        const dy = spot.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, TT.pushBackSpeed * dt);
        c.x += (dx / d) * step;
        c.y += (dy / d) * step;
        cp.voidMs = 0;
        continue;
      }
      cp.voidMs += dt * 1000;
      if (cp.voidMs < TT.fallMs) continue;
      cp.voidMs = 0;
      if (cp.carry) this.dropStone(cp, spot.x, spot.y);
      this.events.push({ k: 'fall', p: cp.pid, t: cp.team });
      this.sendHome(cp, p);
    }
  }

  private trackMovement(count: boolean) {
    for (const cp of this.cps.values()) {
      const c = this.world.players.get(cp.pid)?.cells[0];
      if (!c) continue;
      if (count) {
        const d = Math.hypot(c.x - cp.lastX, c.y - cp.lastY);
        if (d < 150) cp.moved += d;
      }
      cp.lastX = c.x;
      cp.lastY = c.y;
    }
  }

  private stepPlay(dt: number) {
    const w = this.world;
    const now = w.now;
    this.trackMovement(true);
    for (const team of [TEAM_SHEEP, TEAM_WOLF]) if (this.humans(team) > 0) this.humanMs[team - 1] += dt * 1000;

    // відродження, що минуло
    for (const cp of this.cps.values()) if (cp.respawnUntil > 0 && now >= cp.respawnUntil) cp.respawnUntil = 0;

    for (const cp of this.cps.values()) {
      const p = w.players.get(cp.pid);
      const c = p?.cells[0];
      if (!p || !c || cp.respawnUntil > 0) continue;
      const enemy = enemyOf(cp.team);
      // крадіжка: стоїмо біля чужого сховища stealHoldMs
      if (!cp.carry) {
        const E = this.castleOf(enemy);
        if (this.stock[enemy - 1] > 0 && Math.hypot(c.x - E.x, c.y - E.y) <= this.geom.steal) {
          cp.stealMs += dt * 1000;
          if (cp.stealMs >= T.stealHoldMs) {
            cp.stealMs = 0;
            cp.carry = enemy;
            cp.stolen++;
            this.stock[enemy - 1]--;
            this.events.push({ k: 'steal', p: cp.pid, t: cp.team });
          }
        } else cp.stealMs = 0;
      } else {
        // доставка: у зоні своєї бази
        const own = this.castleOf(cp.team);
        if (Math.hypot(c.x - own.x, c.y - own.y) <= own.r) {
          cp.carry = 0;
          cp.delivered++;
          this.score[cp.team - 1]++;
          this.hp[enemy - 1] = Math.max(0, this.hp[enemy - 1] - T.damagePerStone);
          this.events.push({ k: 'deliver', p: cp.pid, t: cp.team });
          this.events.push({ k: 'castle', p: cp.pid, t: enemy });
          if (this.hp[enemy - 1] <= 0) {
            this.endMatch(cp.team);
            return;
          }
        }
      }
    }

    // піймання: захисник торкається злодія на території своєї команди
    for (const th of this.cps.values()) {
      if (!th.carry || th.respawnUntil > 0) continue;
      const tp = w.players.get(th.pid);
      const tc = tp?.cells[0];
      if (!tp || !tc || w.isShielded(tp)) continue;
      const defenders = enemyOf(th.team);
      if (sideAt(this.geom, tc.x, tc.y) !== defenders) continue;
      for (const df of this.cps.values()) {
        if (df.team !== defenders || df.respawnUntil > 0) continue;
        const dc = w.players.get(df.pid)?.cells[0];
        if (!dc) continue;
        if (Math.hypot(dc.x - tc.x, dc.y - tc.y) > radiusOf(tc.mass) + radiusOf(dc.mass) + T.touchMargin) continue;
        df.caught++;
        this.dropStone(th, tc.x, tc.y);
        this.sendHome(th, tp);
        break;
      }
    }

    // камені, що лежать
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      if (now >= s.expiresAt) {
        this.stock[s.owner - 1]++;
        this.events.push({ k: 'return', p: 0, t: s.owner });
        this.stones.splice(i, 1);
        continue;
      }
      if (s.flyUntil && now < s.flyUntil) continue;
      for (const cp of this.cps.values()) {
        if (cp.respawnUntil > 0) continue;
        if (s.lockPid === cp.pid && s.lockUntil && now < s.lockUntil) continue;
        const c = w.players.get(cp.pid)?.cells[0];
        if (!c || Math.hypot(c.x - s.x, c.y - s.y) > radiusOf(c.mass) + STONE_R) continue;
        if (cp.team === s.owner) {
          this.stock[s.owner - 1]++;
          this.events.push({ k: 'return', p: cp.pid, t: s.owner });
          this.stones.splice(i, 1);
          break;
        }
        if (!cp.carry) {
          cp.carry = s.owner;
          this.events.push({ k: 'steal', p: cp.pid, t: cp.team });
          this.stones.splice(i, 1);
          break;
        }
      }
    }

    if (now - this.matchStart >= T.matchMs) {
      const dmg1 = T.castleHp - this.hp[1]; // шкода, завдана вівцями (замку вовків)
      const dmg2 = T.castleHp - this.hp[0];
      this.endMatch(dmg1 > dmg2 ? TEAM_SHEEP : dmg2 > dmg1 ? TEAM_WOLF : 0);
    }
  }

  /**
   * Кинути камінь: летить уздовж поточного напрямку на throwRange (зупиняється перед краєм світу чи порожнечею), лягає й чекає,
   * доки його підбере хтось інший (кидальник - не раніше throwerLockMs після приземлення).
   */
  throwStone(pid: number) {
    const cp = this.cps.get(pid);
    if (!cp || this.phase !== 2 || !cp.carry || cp.respawnUntil > 0) return;
    const p = this.world.players.get(pid);
    const c = p?.cells[0];
    if (!p || !c) return;
    const a = p.angle;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const valid = (x: number, y: number) => {
      if (x < 40 || y < 40 || x > W - 40 || y > W - 40) return false;
      return this.geom.kind === 'terraces' ? tOnLand(this.geom.terraces!, x, y) : true;
    };
    let tx = c.x;
    let ty = c.y;
    for (let d = 20; d <= T.throwRange; d += 20) {
      const x = c.x + dx * d;
      const y = c.y + dy * d;
      if (!valid(x, y)) break;
      tx = x;
      ty = y;
    }
    const now = this.world.now;
    this.stones.push({
      id: this.nextStoneId++,
      x: tx,
      y: ty,
      fx: c.x,
      fy: c.y,
      owner: cp.carry,
      flyUntil: now + T.throwMs,
      lockPid: pid,
      lockUntil: now + T.throwMs + T.throwerLockMs,
      expiresAt: now + T.throwMs + T.lyingReturnMs,
    });
    this.events.push({ k: 'throw', p: pid, t: cp.team });
    cp.carry = 0;
  }

  private dropStone(cp: CP, x: number, y: number) {
    if (!cp.carry) return;
    this.stones.push({ id: this.nextStoneId++, x, y, owner: cp.carry, expiresAt: this.world.now + T.lyingReturnMs });
    this.events.push({ k: 'drop', p: cp.pid, t: cp.team });
    cp.carry = 0;
  }

  /** Спійманий злодій відроджується у своєму замку через respawnMs (потім ще respawnShieldMs захисту). */
  private sendHome(cp: CP, p: Player) {
    const spot = this.spawnPoint(cp.team, cp.pid);
    const c = p.cells[0];
    if (c) {
      c.x = spot.x;
      c.y = spot.y;
      cp.lastX = spot.x;
      cp.lastY = spot.y;
    }
    p.power = 0;
    cp.stealMs = 0;
    cp.respawnUntil = this.world.now + T.respawnMs;
    p.effects.shield = this.world.now + T.respawnMs + T.respawnShieldMs;
  }

  private endMatch(win: number) {
    const w = this.world;
    this.phase = 3;
    this.endAt = w.now + T.endHoldMs;
    this.lastWin = win;
    for (const cp of this.cps.values()) {
      cp.carry = 0;
      cp.respawnUntil = 0;
    }
    this.stones = [];
    const rows: TeamSummaryRow[] = [];
    for (const cp of this.cps.values()) {
      const p = w.players.get(cp.pid);
      rows.push({ n: p?.name ?? '', t: cp.team, b: cp.bot ? 1 : 0, d: cp.delivered, c: cp.caught, s: cp.stolen });
    }
    rows.sort((a, b) => a.t - b.t || b.d - a.d || b.c - a.c);
    const summary: TeamSummary = { win, sc: [this.score[0], this.score[1]], hp: [this.hp[0], this.hp[1]], rows, restartMs: T.endHoldMs };
    const settlement: TeamSettlement = {
      matchId: this.matchId,
      win,
      durationMs: w.now - this.matchStart,
      humanMs: [this.humanMs[0], this.humanMs[1]],
      players: [...this.cps.values()]
        .filter((cp) => !cp.bot && cp.userId)
        .map((cp) => ({ pid: cp.pid, userId: cp.userId as string, team: cp.team, actions: cp.actions, moved: Math.round(cp.moved) })),
    };
    this.pendingEnd = { summary, settlement };
  }

  /** Підсумок матчу, що щойно скінчився (один раз); null - нема. */
  takeEnd() {
    const e = this.pendingEnd;
    this.pendingEnd = null;
    return e;
  }

  // ---------- повідомлення клієнтам ----------
  /** Стан матчу `cm` для глядача (pid): спільні поля + союзники, прогрес крадіжки, відродження, події цього проміжку. */
  state(viewerPid: number) {
    const events = this.acc;
    const w = this.world;
    const me = this.cps.get(viewerPid);
    const team = me?.team ?? 0;
    const tm: [number, number][] = [];
    const cr: [number, number, number, number][] = [];
    const al: [number, number, number][] = [];
    for (const cp of this.cps.values()) {
      tm.push([cp.pid, cp.team]);
      const c = w.players.get(cp.pid)?.cells[0];
      if (!c) continue;
      if (cp.carry) cr.push([cp.pid, Math.round(c.x), Math.round(c.y), cp.carry]);
      if (cp.team === team && cp.pid !== viewerPid) al.push([cp.pid, Math.round(c.x), Math.round(c.y)]);
    }
    const ev: { k: string; p: number; t: number }[] = events.map((e) => ({ k: e.k, p: e.p, t: e.t }));
    if (this.pendingEvents.length && team) {
      for (const e of this.pendingEvents) ev.push({ k: e.t === 0 ? 'draw' : e.t === team ? 'win' : 'lose', p: 0, t: e.t });
    }
    return {
      ph: this.phase,
      left: Math.round(this.leftMs()),
      sc: [this.score[0], this.score[1]],
      hp: [this.hp[0], this.hp[1]],
      st: [this.stock[0], this.stock[1]],
      hu: [this.humans(TEAM_SHEEP), this.humans(TEAM_WOLF)],
      tm,
      cr,
      ls: this.stones.map((s) =>
        s.flyUntil && w.now < s.flyUntil
          ? [s.id, Math.round(s.x), Math.round(s.y), s.owner, Math.round(s.expiresAt - w.now), Math.round(s.flyUntil - w.now), Math.round(s.fx ?? s.x), Math.round(s.fy ?? s.y)]
          : [s.id, Math.round(s.x), Math.round(s.y), s.owner, Math.round(s.expiresAt - w.now)]
      ),
      al,
      sp: me && me.stealMs > 0 ? Math.min(1, me.stealMs / T.stealHoldMs) : 0,
      rs: me && me.respawnUntil > 0 ? Math.round(me.respawnUntil - w.now) : 0,
      /** «Небесні тераси»: частка часу до падіння (0..1), поки центр своєї клітини над порожнечею. */
      fl: me && me.voidMs > 0 ? Math.min(1, me.voidMs / T.terraces.fallMs) : 0,
      ev,
    };
  }

  /** События цього проміжку між розсилками `cm` (накопичуються, поки менеджер їх не забере). */
  private acc: TeamEvent[] = [];
  private pendingEvents: { t: number }[] = [];

  /** Менеджер викликає після кожного step: події цього тіку додаємо до накопичених. */
  collect() {
    for (const e of this.events) this.acc.push(e);
    if (this.phase === 3 && this.pendingEnd) this.pendingEvents = [{ t: this.lastWin }];
  }

  /** Забрати накопичені події (після розсилки `cm`). */
  drain(): TeamEvent[] {
    const out = this.acc;
    this.acc = [];
    this.pendingEvents = [];
    return out;
  }

  welcome(team: number) {
    const g = this.geom;
    return {
      team,
      river: g.river,
      castles: g.castles,
      steal: g.steal,
      speed: T.playerSpeed,
      mass: T.playerMass,
      carrySlow: T.carrySlow,
      waterSlow: T.waterSlow,
      seed: g.seed,
      world: W,
      /** Вид карти ('river' | 'terraces'); для терас - острови й мости, час до падіння. */
      kind: g.kind,
      /** Оформлення островної карти ('ruins' - «Затонулі руїни»); undefined - небо. */
      skin: g.skin,
      terraces: g.terraces,
      fallMs: T.terraces.fallMs,
    };
  }

  // ---------- ШІ ботів ----------
  /** Скін бота: випадковий безкоштовний своєї сторони. */
  botSkin(team: number) {
    const list = TEAM_FREE_SKINS[team];
    return list[Math.floor(this.rng() * list.length)];
  }

  // ---------- розумніший ШІ ----------
  /** Плацдарм команди: де збираються злодії перед хвилею (на своєму боці ближче до центру: острів посередині або берег біля середнього мосту). */
  private stagePoint(team: number): { x: number; y: number } {
    if (this.geom.kind === 'terraces') {
      // центральний острів, зсунутий до свого боку
      return { x: W / 2, y: W / 2 + (team === TEAM_SHEEP ? 150 : -150) };
    }
    const r = this.geom.river;
    const side = team === TEAM_SHEEP ? -1 : 1;
    const mid = r.bridges[Math.floor(r.bridges.length / 2)] ?? r.bridges[0] ?? 0;
    return this.fromSD(mid, side * (r.hw + r.over + 260));
  }

  /** Раз на крок матчу: коли достатньо злодіїв команди зібралось на плацдармі - запускаємо хвилю нападу (потім пауза waveCooldownMs). */
  private updateWaves() {
    const now = this.world.now;
    for (const team of [TEAM_SHEEP, TEAM_WOLF]) {
      const i = team - 1;
      if (now < this.waveUntil[i] || now < this.waveNext[i]) continue;
      const stage = this.stagePoint(team);
      let thieves = 0;
      let ready = 0;
      for (const cp of this.cps.values()) {
        if (cp.team !== team || !cp.bot || cp.role !== 'thief' || cp.respawnUntil > 0) continue;
        thieves++;
        const c = this.world.players.get(cp.pid)?.cells[0];
        if (c && !cp.carry && Math.hypot(c.x - stage.x, c.y - stage.y) < 320) ready++;
      }
      if (thieves > 0 && ready >= Math.max(1, Math.ceil(thieves * T.bots.waveReadyShare))) {
        this.waveUntil[i] = now + T.bots.waveMs;
        this.waveNext[i] = now + T.bots.waveMs + T.bots.waveCooldownMs;
      }
    }
  }

  /** Пости захисників: точки біля входів на острів/берег замка своєї команди (0-й захисник тримає сховище, решта - пости). */
  private guardPosts(team: number): { x: number; y: number }[] {
    const own = this.castleOf(team);
    if (this.geom.kind === 'terraces') {
      const g = this.geom.terraces as TerracesGeom;
      const home = islandAt(g, own.x, own.y);
      const out: { x: number; y: number }[] = [];
      for (const b of g.bridges) {
        if (b.a === home) out.push({ x: b.x1, y: b.y1 });
        else if (b.b === home) out.push({ x: b.x2, y: b.y2 });
      }
      return out;
    }
    const r = this.geom.river;
    const side = team === TEAM_SHEEP ? -1 : 1;
    return r.bridges.map((b) => this.fromSD(b, side * (r.hw + r.over + 150)));
  }

  /** Вороги, що ще можуть зловити злодія: живі, не у відродженні, видимі (не в кущі) для команди cp. */
  private foesOf(cp: CP): { x: number; y: number; pid: number; carry: number; vx: number; vy: number }[] {
    const out: { x: number; y: number; pid: number; carry: number; vx: number; vy: number }[] = [];
    const dt = 1 / FLOCK_CONFIG.tickHz;
    for (const q of this.cps.values()) {
      if (q.team === cp.team || q.respawnUntil > 0 || this.hiddenFrom(cp.team, q.pid)) continue;
      const qc = this.world.players.get(q.pid)?.cells[0];
      if (!qc) continue;
      out.push({ x: qc.x, y: qc.y, pid: q.pid, carry: q.carry, vx: (qc.x - q.lastX) / dt, vy: (qc.y - q.lastY) / dt });
    }
    return out;
  }

  thinkBot(p: Player) {
    const cp = this.cps.get(p.id);
    const c = p.cells[0];
    if (!cp || !c || p.paused) return;
    const w = this.world;
    if (this.phase !== 2 || cp.respawnUntil > 0) {
      p.power = 0;
      return;
    }
    if ((w.tickNo + p.id) % FLOCK_CONFIG.botThinkEvery !== 0) return;
    const enemy = enemyOf(cp.team);
    const own = this.castleOf(cp.team);
    const foe = this.castleOf(enemy);
    const foes = this.foesOf(cp);
    let tx = foe.x;
    let ty = foe.y;
    let flee: { x: number; y: number; w: number } | null = null;

    if (cp.carry) {
      // несу камінь додому: найкоротшим безпечним шляхом (обходимо захисників) і тікаю від тих, хто наближається
      tx = own.x;
      ty = own.y;
      let nd = Infinity;
      let near: (typeof foes)[number] | null = null;
      for (const f of foes) {
        const d = Math.hypot(f.x - c.x, f.y - c.y);
        // небезпечний той, хто на території, де мене можна піймати (територія ворога), і вже близько
        if (d < 360 && d < nd && sideAt(this.geom, c.x, c.y) === enemy) {
          nd = d;
          near = f;
        }
      }
      if (near) flee = { x: c.x - near.x, y: c.y - near.y, w: 1.6 * (1 - nd / 360) + 0.4 };
    } else if (cp.role === 'thief' && this.stock[enemy - 1] > 0) {
      if (w.now >= this.waveUntil[cp.team - 1]) {
        // хвилі нема: збираємось на плацдармі (стоїмо, коли на місці) і чекаємо решту
        const stage = this.stagePoint(cp.team);
        if (Math.hypot(c.x - stage.x, c.y - stage.y) < 150) {
          p.power = 0;
          return;
        }
        tx = stage.x + Math.cos(p.id * 2.4) * 90;
        ty = stage.y + Math.sin(p.id * 2.4) * 90;
      } else if (Math.hypot(c.x - foe.x, c.y - foe.y) <= this.geom.steal * 0.6) {
        // у хвилі: до сховища - в обхід захисників; біля нього стоїмо, поки не вкрадемо
        p.power = 0;
        return;
      }
    } else {
      // захисник (або злодій, якому нема чого красти)
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      // 1) злодій із каменем на нашій території: перехоплюємо з випередженням, дистанція не обмежена радіусом спостереження
      for (const f of foes) {
        if (!f.carry || sideAt(this.geom, f.x, f.y) !== cp.team) continue;
        const d = Math.hypot(f.x - c.x, f.y - c.y);
        // не більше T.bots.maxChasers найближчих захисників женуться за одним злодієм, решта тримає пости
        let closer = 0;
        for (const q of this.cps.values()) {
          if (q === cp || q.team !== cp.team || q.carry || q.respawnUntil > 0) continue;
          const qc = w.players.get(q.pid)?.cells[0];
          if (qc && Math.hypot(f.x - qc.x, f.y - qc.y) < d) closer++;
        }
        if (closer >= T.bots.maxChasers || d > T.bots.chaseRadius) continue;
        if (d < bd) {
          bd = d;
          const lead = Math.min(1.1, d / (T.playerSpeed * 0.9));
          best = { x: f.x + f.vx * lead, y: f.y + f.vy * lead };
        }
      }
      // 2) наш камінь, що лежить: підбирає найближчий захисник
      if (!best) {
        for (const st of this.stones) {
          if (st.owner !== cp.team) continue;
          const d = Math.hypot(st.x - c.x, st.y - c.y);
          let mine = true;
          for (const q of this.cps.values()) {
            if (q === cp || q.team !== cp.team || !q.bot || q.carry || q.respawnUntil > 0) continue;
            const qc = w.players.get(q.pid)?.cells[0];
            if (qc && Math.hypot(st.x - qc.x, st.y - qc.y) < d - 40) {
              mine = false;
              break;
            }
          }
          if (mine && d < bd) {
            bd = d;
            best = { x: st.x, y: st.y };
          }
        }
      }
      if (best) {
        tx = best.x;
        ty = best.y;
      } else {
        // 3) пост: нульовий тримає сховище, решта - входи на територію (чим більше ворогів поруч, тим щільніше до сховища)
        const posts = this.guardPosts(cp.team);
        const idx = cp.post % (posts.length + 1);
        if (idx === 0 || posts.length === 0) {
          const a = Math.atan2(W / 2 - own.y, W / 2 - own.x) + Math.sin(w.now / 5000 + p.id) * 0.9;
          tx = own.x + Math.cos(a) * T.bots.guardRadius * 0.9;
          ty = own.y + Math.sin(a) * T.bots.guardRadius * 0.9;
        } else {
          const post = posts[idx - 1];
          tx = post.x + Math.cos(w.now / 3500 + p.id) * 60;
          ty = post.y + Math.sin(w.now / 3500 + p.id) * 60;
        }
      }
    }

    const wp = this.waypoint(c.x, c.y, tx, ty, cp.carry || cp.role === 'thief' ? foes : [], p.id);
    let dx = wp.x - c.x;
    let dy = wp.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    if (flee) {
      const fl = Math.hypot(flee.x, flee.y) || 1;
      dx += (flee.x / fl) * flee.w;
      dy += (flee.y / fl) * flee.w;
    }
    // «Небесні тераси»: не заходимо в порожнечу - дивимось уперед і при потребі повертаємо до опори
    if (this.geom.kind === 'terraces') {
      const g = this.geom.terraces as TerracesGeom;
      const dl = Math.hypot(dx, dy) || 1;
      const ax = c.x + (dx / dl) * 120;
      const ay = c.y + (dy / dl) * 120;
      if (!tOnLand(g, ax, ay)) {
        const spot = nearestLand(g, ax, ay);
        dx = spot.x - c.x;
        dy = spot.y - c.y;
      }
    }
    p.angle = Math.atan2(dy, dx);
    p.power = 1;
  }

  /** Куди йти, щоб потрапити з (x, y) у (tx, ty) (через міст; на терасах - по графу островів з обходом ворогів). */
  private waypoint(x: number, y: number, tx: number, ty: number, avoid: readonly { x: number; y: number }[] = [], seed = 0) {
    if (this.geom.kind === 'terraces') {
      const out = { x: tx, y: ty };
      routeTerraces(this.geom.terraces as TerracesGeom, x, y, tx, ty, avoid, out, seed);
      return out;
    }
    return this.riverWaypoint(x, y, tx, ty, avoid, seed);
  }

  /** Річкова карта: куди йти, щоб потрапити з (x, y) у (tx, ty): через міст, якщо ціль за річкою; у воді - до найближчого моста. */
  private riverWaypoint(x: number, y: number, tx: number, ty: number, avoid: readonly { x: number; y: number }[] = [], seed = 0) {
    const g = this.geom.river;
    const d = riverD(x, y);
    const dt = riverD(tx, ty);
    const crossing = Math.abs(d) < g.hw || Math.sign(d) !== Math.sign(dt);
    if (!crossing) return { x: tx, y: ty };
    const s = riverS(x, y);
    const st = riverS(tx, ty);
    let best = g.bridges[0];
    let bc = Infinity;
    for (const b of g.bridges) {
      let cost = Math.abs(b - s) + Math.abs(b - st) + (((b + seed * 131) | 0) % 5) * 40;
      // міст, біля виходів якого стоять вороги, дорожчий
      for (const a of avoid) if (Math.abs(riverS(a.x, a.y) - b) < g.bw / 2 + 120 && Math.abs(riverD(a.x, a.y)) < g.hw + g.over + 360) cost += 600;
      if (cost < bc) {
        bc = cost;
        best = b;
      }
    }
    const inCorridor = Math.abs(s - best) < g.bw / 2 - 30;
    const reach = g.hw + g.over + 70;
    const toPoint = (dd: number) => this.fromSD(best, dd);
    if (Math.abs(d) >= g.hw) {
      // на своєму березі: спершу до входу на міст, далі прямо через міст
      if (!inCorridor) return toPoint(Math.sign(d || 1) * reach);
      return toPoint(-Math.sign(d || 1) * reach);
    }
    // у смузі річки (міст чи вода): йдемо до виходу з боку цілі
    const exit = Math.sign(dt || 1) * reach;
    if (!inCorridor && inWater(g, x, y)) return this.fromSD(best, 0);
    return toPoint(exit);
  }

  /** Світова точка за координатами осі річки: s (вздовж) і d (поперек). */
  private fromSD(s: number, d: number) {
    return { x: (s + d) / SQ2, y: (s - d) / SQ2 };
  }
}
