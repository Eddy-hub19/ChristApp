import { randomBytes } from 'crypto';
import {
  FLOCK_CONFIG,
  BONUS_KINDS,
  BOSS_SKIN,
  FLOCK_MAPS,
  type ThornStyle,
  FREE_SKINS,
  isPhraseId,
  phraseDurationMs,
} from './flock.config';
import {
  CHUNKS_PER_SIDE,
  FlockWorld,
  pickMapId,
  chunkIndexOf,
  type Player,
  type Rng,
} from './flock.engine';
import { initBot, pickBotName, thinkBot } from './flock.bots';
import { initBoss, thinkBoss } from './flock.boss';
import { AdaptiveRate } from './flock.adaptive';
import {
  BotGovernor,
  ProcessLoadSampler,
  botCapForHumans,
  type GovernorDecision,
  type LoadSample,
} from './flock.bot-governor';
import { resolveCpuBudgetMs } from 'src/admin/cpu-benchmark.service';
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
  /** Нагороду за 1-ше місце в цьому житті вже видано (скидається при народженні). */
  rewardedThisLife: boolean;
  /** Коли востаннє віддавали масу в «Рекорди дня» (годинник світу) і яку. */
  massReportedAt: number;
  massReported: number;
  /** Коли гравець востаннє казав фразу (годинник менеджера) - ліміт частоти. */
  lastPhraseAt: number;
  /** pid -> фраза, яку цей клієнт уже отримав (null = знає, що її нема): шлемо лише зміни й лише для тих, кого бачить. */
  phraseSent: Map<number, { id: number; until: number }>;
  /** Старий клієнт (до v2) не знає про кущі з `welcome` - йому кущі йдуть у кожному пакеті стану. */
  thornsInState: boolean;
}

export interface FlockHooks {
  /** Гравець посів 1-ше місце в «Топ-10» з масою від порога (раз за життя). */
  onTop1?: (userId: string, connKey: string | null) => void;
  /** Гравець з'їв «Вожака» (лише людина з сесією). */
  onBossKill?: (userId: string, connKey: string | null) => void;
  /** Найбільша маса поточного життя (для «Рекордів дня»): не частіше writeThrottleMs на гравця, а також при смерті й виході. */
  onMass?: (userId: string, maxMass: number) => void;
  /** Овечка гравця загинула: підсумки життя (для статистики). */
  onDeath?: (
    userId: string,
    run: { maxMass: number; kills: number; topMs: number },
  ) => void;
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
  /** Розбивка по фазах тіка (мс, сумарно) і "запізнення" таймера (мс) - щоб бачити, де йде CPU і чи пливуть тіки. */
  readonly phase = { think: 0, world: 0, encode: 0, send: 0 };
  readonly lateness = { sum: 0, max: 0, over50: 0, n: 0 };
  packets = 0;
  private expectedAt = 0;
  private lastBoardAt = -Infinity;
  /** Спільне для всіх глядачів у цьому тіку: рахуємо один раз, а не по разу на кожного гравця. */
  private shared: {
    fx: Map<number, number>;
    blobs: StateInput['blobs'];
    bonuses: StateInput['bonuses'];
    /** Скільки гравців зараз мають активну фразу (0 - розсилку фраз пропускаємо). */
    phrases: number;
  } = { fx: new Map(), blobs: [], bonuses: [], phrases: 0 };
  /** Буфери buildState: Set-и очищаємо й переиспользуем, а не создаём на каждого игрока каждый тик. */
  private readonly tmpWant = new Set<number>();
  private readonly tmpFresh = new Set<number>();
  private readonly tmpHave = new Set<number>();
  private readonly tmpSeen = new Set<number>();
  /** Кущі не рухаються й не зникають: список будується один раз і йде клієнтам у `welcome`. */
  readonly thornList: StateInput['thorns'];
  /** Вид карти арени (FLOCK_MAPS), випадковий при створенні; йде клієнтам у `welcome`. */
  readonly mapId: number;
  /** Поточна частота (знижується запобіжником, коли CPU не встигає). */
  readonly rate = new AdaptiveRate();
  /** Боти за навантаженням: регулятор, боти «на виході», журнал рішень для адмінки. */
  readonly governor = new BotGovernor();
  /** Боти, що йдуть: тікають до краю й зникають, коли їх ніхто не бачить (pid -> світовий час початку). */
  readonly retiring = new Map<number, number>();
  readonly decisions: GovernorDecision[] = [];
  /** «Вожак» (не більше одного): pid, коли з'явиться наступного разу (світовий час, null - ще не призначено), початок відходу. */
  private bossId: number | null = null;
  private bossNextAt: number | null = null;
  private bossRetiringAt: number | null = null;
  /** Події «Вожака» цього тіку для всіх гравців: { k: 1 } вийшов, { k: 2, n } переможений. */
  private bossMsgs: { k: number; n?: string }[] = [];
  lastSample: LoadSample | null = null;
  private lastLoadEval = -Infinity;
  private lateSnap = { sum: 0, n: 0 };
  private sampler: ProcessLoadSampler | null = null;

  constructor(
    readonly id: number,
    private readonly rng: Rng,
    private readonly send: SendFn,
    private readonly now: () => number = Date.now,
    private readonly hooks: FlockHooks = {},
    /** Лаг loop і CPU процесу (у тестах підміняється). За замовчуванням міряє сама арена. */
    private readonly loadProbe?: () => Pick<LoadSample, 'loopP99Ms' | 'cpuPct'>,
  ) {
    this.mapId = pickMapId(rng);
    this.world = new FlockWorld(rng, this.mapId);
    this.thornList = this.world.thorns.map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      mass: t.mass,
    }));
  }

  get humans() {
    return this.sessions.size;
  }

  start() {
    if (this.timer) return;
    // первая оценка нагрузки - через evalMs после старта, а не сразу (холодный старт не повод убирать ботов)
    this.lastLoadEval = this.now();
    if (!this.loadProbe)
      this.sampler = new ProcessLoadSampler(resolveCpuBudgetMs());
    this.nextAt = Date.now() + 1000 / this.rate.hz;
    this.expectedAt = this.nextAt;
    this.schedule();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.sampler?.dispose();
    this.sampler = null;
  }

  private schedule() {
    this.timer = setTimeout(
      () => {
        const late = Math.max(0, Date.now() - this.nextAt);
        const l = this.lateness;
        l.sum += late;
        l.n++;
        if (late > l.max) l.max = late;
        if (late > 50) l.over50++;
        const hz = this.rate.update(late, Date.now());
        this.step();
        const tickMs = 1000 / hz;
        this.nextAt += tickMs;
        // не наздоганяємо відставання пачкою тіків: перегрузка = просто повільніша гра
        if (this.nextAt < Date.now() - tickMs * 2) this.nextAt = Date.now();
        if (this.timer) this.schedule();
      },
      Math.max(0, this.nextAt - Date.now()),
    );
    this.timer.unref?.();
  }

  /** Штатна кількість ботів: за людьми, з жорстким лімітом за числом людей (4-5 -> 2, 6 -> 0). */
  targetBots() {
    const base = Math.max(
      C.botMin,
      Math.min(C.botTarget, C.botTotalTarget - this.humans),
    );
    return Math.min(base, botCapForHumans(this.humans));
  }

  /** Скільки ботів має грати зараз: штатна кількість, обмежена навантаженням. */
  wantBots() {
    return this.governor.limit(this.targetBots());
  }

  get activeBots() {
    return this.bots.size - this.retiring.size;
  }

  private addBot() {
    const name = pickBotName(
      this.rng,
      [...this.world.players.values()].map((p) => p.name),
    );
    const p = this.world.addPlayer({
      name,
      skin: Math.floor(this.rng() * FREE_SKINS),
      bot: true,
    });
    initBot(p, this.rng);
    this.bots.add(p.id);
  }

  private removeBot(id: number) {
    if (id === this.bossId) {
      this.bossId = null;
      this.bossRetiringAt = null;
      this.bossNextAt = this.world.now + this.bossDelay();
    }
    this.world.removePlayer(id);
    this.bots.delete(id);
    this.retiring.delete(id);
    this.botRespawn.delete(id);
  }

  /** Центри й прямокутники огляду живих людей (так само, як у buildState). */
  private humanViews() {
    const w = this.world;
    const out: { x: number; y: number; hx: number; hy: number }[] = [];
    for (const s of this.sessions.values()) {
      const p = w.players.get(s.pid);
      if (!p || !p.alive) continue;
      const cen = w.centroid(p);
      const R = w.viewRadius(p);
      const sa = Math.sqrt(s.aspect);
      out.push({ x: cen.x, y: cen.y, hx: R * sa * 1.15, hy: (R / sa) * 1.15 });
    }
    return out;
  }

  private nearestHumanDist(
    x: number,
    y: number,
    views: { x: number; y: number }[],
  ) {
    let d = Infinity;
    for (const v of views) d = Math.min(d, Math.hypot(v.x - x, v.y - y));
    return d;
  }

  /**
   * Підганяє ботів під потрібну кількість. Зайвих НЕ видаляємо на очах: вони «йдуть» - тікають до найдальшого
   * від людей кута й зникають, коли їх ніхто не бачить (див. retireStep). Спочатку йдуть найменші, а серед
   * рівних - найдальші від людей. Якщо потрібно більше, спершу скасовуємо «відхід», потім додаємо нових.
   */
  syncBots() {
    const want = this.wantBots();
    let active = this.activeBots;
    if (active < want) {
      for (const id of [...this.retiring.keys()]) {
        if (active >= want) break;
        this.retiring.delete(id);
        active++;
      }
      while (active < want) {
        this.addBot();
        active++;
      }
    } else if (active > want) {
      const views = this.humanViews();
      const w = this.world;
      const cands = [...this.bots]
        .filter((id) => !this.retiring.has(id))
        .map((id) => w.players.get(id)!)
        .filter(Boolean)
        .map((p) => {
          const c = w.centroid(p);
          return { p, dist: this.nearestHumanDist(c.x, c.y, views) };
        })
        .sort((a, b) => a.p.total - b.p.total || b.dist - a.dist);
      for (const { p } of cands) {
        if (active <= want) break;
        this.retiring.set(p.id, w.now);
        active--;
      }
    }
  }

  private bossDelay() {
    const B = C.boss;
    return B.respawnMinMs + this.rng() * (B.respawnMaxMs - B.respawnMinMs);
  }

  /**
   * Вожака дозволено, доки регулятор навантаження не прибрав усіх звичайних ботів: він іде останнім
   * (високе навантаження, ліміт ботів 0 і жодного бота на арені).
   */
  private bossAllowed() {
    return !(this.governor.loadCap === 0 && this.bots.size === 0);
  }

  private hasLiveHuman() {
    for (const s of this.sessions.values()) {
      const p = this.world.players.get(s.pid);
      if (p && p.alive && !p.paused && s.connKey) return true;
    }
    return false;
  }

  /** До тіку: поява Вожака, його думки, відхід під навантаженням. */
  private stepBossPre() {
    const B = C.boss;
    if (!B.enabled) return;
    const w = this.world;
    if (this.bossNextAt === null)
      this.bossNextAt =
        w.now +
        B.firstSpawnMinMs +
        this.rng() * (B.firstSpawnMaxMs - B.firstSpawnMinMs);
    if (this.bossId === null) {
      if (
        w.now >= this.bossNextAt &&
        this.bossAllowed() &&
        this.hasLiveHuman()
      ) {
        const p = w.addPlayer({
          name: B.name,
          skin: BOSS_SKIN,
          bot: true,
          boss: true,
        });
        initBoss(p, this.rng);
        this.bossId = p.id;
        this.bossMsgs.push({ k: 1 });
      }
      return;
    }
    const p = w.players.get(this.bossId);
    if (!p) {
      this.bossId = null;
      return;
    }
    if (!p.alive) return; // загибель обробляє stepBossPost
    if (this.bossRetiringAt === null && !this.bossAllowed())
      this.bossRetiringAt = w.now;
    if (this.bossRetiringAt !== null) this.retireStep(p.id, p);
    else thinkBoss(w, p, this.rng);
  }

  /** Після тіку: Вожака з'їли - повідомлення, прибрати тіло, відродження через boss.respawn*. */
  private stepBossPost() {
    if (this.bossId === null) return;
    const w = this.world;
    for (const d of w.deaths) {
      if (d.pid !== this.bossId) continue;
      this.bossMsgs.push({ k: 2, n: w.players.get(d.killerPid)?.name ?? '' });
      for (const s of this.sessions.values()) {
        if (s.pid === d.killerPid && s.userId) {
          this.hooks.onBossKill?.(s.userId, s.connKey);
          break;
        }
      }
      this.removeBot(this.bossId);
      return;
    }
  }

  /** Бот, що йде: тікає до найдальшого від людей кута; прибираємо, коли його не видно жодній людині. */
  private retireStep(id: number, p: Player) {
    const w = this.world;
    if (!p.alive) return this.removeBot(id);
    const me = w.centroid(p);
    const views = this.humanViews();
    const r = 4.2 * Math.sqrt(p.total) + 80;
    const hidden = views.every(
      (v) =>
        Math.abs(me.x - v.x) > v.hx * C.botLoad.retireHideFactor + r ||
        Math.abs(me.y - v.y) > v.hy * C.botLoad.retireHideFactor + r,
    );
    const since = w.now - (this.retiring.get(id) ?? this.bossRetiringAt ?? w.now);
    if (hidden || since > C.botLoad.retireMaxMs) return this.removeBot(id);
    if ((w.tickNo + id) % C.botThinkEvery !== 0) return;
    let best = { x: C.worldSize / 2, y: C.worldSize / 2, d: -1 };
    for (const [cx, cy] of [
      [0, 0],
      [C.worldSize, 0],
      [0, C.worldSize],
      [C.worldSize, C.worldSize],
    ]) {
      const d = this.nearestHumanDist(cx, cy, views);
      if (d > best.d) best = { x: cx, y: cy, d };
    }
    p.angle = Math.atan2(best.y - me.y, best.x - me.x);
    p.power = 1;
  }

  /**
   * Раз на botLoad.evalMs: оцінка навантаження (запізнення тіків арени, лаг event loop, CPU процесу) і рішення
   * регулятора. Публічний для тестів з підміненим `loadProbe` і годинником.
   */
  evaluateLoad(nowMs = this.now()) {
    const l = this.lateness;
    const dn = l.n - this.lateSnap.n;
    const lateMs = dn > 0 ? (l.sum - this.lateSnap.sum) / dn : 0;
    this.lateSnap = { sum: l.sum, n: l.n };
    const proc = this.loadProbe
      ? this.loadProbe()
      : (this.sampler?.sample() ?? { loopP99Ms: 0, cpuPct: 0 });
    const sample: LoadSample = { lateMs, ...proc };
    this.lastSample = sample;
    const before = this.governor.loadCap;
    const d = this.governor.evaluate(
      sample,
      this.targetBots(),
      this.activeBots,
      nowMs,
    );
    if (d.action !== 'hold' || before !== d.loadCap) {
      this.decisions.push(d);
      if (this.decisions.length > 20) this.decisions.shift();
    }
    this.syncBots();
    return d;
  }

  step() {
    const t0 = process.hrtime.bigint();
    const w = this.world;
    const tA = performance.now();
    if (this.now() - this.lastLoadEval >= C.botLoad.evalMs) {
      this.lastLoadEval = this.now();
      this.evaluateLoad();
    } else {
      this.syncBots();
    }
    for (const id of this.bots) {
      const p = w.players.get(id);
      if (!p) continue;
      if (this.retiring.has(id)) {
        this.retireStep(id, p);
        continue;
      }
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
    this.stepBossPre();
    const tB = performance.now();
    w.tick(1 / this.rate.hz);
    this.stepBossPost();
    const tC = performance.now();
    this.phase.think += tB - tA;
    this.phase.world += tC - tB;
    this.broadcast();
    this.cpuMs += Number(process.hrtime.bigint() - t0) / 1e6;
    this.ticks++;
  }

  private broadcast() {
    const w = this.world;
    const t0 = performance.now();
    let sentMs = 0;
    const send = (key: string, ev: string, payload: Uint8Array | object) => {
      const ts = performance.now();
      this.send(key, ev, payload);
      sentMs += performance.now() - ts;
      this.packets++;
    };
    // Таблиця лідерів + мінікарта - одна на всіх, кодується раз і рідко (boardEverySec).
    this.prepareShared();
    const sendBoard = w.now - this.lastBoardAt >= C.boardEverySec * 1000;
    if (sendBoard) this.lastBoardAt = w.now;
    let boardBuf: Uint8Array | null = null;
    if (sendBoard) {
      const ranked = w.leaderboard(1000);
      // рубіни за 1-е місце - лише найкращому ЖИВОМУ гравцю: Вожак і боти не рахуються, навіть якщо вище
      this.checkTop1(ranked.find((r) => !r.bot && !r.boss));
      boardBuf = encodeBoard({
        top: ranked.slice(0, 10).map((t) => ({
          pid: t.id,
          mass: t.total,
          // Вожак лишається в Топ-10 з короною
          name: t.boss ? `👑 ${t.name}` : t.name,
        })),
        alive: ranked.length,
        // відсортована за масою: місце гравця = індекс його pid (клієнт рахує сам)
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
    }
    // «Зорепад»: події (старт / зірка з'явилась / з'їдена) - одним малим повідомленням усім, без потоку позицій.
    const starMsg = w.starEvents.length ? { e: w.starEvents } : null;
    // «Ножиці»: усім - анімація хвилі; клієнт сам вирішує, чи він серед постраждалих
    const scissorsMsgs = w.scissorsEvents.map((e) => ({
      x: e.x,
      y: e.y,
      r: e.r,
      t: e.taker,
      v: e.victims,
    }));
    const bossMsgs = this.bossMsgs;
    for (const s of this.sessions.values()) {
      const key = s.connKey;
      if (!key) continue; // у паузі: нікуди слати
      const p = w.players.get(s.pid);
      if (!p) continue;
      const mm = Math.round(p.maxMass);
      if (
        mm > s.massReported &&
        w.now - s.massReportedAt >= C.dailyRecords.writeThrottleMs
      ) {
        s.massReported = mm;
        s.massReportedAt = w.now;
        this.hooks.onMass?.(s.userId, mm);
      }
      if (starMsg) send(key, 'z', starMsg);
      for (const m of scissorsMsgs) send(key, 'sc', m);
      for (const m of bossMsgs) send(key, 'bm', m);
      if (!p.alive && !s.deadSent) {
        s.deadSent = true;
        send(key, 'd', {
          survivedMs: Math.round(p.diedAt - p.spawnedAt),
          maxMass: Math.round(p.maxMass),
          kills: p.kills,
          killed: p.killed,
          topMs: Math.round(p.topMs),
          killer: w.players.get(p.killerPid)?.name ?? null,
        });
        this.hooks.onMass?.(s.userId, p.maxMass);
        this.hooks.onDeath?.(s.userId, {
          maxMass: p.maxMass,
          kills: p.kills,
          topMs: p.topMs,
        });
      }
      if (!p.alive) continue;
      const buf = encodeState(this.buildState(s, p));
      this.bytesOut += buf.length;
      send(key, 's', buf);
      this.sendPhrases(s, key, send);
      if (boardBuf) {
        this.bytesOut += boardBuf.length;
        send(key, 'l', boardBuf);
      }
    }
    this.bossMsgs = [];
    this.phase.send += sentMs;
    this.phase.encode += performance.now() - t0 - sentMs;
  }

  /** 1-ше місце + маса від порога + ще не нагороджений у цьому житті -> хук (рубіни нараховує лише сервер). */
  private checkTop1(first: Player | undefined) {
    if (!first || first.total < C.rubies.top1MassThreshold) return;
    for (const s of this.sessions.values()) {
      if (s.pid !== first.id) continue;
      if (s.rewardedThisLife || !s.connKey || !first.alive) return;
      s.rewardedThisLife = true;
      this.hooks.onTop1?.(s.userId, s.connKey);
      return;
    }
  }

  /** Прапорці ефектів гравців і списки кущів / кинутої маси / бонусів - одноразово на тік. */
  private prepareShared() {
    const w = this.world;
    const sh = this.shared;
    sh.fx.clear();
    sh.phrases = 0;
    for (const o of w.players.values()) {
      if (!o.alive) continue;
      if (o.phrase && o.phrase.until > w.now) sh.phrases++;
      let fx = 0;
      if (w.isShielded(o)) fx |= FX_SHIELD;
      if (w.isGhost(o)) fx |= FX_GHOST;
      if (w.now < o.frozenUntil) fx |= FX_FROZEN;
      if (o.paused) fx |= FX_PAUSED;
      if (w.hasEffect(o, 'speed')) fx |= FX_SPEED;
      if (w.hasEffect(o, 'magnet')) fx |= FX_MAGNET;
      sh.fx.set(o.id, fx);
    }
    // списки переиспользуем (без новых массивов на каждый тик)
    sh.blobs.length = 0;
    for (const b of w.blobs) sh.blobs.push({ id: b.id, x: b.x, y: b.y });
    sh.bonuses.length = 0;
    for (const b of w.bonuses)
      sh.bonuses.push({
        id: b.id,
        kind: BONUS_CODE.indexOf(b.kind),
        x: b.x,
        y: b.y,
      });
  }

  /**
   * Фрази гравців, яких цей клієнт бачить (після buildState `tmpSeen` = видимі pid): нова або змінена - подією `q`,
   * скинута - `q` з id 0. Хто вийшов із зони - забуваємо, тож при поверненні фраза прийде знову.
   */
  private sendPhrases(
    s: Session,
    key: string,
    send: (key: string, ev: string, payload: object) => void,
  ) {
    const w = this.world;
    const seen = this.tmpSeen;
    if (this.shared.phrases === 0 && s.phraseSent.size === 0) return;
    for (const pid of s.phraseSent.keys()) if (!seen.has(pid)) s.phraseSent.delete(pid);
    for (const pid of seen) {
      const o = w.players.get(pid);
      if (!o) continue;
      const cur = o.phrase && o.phrase.until > w.now ? o.phrase : null;
      const prev = s.phraseSent.get(pid);
      if (cur === (prev ?? null)) continue;
      if (cur) {
        s.phraseSent.set(pid, cur);
        send(key, 'q', { p: pid, i: cur.id, t: Math.round(cur.until) });
      } else {
        s.phraseSent.delete(pid);
        // сплила сама - клієнт погасить її за часом; шлемо скидання, лише якщо її зняли раніше строку (смерть / народження)
        if (prev && prev.until > w.now) send(key, 'q', { p: pid, i: 0, t: 0 });
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
    const want = this.tmpWant;
    want.clear();
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
    const fresh = this.tmpFresh;
    fresh.clear();
    for (const c of chunks) fresh.add(c.idx);
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
    const seenPids = this.tmpSeen;
    seenPids.clear();
    w.queryCells(cen.x, cen.y, Math.max(hx, hy), (c) => {
      const o = w.players.get(c.pid);
      if (!o || !o.alive) return;
      if (Math.abs(c.x - cen.x) > hx || Math.abs(c.y - cen.y) > hy) return;
      const fx = this.shared.fx.get(c.pid) ?? 0;
      cells.push({ id: c.id, pid: c.pid, x: c.x, y: c.y, mass: c.mass, fx });
      seenPids.add(c.pid);
    });
    // власні клітини завжди
    const have = this.tmpHave;
    have.clear();
    for (const c of cells) have.add(c.id);
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
      players.push({
        pid,
        skin: o.skin,
        artifact: o.artifact,
        bot: o.bot,
        name: o.name,
      });
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
    // заморожений бачить таймер до кінця заморозки; людина - залишок розгону на старті
    if (w.now < p.frozenUntil)
      effects.push({
        kind: BONUS_CODE.indexOf('freeze'),
        remainingMs: p.frozenUntil - w.now,
      });
    const boostLeft = w.spawnBoostLeftMs(p);
    if (boostLeft > 0)
      effects.push({
        kind: BONUS_CODE.indexOf('boost'),
        remainingMs: boostLeft,
      });
    return {
      // час сервера (мс): за ним клієнт інтерполює, тож зміна частоти (запобіжник) для нього прозора
      tick: Math.round(w.now),
      alive: true,
      total: p.total,
      selfPid: p.id,
      effects,
      forgetChunks,
      chunks,
      foodEvents,
      players,
      cells,
      thorns: s.thornsInState
        ? this.thornList.filter((t) => inView(t.x, t.y))
        : [],
      blobs: this.shared.blobs.filter((b) => inView(b.x, b.y)),
      bonuses: this.shared.bonuses.filter((b) => inView(b.x, b.y)),
      paused: pausedInView,
    };
  }
}

export interface JoinOptions {
  /** Надітий артефакт (перевірений сервером за БД; 0/немає - нічого). */
  artifact?: number;
  /** Токен відновлення з попереднього `welcome`. */
  resume?: string;
  /** Лише відновлення: якщо сесії вже нема - не створювати нову овечку, а повернути `expired` (клієнт покаже лобі). */
  resumeOnly?: boolean;
  /** Клієнт старої версії: кущі в кожному пакеті стану (нові отримують їх один раз у `welcome`). */
  legacyThorns?: boolean;
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
  /** Кущі арени (один раз при вході; далі не змінюються). */
  thorns?: { id: number; x: number; y: number; mass: number }[];
  /** Вид карти арени (FLOCK_MAPS). */
  mapId?: number;
  /** Вигляд кущів карти (FLOCK_MAPS[].thornStyle). */
  thornStyle?: ThornStyle;
  /** Зірки «Зорепаду», що вже падають або лежать (для того, хто зайшов посеред події). */
  stars?: { id: number; x: number; y: number; fall: number }[];
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
    private readonly hooks: FlockHooks = {},
    private readonly opts: {
      /** Лаг loop и CPU процесса вместо реального замера (тесты). */
      loadProbe?: () => Pick<LoadSample, 'loopP99Ms' | 'cpuPct'>;
    } = {},
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
        sameConn.arena.world.setArtifact(p, opts.artifact ?? 0);
        sameConn.arena.world.respawn(p);
        sameConn.deadSent = false;
        sameConn.rewardedThisLife = false;
        sameConn.knownChunks.clear();
        sameConn.knownPlayers.clear();
        sameConn.phraseSent.clear();
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
      artifact: opts.artifact,
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
      rewardedThisLife: false,
      massReportedAt: 0,
      massReported: 0,
      thornsInState: opts.legacyThorns === true,
      lastPhraseAt: -Infinity,
      phraseSent: new Map(),
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
      thorns: s.arena.thornList,
      mapId: s.arena.mapId,
      thornStyle: FLOCK_MAPS.find((m) => m.id === s.arena.mapId)?.thornStyle,
      stars: s.arena.world.starsSnapshot(),
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
    const arena = new Arena(
      this.nextArenaId++,
      this.rng,
      this.send,
      this.now,
      this.hooks,
      this.opts.loadProbe,
    );
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
    s.phraseSent.clear();
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
   * Швидка фраза: лише id зі списку, не частіше за cooldownMs, лише живий гравець не на паузі.
   * Решту (невідомий id, спам, мертвий) мовчки відкидаємо. Розсилка - у тіку, лише тим, хто бачить овечку.
   */
  say(connKey: string, phraseId: unknown): boolean {
    if (!isPhraseId(phraseId)) return false;
    const s = this.byConn.get(connKey);
    if (!s) return false;
    const t = this.now();
    if (t - s.lastPhraseAt < C.phrases.cooldownMs) return false;
    const w = s.arena.world;
    const p = w.players.get(s.pid);
    if (!p || p.bot || !p.alive || p.paused) return false;
    s.lastPhraseAt = t;
    p.phrase = { id: phraseId, until: w.now + phraseDurationMs() };
    return true;
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
    const leaving = arena.world.players.get(s.pid);
    if (leaving) this.hooks.onMass?.(s.userId, leaving.maxMass);
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
      botsActive: a.activeBots,
      botsRetiring: a.retiring.size,
      /** Штатна кількість ботів за людьми й лімітами / ліміт за навантаженням (null - без обмеження). */
      botsTarget: a.targetBots(),
      botsLoadCap: a.governor.loadCap,
      load: a.lastSample,
      decisions: a.decisions.map((d) => ({ ...d })),
      ticks: a.ticks,
      hz: a.rate.hz,
      cpuMsPerTick: a.ticks ? a.cpuMs / a.ticks : 0,
      bytesOut: a.bytesOut,
      packets: a.packets,
      phase: { ...a.phase },
      lateness: { ...a.lateness },
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
