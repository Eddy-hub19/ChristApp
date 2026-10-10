import { randomBytes } from 'crypto';
import { FLOCK_CONFIG, BONUS_KINDS } from './flock.config';
import {
  CHUNKS_PER_SIDE,
  FlockWorld,
  chunkIndexOf,
  type Player,
  type Rng,
} from './flock.engine';
import { BOT_NAMES, initBot, thinkBot } from './flock.bots';
import {
  BONUS_CODE,
  FX_FROZEN,
  FX_GHOST,
  FX_MAGNET,
  FX_PAUSED,
  FX_SHIELD,
  FX_SPEED,
  encodeBoard,
  encodeState,
  type StateInput,
} from './protocol';

const C = FLOCK_CONFIG;

export type SendFn = (
  connKey: string,
  event: string,
  payload: Uint8Array | object,
) => void;

interface Session {
  /** Поточний сокет; null = гравець у паузі (чекає повернення). */
  connKey: string | null;
  /** Токен відновлення сесії (віддається в `welcome`, ротується при поверненні). */
  token: string;
  /** Коли пауза спливає (мс, годинник менеджера); null = гравець підключений. */
  pausedUntil: number | null;
  userId: string;
  pid: number;
  arena: Arena;
  knownChunks: Set<number>;
  knownPlayers: Set<number>;
  lastInputAt: number;
  /** Скільки повідомлень вводу прийнято у поточному вікні (rate limit). */
  inputWindowStart: number;
  inputCount: number;
  deadSent: boolean;
  /** Співвідношення сторін екрана клієнта: форма області видимості (площа від нього не залежить). */
  aspect: number;
}

class Arena {
  readonly world: FlockWorld;
  /** Сесії арени за userId (пауза тримає місце в лімiті). */
  readonly sessions = new Map<string, Session>();
  readonly bots = new Set<number>();
  private timer: NodeJS.Timeout | null = null;
  private nextAt = 0;
  private botRespawn = new Map<number, number>();
  /** Сумарний час CPU в тіках (мс) - для замірів і /stats. */
  cpuMs = 0;
  ticks = 0;
  bytesOut = 0;

  constructor(
    readonly id: number,
    private readonly rng: Rng,
    private readonly send: SendFn,
    private readonly now: () => number = Date.now,
  ) {
    this.world = new FlockWorld(rng);
  }

  get humans() {
    return this.sessions.size;
  }

  start() {
    if (this.timer) return;
    this.nextAt = Date.now() + 1000 / C.tickHz;
    this.schedule();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.timer = setTimeout(
      () => {
        this.step();
        const tickMs = 1000 / C.tickHz;
        this.nextAt += tickMs;
        // не наздоганяємо відставання пачкою тіків: перегрузка = просто повільніша гра
        if (this.nextAt < Date.now() - tickMs * 2) this.nextAt = Date.now();
        if (this.timer) this.schedule();
      },
      Math.max(0, this.nextAt - Date.now()),
    );
    this.timer.unref?.();
  }

  targetBots() {
    return Math.max(
      C.botMin,
      Math.min(C.botTarget, C.botTotalTarget - this.humans),
    );
  }

  private addBot() {
    const name = BOT_NAMES[Math.floor(this.rng() * BOT_NAMES.length)];
    const p = this.world.addPlayer({
      name,
      skin: Math.floor(this.rng() * 12),
      bot: true,
    });
    initBot(p, this.rng);
    this.bots.add(p.id);
  }

  syncBots() {
    const want = this.targetBots();
    while (this.bots.size < want) this.addBot();
    if (this.bots.size > want) {
      // прибираємо найменших, щоб не рвати великих
      const sorted = [...this.bots]
        .map((id) => this.world.players.get(id)!)
        .sort((a, b) => a.total - b.total);
      for (const p of sorted) {
        if (this.bots.size <= want) break;
        this.world.removePlayer(p.id);
        this.bots.delete(p.id);
        this.botRespawn.delete(p.id);
      }
    }
  }

  step() {
    const t0 = process.hrtime.bigint();
    const w = this.world;
    this.syncBots();
    for (const id of this.bots) {
      const p = w.players.get(id);
      if (!p) continue;
      if (!p.alive) {
        const at = this.botRespawn.get(id) ?? w.now + C.botRespawnMs;
        this.botRespawn.set(id, at);
        if (w.now >= at) {
          this.botRespawn.delete(id);
          w.respawn(p);
        }
        continue;
      }
      thinkBot(w, p, this.rng);
    }
    w.tick(1 / C.tickHz);
    this.broadcast();
    this.cpuMs += Number(process.hrtime.bigint() - t0) / 1e6;
    this.ticks++;
  }

  private broadcast() {
    const w = this.world;
    const sendBoard = w.tickNo % Math.round(C.tickHz) === 0;
    const top = sendBoard ? w.leaderboard(10) : [];
    const ranked = sendBoard ? w.leaderboard(1000) : [];
    for (const s of this.sessions.values()) {
      const key = s.connKey;
      if (!key) continue; // у паузі: нікуди слати
      const p = w.players.get(s.pid);
      if (!p) continue;
      if (!p.alive && !s.deadSent) {
        s.deadSent = true;
        this.send(key, 'd', {
          survivedMs: Math.round(p.diedAt - p.spawnedAt),
          maxMass: Math.round(p.maxMass),
          kills: p.kills,
          killed: p.killed,
          topMs: Math.round(p.topMs),
          killer: w.players.get(p.killerPid)?.name ?? null,
        });
      }
      if (!p.alive) continue;
      const buf = encodeState(this.buildState(s, p));
      this.bytesOut += buf.length;
      this.send(key, 's', buf);
      if (sendBoard) {
        const board = encodeBoard({
          top: top.map((t) => ({ pid: t.id, mass: t.total, name: t.name })),
          selfRank: ranked.findIndex((r) => r.id === p.id) + 1,
          alive: ranked.length,
          map: ranked.map((r) => {
            const c = w.centroid(r);
            return {
              pid: r.id,
              x: Math.min(255, Math.floor((c.x / C.worldSize) * 256)),
              y: Math.min(255, Math.floor((c.y / C.worldSize) * 256)),
              size: Math.min(255, Math.round(Math.sqrt(r.total) * 4)),
            };
          }),
        });
        this.bytesOut += board.length;
        this.send(key, 'l', board);
      }
    }
  }

  private buildState(s: Session, p: Player): StateInput {
    const w = this.world;
    const cen = w.centroid(p);
    const R = w.viewRadius(p);
    // область видимості - прямокутник тієї ж площі, що й квадрат R×R, під форму екрана клієнта
    const sa = Math.sqrt(s.aspect);
    const hx = R * sa * 1.15;
    const hy = (R / sa) * 1.15;

    // чанки в зоні видимості (+ поле, щоб їжа не "спалахувала" на краю)
    const cs = C.chunkSize;
    const pad = cs * 0.5;
    const x0 = Math.max(0, Math.floor((cen.x - hx - pad) / cs));
    const x1 = Math.min(
      CHUNKS_PER_SIDE - 1,
      Math.floor((cen.x + hx + pad) / cs),
    );
    const y0 = Math.max(0, Math.floor((cen.y - hy - pad) / cs));
    const y1 = Math.min(
      CHUNKS_PER_SIDE - 1,
      Math.floor((cen.y + hy + pad) / cs),
    );
    const want = new Set<number>();
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) want.add(cy * CHUNKS_PER_SIDE + cx);

    const forgetChunks: number[] = [];
    for (const idx of s.knownChunks) if (!want.has(idx)) forgetChunks.push(idx);
    for (const idx of forgetChunks) s.knownChunks.delete(idx);
    const chunks: StateInput['chunks'] = [];
    for (const idx of want) {
      if (s.knownChunks.has(idx)) continue;
      s.knownChunks.add(idx);
      chunks.push({ idx, foods: [...w.foodChunks[idx].values()] });
    }
    const fresh = new Set(chunks.map((c) => c.idx));
    const foodEvents: StateInput['foodEvents'] = [];
    for (const e of w.foodEvents) {
      if (!s.knownChunks.has(e.chunk) && !s.knownChunks.has(e.oldChunk))
        continue;
      // щойно надіслані повним знімком чанки вже містять поточний стан
      if (fresh.has(e.chunk)) continue;
      foodEvents.push({
        op: e.op,
        id: e.food.id,
        x: e.food.x,
        y: e.food.y,
        kind: e.food.kind,
      });
    }

    const cells: StateInput['cells'] = [];
    const seenPids = new Set<number>();
    w.queryCells(cen.x, cen.y, Math.max(hx, hy), (c) => {
      const o = w.players.get(c.pid);
      if (!o || !o.alive) return;
      if (Math.abs(c.x - cen.x) > hx || Math.abs(c.y - cen.y) > hy) return;
      let fx = 0;
      if (w.isShielded(o)) fx |= FX_SHIELD;
      if (w.isGhost(o)) fx |= FX_GHOST;
      if (w.now < o.frozenUntil) fx |= FX_FROZEN;
      if (o.paused) fx |= FX_PAUSED;
      if (w.hasEffect(o, 'speed')) fx |= FX_SPEED;
      if (w.hasEffect(o, 'magnet')) fx |= FX_MAGNET;
      cells.push({ id: c.id, pid: c.pid, x: c.x, y: c.y, mass: c.mass, fx });
      seenPids.add(c.pid);
    });
    // власні клітини завжди
    const have = new Set(cells.map((x) => x.id));
    for (const c of p.cells) {
      if (!have.has(c.id)) {
        cells.push({
          id: c.id,
          pid: c.pid,
          x: c.x,
          y: c.y,
          mass: c.mass,
          fx: 0,
        });
      }
    }
    seenPids.add(p.id);
    const players: StateInput['players'] = [];
    for (const pid of seenPids) {
      if (s.knownPlayers.has(pid)) continue;
      const o = w.players.get(pid);
      if (!o) continue;
      s.knownPlayers.add(pid);
      players.push({ pid, skin: o.skin, bot: o.bot, name: o.name });
    }

    const inView = (x: number, y: number) =>
      Math.abs(x - cen.x) <= hx && Math.abs(y - cen.y) <= hy;
    const pausedInView: StateInput['paused'] = [];
    const nowMs = this.now();
    for (const o of this.sessions.values()) {
      if (o.pausedUntil !== null && seenPids.has(o.pid)) {
        pausedInView.push({
          pid: o.pid,
          remainingMs: Math.max(0, o.pausedUntil - nowMs),
        });
      }
    }
    const effects: StateInput['effects'] = [];
    for (const k of BONUS_KINDS) {
      const until = p.effects[k] ?? 0;
      if (until > w.now)
        effects.push({
          kind: BONUS_CODE.indexOf(k),
          remainingMs: until - w.now,
        });
    }
    return {
      tick: w.tickNo,
      alive: true,
      total: p.total,
      selfPid: p.id,
      effects,
      forgetChunks,
      chunks,
      foodEvents,
      players,
      cells,
      thorns: w.thorns
        .filter((t) => inView(t.x, t.y))
        .map((t) => ({ id: t.id, x: t.x, y: t.y, mass: t.mass })),
      blobs: w.blobs
        .filter((b) => inView(b.x, b.y))
        .map((b) => ({ id: b.id, x: b.x, y: b.y })),
      bonuses: w.bonuses
        .filter((b) => inView(b.x, b.y))
        .map((b) => ({
          id: b.id,
          kind: BONUS_CODE.indexOf(b.kind),
          x: b.x,
          y: b.y,
        })),
      paused: pausedInView,
    };
  }
}

export interface JoinOptions {
  /** Токен відновлення з попереднього `welcome`. */
  resume?: string;
  /** Лише відновлення: якщо сесії вже нема - не створювати нову овечку, а повернути `expired` (клієнт покаже лобі). */
  resumeOnly?: boolean;
  /** Арена з посилання-запрошення. Немає такої (закрита) - заходимо в доступну без жодних повідомлень. */
  arena?: number;
}

export interface JoinResult {
  ok: boolean;
  error?: 'full' | 'busy' | 'expired';
  pid?: number;
  arenaId?: number;
  humans?: number;
  /** Токен для відновлення сесії після вильоту. */
  token?: string;
  /** Продовжили ту саму овечку (масу, частини, позицію, статистику). */
  resumed?: boolean;
  /** Клієнт прислав токен, але сесія вже завершилась: звичайний вхід. */
  resumeFailed?: boolean;
}

const newToken = () => randomBytes(16).toString('hex');

/**
 * Менеджер арен "Отари". Арена існує, лише поки в ній є живі гравці:
 * без людей світ повністю знищується (боти "засинають", пам'ять і CPU звільняються).
 *
 * Сесія гравця живе за userId і не прив'язана до сокета: при розриві (не явному виході)
 * овечка лишається на арені в паузі `resumePauseMs`, місце в ліміті за нею зарезервоване.
 */
export class FlockManager {
  private readonly arenas = new Map<number, Arena>();
  /** Сесія за поточним сокетом (у паузі запису немає). */
  private readonly byConn = new Map<string, Session>();
  private readonly byUser = new Map<string, Session>();
  private nextArenaId = 1;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly send: SendFn,
    private readonly rng: Rng = Math.random,
    private readonly now: () => number = Date.now,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 1000);
    this.sweeper.unref?.();
  }

  join(
    connKey: string,
    userId: string,
    name: string,
    skin: number,
    opts: JoinOptions = {},
  ): JoinResult {
    const sameConn = this.byConn.get(connKey);
    if (sameConn) {
      // повторний вхід з того ж сокета = переродження
      const p = sameConn.arena.world.players.get(sameConn.pid);
      if (p && !p.alive) {
        sameConn.arena.world.respawn(p);
        sameConn.deadSent = false;
        sameConn.knownChunks.clear();
        sameConn.knownPlayers.clear();
        sameConn.lastInputAt = this.now();
      }
      return this.joined(sameConn);
    }

    const prev = this.byUser.get(userId);
    let resumeFailed = false;
    if (opts.resume) {
      if (prev && prev.token === opts.resume) return this.resume(prev, connKey);
      resumeFailed = true;
      if (opts.resumeOnly) return { ok: false, error: 'expired', resumeFailed };
    }
    // явний новий вхід (або токен не підійшов): стара сесія цього користувача (вкладка/пауза) закривається
    if (prev) this.removeSession(prev);

    const arena = this.pickArena(opts.arena);
    if (!arena) return { ok: false, error: 'full', resumeFailed };
    const player = arena.world.addPlayer({
      name: name.slice(0, 24) || 'Овечка',
      skin,
    });
    const session: Session = {
      connKey,
      token: newToken(),
      pausedUntil: null,
      userId,
      pid: player.id,
      arena,
      knownChunks: new Set(),
      knownPlayers: new Set(),
      lastInputAt: this.now(),
      inputWindowStart: this.now(),
      inputCount: 0,
      deadSent: false,
      aspect: 1,
    };
    arena.sessions.set(userId, session);
    this.byConn.set(connKey, session);
    this.byUser.set(userId, session);
    arena.syncBots();
    arena.start();
    return { ...this.joined(session), resumeFailed };
  }

  private joined(s: Session): JoinResult {
    return {
      ok: true,
      pid: s.pid,
      arenaId: s.arena.id,
      humans: s.arena.humans,
      token: s.token,
    };
  }

  /** Арена для нового гравця: запрошена (якщо є місце) → будь-яка з місцем → нова (до ліміту). */
  private pickArena(requested?: number): Arena | null {
    const has = (a: Arena) => a.humans < C.maxHumansPerArena;
    const wanted = requested ? this.arenas.get(requested) : undefined;
    if (wanted && has(wanted)) return wanted;
    const any = [...this.arenas.values()].find(has);
    if (any) return any;
    if (this.arenas.size >= C.maxArenas) return null;
    const arena = new Arena(this.nextArenaId++, this.rng, this.send, this.now);
    this.arenas.set(arena.id, arena);
    return arena;
  }

  private resume(s: Session, connKey: string): JoinResult {
    // старий сокет ще "живий" (мережа блимнула, сервер не помітив): новий його витісняє
    if (s.connKey && s.connKey !== connKey) {
      const old = s.connKey;
      this.byConn.delete(old);
      this.send(old, 'e', { code: 'taken' });
    }
    s.connKey = connKey;
    s.pausedUntil = null;
    s.token = newToken();
    s.lastInputAt = this.now();
    s.inputWindowStart = this.now();
    s.inputCount = 0;
    s.knownChunks.clear();
    s.knownPlayers.clear();
    const p = s.arena.world.players.get(s.pid);
    if (p && !p.alive) s.deadSent = false;
    s.arena.world.resumePlayer(s.pid, C.resumeShieldMs);
    this.byConn.set(connKey, s);
    return { ...this.joined(s), resumed: true };
  }

  /** Ввід: тільки напрямок/сила/кнопки. Не більше ~40 повідомлень/с на гравця. */
  input(
    connKey: string,
    angle: number,
    power: number,
    split: boolean,
    thr: boolean,
    aspect = 1,
  ) {
    const s = this.byConn.get(connKey);
    if (!s) return;
    const t = this.now();
    if (t - s.inputWindowStart >= 1000) {
      s.inputWindowStart = t;
      s.inputCount = 0;
    }
    if (++s.inputCount > 40) return;
    s.lastInputAt = t;
    if (Number.isFinite(aspect)) {
      s.aspect = Math.max(C.aspectMin, Math.min(C.aspectMax, aspect));
    }
    const w = s.arena.world;
    w.setInput(s.pid, angle, power);
    if (split) w.queueSplit(s.pid);
    if (thr) w.queueThrow(s.pid);
  }

  /**
   * Сокет обірвався не з волі гравця (мережа, згорнув, закрив вкладку, iOS вивантажив):
   * овечка лишається на арені в паузі. Мертвий гравець пауз не потребує.
   */
  disconnect(connKey: string) {
    const s = this.byConn.get(connKey);
    if (!s) return;
    this.byConn.delete(connKey);
    const p = s.arena.world.players.get(s.pid);
    if (!p || !p.alive || C.resumePauseMs <= 0) {
      this.removeSession(s);
      return;
    }
    s.connKey = null;
    s.pausedUntil = this.now() + C.resumePauseMs;
    s.arena.world.pausePlayer(s.pid);
  }

  /** Явний вихід (хрестик): одразу, без паузи. */
  leave(connKey: string) {
    const s = this.byConn.get(connKey);
    if (s) this.removeSession(s);
  }

  private removeSession(s: Session) {
    if (s.connKey) this.byConn.delete(s.connKey);
    this.byUser.delete(s.userId);
    const arena = s.arena;
    arena.sessions.delete(s.userId);
    arena.world.removePlayer(s.pid);
    if (arena.humans === 0) {
      arena.stop();
      this.arenas.delete(arena.id);
    } else {
      arena.syncBots();
    }
  }

  /** Раз на секунду: пауза, що спливла, і AFK. Публічний для тестів з керованим годинником. */
  sweep() {
    const t = this.now();
    for (const s of [...this.byUser.values()]) {
      if (s.pausedUntil !== null) {
        if (t >= s.pausedUntil) this.removeSession(s);
      } else if (s.connKey && t - s.lastInputAt > C.afkKickMs) {
        this.send(s.connKey, 'e', { code: 'afk' });
        this.removeSession(s);
      }
    }
  }

  isActive() {
    return this.arenas.size > 0;
  }

  stats() {
    return [...this.arenas.values()].map((a) => ({
      id: a.id,
      humans: a.humans,
      bots: a.bots.size,
      ticks: a.ticks,
      cpuMsPerTick: a.ticks ? a.cpuMs / a.ticks : 0,
      bytesOut: a.bytesOut,
    }));
  }

  /** Тільки для тестів і замірів. */
  _arena(id: number) {
    return this.arenas.get(id);
  }

  dispose() {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const a of this.arenas.values()) a.stop();
    this.arenas.clear();
    this.byConn.clear();
    this.byUser.clear();
  }
}

export { chunkIndexOf };
