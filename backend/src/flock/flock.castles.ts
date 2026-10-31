import { FLOCK_CONFIG, TEAM_SHEEP, TEAM_WOLF, TEAM_FREE_SKINS } from './flock.config';
import type { Cell, FlockWorld, Player, Rng } from './flock.engine';
import { radiusOf } from './flock.engine';

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
  river: RiverGeom;
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

let cached: CastleMapGeom | null = null;

/** Геометрія карти (будується один раз; детермінована за M.seed). Обидва боки дзеркальні відносно центра світу. */
export function castleMap(): CastleMapGeom {
  if (cached) return cached;
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
  cached = { river, castles: [sheep, wolf], steal: T.stealRadius, bushes, seed: M.seed };
  return cached;
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
  /** Команда-власник камінця, що несе гравець (0 - нічого не несе). */
  carry: number;
  stealMs: number;
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
}

export interface TeamEvent {
  k: 'steal' | 'deliver' | 'drop' | 'return' | 'castle';
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
  readonly geom = castleMap();
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

  constructor(
    private readonly world: FlockWorld,
    private readonly rng: Rng,
  ) {}

  /** Правила для рушія (world.team). */
  readonly rules: TeamRules = {
    mass: T.playerMass,
    viewRadius: T.viewRadius,
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
    if (bot) {
      const mates = this.botsOf(team).map((id) => this.cps.get(id)!);
      const thieves = mates.filter((m) => m.role === 'thief').length;
      role = thieves / (mates.length + 1) < T.bots.thiefShare ? 'thief' : 'guard';
    }
    const c = p.cells[0];
    this.cps.set(p.id, {
      pid: p.id,
      team,
      bot,
      userId,
      role,
      carry: 0,
      stealMs: 0,
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
    const px = Math.cos(toward + Math.PI / 2);
    const py = Math.sin(toward + Math.PI / 2);
    return {
      x: c.x + Math.cos(toward) * along + px * k * 46,
      y: c.y + Math.sin(toward) * along + py * k * 46,
    };
  }

  private speedOf(p: Player) {
    const cp = this.cps.get(p.id);
    if (!cp || cp.respawnUntil > 0 || p.paused) return 0;
    let v = T.playerSpeed;
    const c = p.cells[0];
    if (c && inWater(this.geom.river, c.x, c.y)) v *= 1 - T.waterSlow;
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
      if (!hide && !inWater(this.geom.river, c.x, c.y)) {
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
    if (this.phase === 2) this.stepPlay(dt);
    else this.trackMovement(false);
    this.computeHidden();
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
      if (sideOf(tc.x, tc.y) !== defenders) continue;
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
      for (const cp of this.cps.values()) {
        if (cp.respawnUntil > 0) continue;
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
      ls: this.stones.map((s) => [s.id, Math.round(s.x), Math.round(s.y), s.owner, Math.round(s.expiresAt - w.now)]),
      al,
      sp: me && me.stealMs > 0 ? Math.min(1, me.stealMs / T.stealHoldMs) : 0,
      rs: me && me.respawnUntil > 0 ? Math.round(me.respawnUntil - w.now) : 0,
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
    };
  }

  // ---------- ШІ ботів ----------
  /** Скін бота: випадковий безкоштовний своєї сторони. */
  botSkin(team: number) {
    const list = TEAM_FREE_SKINS[team];
    return list[Math.floor(this.rng() * list.length)];
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
    let tx = foe.x;
    let ty = foe.y;
    let stay = false;
    if (cp.carry) {
      tx = own.x;
      ty = own.y;
    } else if (cp.role === 'thief' && this.stock[enemy - 1] > 0) {
      // біля сховища стоїмо, поки не вкрадемо
      if (Math.hypot(c.x - foe.x, c.y - foe.y) <= this.geom.steal * 0.6) stay = true;
    } else {
      // захисник (або злодій, якому нема чого красти): ворог на своїй території, камінь, що лежить, або патруль
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      for (const q of this.cps.values()) {
        if (q.team !== enemy || q.respawnUntil > 0 || this.hiddenFrom(cp.team, q.pid)) continue;
        const qc = w.players.get(q.pid)?.cells[0];
        if (!qc) continue;
        // захисник женеться лише за тим, хто несе камінь (звичайний гість нічого не псує)
        if (!q.carry || sideOf(qc.x, qc.y) !== cp.team) continue;
        const d = Math.hypot(qc.x - c.x, qc.y - c.y);
        if (d < T.bots.noticeRadius && d < bd) {
          bd = d;
          best = qc;
        }
      }
      if (!best) {
        for (const s of this.stones) {
          if (s.owner !== cp.team) continue;
          const d = Math.hypot(s.x - c.x, s.y - c.y);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
      }
      if (best) {
        tx = best.x;
        ty = best.y;
      } else {
        // патруль: повільне коло біля замка, ближче до річки
        const a = Math.atan2(W / 2 - own.y, W / 2 - own.x) + Math.sin((w.now / 6000) + p.id) * 1.2;
        tx = own.x + Math.cos(a) * T.bots.guardRadius;
        ty = own.y + Math.sin(a) * T.bots.guardRadius;
      }
    }
    if (stay) {
      p.power = 0;
      return;
    }
    const wp = this.waypoint(c.x, c.y, tx, ty);
    p.angle = Math.atan2(wp.y - c.y, wp.x - c.x);
    p.power = 1;
  }

  /** Куди йти, щоб потрапити з (x, y) у (tx, ty): через міст, якщо ціль за річкою; у воді - до найближчого моста. */
  private waypoint(x: number, y: number, tx: number, ty: number) {
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
      const cost = Math.abs(b - s) + Math.abs(b - st);
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
