/**
 * Спільна основа гоночних режимів «Отари» (зараз «Лабіринт», далі «Печерний забіг» - коридор з вогнем і стрілами).
 *
 * Тут ВСЕ, що не залежить від траси: раунди підряд (набір -> відлік -> гонка -> підсумки), учасники (люди й боти, до 6),
 * спостерігачі, вибування за відсутність звʼязку, ривок (формула в flock.race.shared.ts), прогрес чекпойнтів, переможець,
 * підсумкова картка, умови нагороди й ключ раунду (сама виплата - flock.rubies.service, одна транзакція, спільний добовий ліміт).
 * Траса (сітка, стіни, їжа, поїдання, боти, ловушки, радіус огляду) підключається через RaceCourse.
 *
 * Час тут - власний годинник матчу (мс), що росте на dt кожного тіку: детерміновано й зручно для перевірок.
 */
import { FLOCK_CONFIG } from './flock.config';
import { type DashState, newDash } from './flock.race.shared';

const R = FLOCK_CONFIG.race;

export const PH_LOBBY = 0;
export const PH_COUNTDOWN = 1;
export const PH_RUNNING = 2;
export const PH_RESULTS = 3;
export type RacePhase = 0 | 1 | 2 | 3;

/** racing - у гонці; spectator - зайшов посеред раунду (дивиться); finished - дійшов до кінця; dropped - вибув. */
export type RaceStatus = 'racing' | 'spectator' | 'finished' | 'dropped';

export interface RaceEntrant {
  pid: number;
  /** null - бот. */
  userId: string | null;
  name: string;
  skin: number;
  bot: boolean;
  /** Рівень бота: 1 - лёгкий, 2 - середній. */
  botLevel: 0 | 1 | 2;
  status: RaceStatus;
  connected: boolean;
  disconnectedAt: number;
  // --- ввід
  angle: number;
  power: number;
  wantDash: boolean;
  dash: DashState;
  // --- стан клітини (заповнює траса)
  x: number;
  y: number;
  mass: number;
  protectUntil: number;
  /** > 0 - клітина розчиняється до цього моменту (з'їдена), потім відродження. */
  dissolveUntil: number;
  // --- прогрес
  /** Скільки чекпойнтів пройдено ПО ПОРЯДКУ після останнього відродження. */
  cp: number;
  finishMs: number | null;
  place: number;
  respawns: number;
  /** Скільки клітин з'їв / скільки разів з'їдений. */
  ate: number;
  eatenBy: number;
  // --- АФК і відстань
  actions: number;
  moved: number;
  /** Довільні дані траси (відвідані клітини, мозок бота тощо). */
  data: Record<string, unknown>;
}

export interface RaceMsg {
  /** 0 - усім учасникам арени, інакше pid адресата. */
  to: number;
  ev: string;
  body: object;
}

/** Підсумок для гравця в картці. */
export interface RaceResultRow {
  pid: number;
  name: string;
  bot: boolean;
  place: number;
  /** Час фінішу, мс (null - не фінішував). */
  t: number | null;
  /** Пройдено чекпойнтів (для тих, хто не фінішував). */
  cp: number;
  ate: number;
  eatenBy: number;
  status: RaceStatus;
}

export type RaceNoReward = 'noWinner' | 'bot' | 'humans' | 'afk' | 'incomplete' | 'tooFast' | 'spectator';

export interface RaceResults {
  /** Унікальний ключ раунду (він же ключ ідемпотентності нагороди). */
  id: string;
  kind: string;
  seed: number;
  durationMs: number;
  /** pid переможця (0 - нема). */
  win: number;
  rows: RaceResultRow[];
  reward: { rubies: number; pending: boolean; reason?: RaceNoReward; limit: number };
}

/** Що віддаємо шлюзу для нарахування (лише людина-переможець, що пройшла умови). */
export interface RaceSettlement {
  roundKey: string;
  kind: string;
  winnerUserId: string;
  winnerPid: number;
}

/** Підключення траси: усе специфічне. */
export interface RaceCourse {
  readonly kind: string;
  readonly maxDurationMs: number;
  /** Готує раунд під seed (геометрія тощо); викликається на початку відліку. */
  prepare(seed: number): void;
  /** Мінімально можливий час проходження (мс), без запасу. */
  minTimeMs(): number;
  checkpointCount(): number;
  /** Ставить учасника на старт (слот 0..5) або повертає на старт/чекпойнт після відродження. */
  place(e: RaceEntrant, slot: number, now: number): void;
  /** Один крок руху, їжі, поїдання, ловушок для всіх, хто в гонці. Про події повідомляє через host. */
  step(dtMs: number, racers: RaceEntrant[], now: number, host: RaceHost): void;
  /** Менше - ближче до фінішу (для місць тих, хто не фінішував). */
  rankKey(e: RaceEntrant): number;
  thinkBot(e: RaceEntrant, racers: RaceEntrant[], now: number): void;
  /** Частина стану для конкретного гравця (клітини й їжа в області огляду, його позиція тощо). */
  viewFor(e: RaceEntrant, focus: RaceEntrant, all: Iterable<RaceEntrant>, now: number, elapsedMs: number): object;
  /** Дані конкретного гравця для welcome (напр. відвідані клітини після перепідключення). */
  welcomeFor?(e: RaceEntrant): object;
  /** Постійні параметри для welcome (геометрія, формули). */
  welcome(): object;
}

export interface RaceHost {
  emit(to: number, ev: string, body: object): void;
  /** Учасник торкнувся наступного чекпойнта (cp - скільки пройдено тепер). */
  checkpoint(e: RaceEntrant, cp: number): void;
  /** Учасник торкнувся кристала (cp повинен дорівнювати числу чекпойнтів - перевіряє траса). */
  finish(e: RaceEntrant): void;
  /** Клітину з'їдено (трасу це не зупиняє). */
  eaten(victim: RaceEntrant, by: RaceEntrant): void;
  /** Учасник вибув із раунду (причина: 'respawns'). */
  drop(e: RaceEntrant, why: string): void;
}

export interface RaceOptions {
  course: RaceCourse;
  /** Для ключа раунду (арена) і початку (мс епохи). */
  arenaId: number;
  rng: () => number;
  epochNow?: () => number;
}

export class RaceMatch implements RaceHost {
  readonly entrants = new Map<number, RaceEntrant>();
  phase: RacePhase = PH_LOBBY;
  /** Годинник матчу (мс). */
  t = 0;
  phaseEndsAt = 0;
  private raceStartedAt = 0;
  private seed = 0;
  private roundId = '';
  private round = 0;
  private winner: RaceEntrant | null = null;
  private graceUntil = 0;
  private humansAtWin = 0;
  private results: RaceResults | null = null;
  private settlement: RaceSettlement | null = null;
  private out: RaceMsg[] = [];
  private finishCount = 0;
  rosterDirty = true;
  /** Арена прибирає зі світу заглушку бота, якого матч витіснив людиною. */
  onBotRemoved: ((pid: number) => void) | null = null;

  constructor(private readonly o: RaceOptions) {
    this.phaseEndsAt = R.lobbyMs;
  }

  get course() {
    return this.o.course;
  }

  get roundKey() {
    return this.roundId;
  }

  get currentSeed() {
    return this.seed;
  }

  get elapsedMs() {
    return this.phase === PH_RUNNING ? this.t - this.raceStartedAt : this.phase === PH_RESULTS && this.results ? this.results.durationMs : 0;
  }

  /** Мс до кінця поточної фази (у гонці - до ліміту часу). */
  get leftMs() {
    return Math.max(0, this.phaseEndsAt - this.t);
  }

  humansRacing() {
    let n = 0;
    for (const e of this.entrants.values()) if (!e.bot && (e.status === 'racing' || e.status === 'finished')) n++;
    return n;
  }

  racers(): RaceEntrant[] {
    const a: RaceEntrant[] = [];
    for (const e of this.entrants.values()) if (e.status === 'racing') a.push(e);
    return a;
  }

  botCount() {
    let n = 0;
    for (const e of this.entrants.values()) if (e.bot) n++;
    return n;
  }

  // ---------------------------------------------------------------- учасники

  newEntrant(pid: number, spec: { userId: string | null; name: string; skin: number; botLevel?: 0 | 1 | 2 }): RaceEntrant {
    return {
      pid,
      userId: spec.userId,
      name: spec.name,
      skin: spec.skin,
      bot: spec.userId === null,
      botLevel: spec.botLevel ?? 0,
      status: 'spectator',
      connected: true,
      disconnectedAt: 0,
      angle: 0,
      power: 0,
      wantDash: false,
      dash: newDash(),
      x: 0,
      y: 0,
      mass: 0,
      protectUntil: 0,
      dissolveUntil: 0,
      cp: 0,
      finishMs: null,
      place: 0,
      respawns: 0,
      ate: 0,
      eatenBy: 0,
      actions: 0,
      moved: 0,
      data: {},
    };
  }

  /** Додає учасника: у наборі й відліку - гонщик, посеред гонки й у підсумках - спостерігач до наступного раунду. */
  add(e: RaceEntrant) {
    this.entrants.set(e.pid, e);
    if (this.phase === PH_LOBBY || this.phase === PH_COUNTDOWN) {
      // людина витісняє бота, якщо всі слоти зайняті
      if (!e.bot && this.racerSlotsFree() <= 0) {
        const bot = [...this.entrants.values()].find((o) => o.bot && o.status === 'racing');
        if (bot) {
          this.entrants.delete(bot.pid);
          this.onBotRemoved?.(bot.pid);
        }
      }
      if (this.racerSlotsFree() > 0) this.makeRacer(e, this.phase === PH_COUNTDOWN);
    }
    this.rosterDirty = true;
  }

  /** Вільні слоти старту (людей і ботів разом не більше maxParticipants); людина, що вже додана, слот не займає, доки не стала гонщиком. */
  racerSlotsFree(): number {
    let n = 0;
    for (const e of this.entrants.values()) if (e.status === 'racing') n++;
    return R.maxParticipants - n;
  }

  private makeRacer(e: RaceEntrant, geometryReady: boolean) {
    e.status = 'racing';
    e.finishMs = null;
    e.place = 0;
    e.respawns = 0;
    e.ate = 0;
    e.eatenBy = 0;
    e.cp = 0;
    e.actions = 0;
    e.moved = 0;
    e.dash = newDash();
    e.data = {};
    e.dissolveUntil = 0;
    e.protectUntil = 0;
    if (geometryReady) this.placeAtFreeSlot(e);
  }

  private placeAtFreeSlot(e: RaceEntrant) {
    // слот - за порядком у списку гонщиків
    let slot = 0;
    for (const o of this.entrants.values()) {
      if (o === e) break;
      if (o.status === 'racing') slot++;
    }
    this.o.course.place(e, slot % R.maxParticipants, this.t);
  }

  remove(pid: number) {
    this.entrants.delete(pid);
    this.rosterDirty = true;
  }

  setConnected(pid: number, connected: boolean) {
    const e = this.entrants.get(pid);
    if (!e || e.bot) return;
    if (connected) {
      e.connected = true;
    } else if (e.connected) {
      e.connected = false;
      e.disconnectedAt = this.t;
    }
  }

  input(pid: number, angle: number, power: number, dash: boolean) {
    const e = this.entrants.get(pid);
    if (!e || e.bot) return;
    if (Number.isFinite(angle)) e.angle = angle;
    e.power = Number.isFinite(power) ? Math.max(0, Math.min(1, power)) : 0;
    e.wantDash = dash;
    e.actions++;
  }

  // ---------------------------------------------------------------- RaceHost

  emit(to: number, ev: string, body: object) {
    this.out.push({ to, ev, body });
  }

  checkpoint(e: RaceEntrant, cp: number) {
    e.cp = cp;
    this.emit(e.pid, 'rv', { k: 'cp', i: cp });
  }

  finish(e: RaceEntrant) {
    if (e.status !== 'racing' || this.phase !== PH_RUNNING) return;
    e.status = 'finished';
    e.finishMs = this.t - this.raceStartedAt;
    e.place = ++this.finishCount;
    this.emit(e.pid, 'rv', { k: 'fin', t: e.finishMs, place: e.place });
    if (!this.winner) {
      this.winner = e;
      this.graceUntil = this.t + R.finishGraceMs;
      this.humansAtWin = this.liveHumans();
      this.emit(0, 'rv', { k: 'win', pid: e.pid, name: e.name, t: e.finishMs });
    }
  }

  eaten(victim: RaceEntrant, by: RaceEntrant) {
    by.ate++;
    victim.eatenBy++;
    this.emit(victim.pid, 'rv', { k: 'eaten', by: by.name, pid: by.pid });
    this.emit(by.pid, 'rv', { k: 'ate', name: victim.name, pid: victim.pid });
  }

  drop(e: RaceEntrant, why: string) {
    if (e.status !== 'racing') return;
    e.status = 'dropped';
    this.emit(e.pid, 'rv', { k: 'drop', why });
    this.rosterDirty = true;
  }

  /** Живі люди в раунді: у гонці або фінішували, зі звʼязком (вибулі й спостерігачі не рахуються). */
  private liveHumans(): number {
    let n = 0;
    for (const e of this.entrants.values()) if (!e.bot && (e.status === 'racing' || e.status === 'finished') && e.connected) n++;
    return n;
  }

  // ---------------------------------------------------------------- хід раунду

  /** Один тік (dtMs). Повертає, чи треба розіслати стан (завжди так). */
  tick(dtMs: number) {
    this.t += dtMs;
    switch (this.phase) {
      case PH_LOBBY:
        if (this.t >= this.phaseEndsAt) this.startCountdown();
        break;
      case PH_COUNTDOWN:
        if (this.t >= this.phaseEndsAt) this.startRace();
        break;
      case PH_RUNNING:
        this.stepRace(dtMs);
        break;
      case PH_RESULTS:
        if (this.t >= this.phaseEndsAt) this.startLobby();
        break;
    }
  }

  private startLobby() {
    this.phase = PH_LOBBY;
    this.phaseEndsAt = this.t + R.lobbyMs;
    this.winner = null;
    this.results = null;
    this.finishCount = 0;
    // усі підключені люди й боти - гонщики нового раунду (хто був спостерігачем чи вибув - знову в грі), до ліміту слотів
    let slots = R.maxParticipants;
    const order = [...this.entrants.values()].sort((a, b) => Number(a.bot) - Number(b.bot));
    for (const e of order) {
      if (!e.bot && !e.connected && this.t - e.disconnectedAt > R.dropMs) {
        e.status = 'spectator';
        continue;
      }
      if (slots > 0) {
        this.makeRacer(e, false);
        slots--;
      } else e.status = 'spectator';
    }
    this.rosterDirty = true;
    this.emit(0, 'rv', { k: 'lobby' });
  }

  private startCountdown() {
    this.round++;
    this.seed = Math.floor(this.o.rng() * 0xffffffff) >>> 0;
    this.roundId = `${this.o.course.kind}:${this.o.arenaId}:${(this.o.epochNow ?? Date.now)()}:${this.seed}`;
    this.o.course.prepare(this.seed);
    this.phase = PH_COUNTDOWN;
    this.phaseEndsAt = this.t + R.countdownMs;
    let slot = 0;
    for (const e of this.entrants.values()) {
      if (e.status !== 'racing') continue;
      this.o.course.place(e, slot++, this.t);
    }
    this.emit(0, 'rr', { id: this.roundId, seed: this.seed, ...(this.o.course.welcome() as object) });
  }

  private startRace() {
    this.phase = PH_RUNNING;
    this.raceStartedAt = this.t;
    this.phaseEndsAt = this.t + this.o.course.maxDurationMs;
    this.winner = null;
    this.finishCount = 0;
    this.emit(0, 'rv', { k: 'go' });
  }

  private stepRace(dtMs: number) {
    const racers = this.racers();
    // вибування: вийшов / обірвався звʼязок довше dropMs
    for (const e of racers) {
      if (!e.bot && !e.connected && this.t - e.disconnectedAt > R.dropMs) this.drop(e, 'disconnect');
    }
    const live = this.racers();
    for (const e of live) if (e.bot) this.o.course.thinkBot(e, live, this.t);
    this.o.course.step(dtMs, live, this.t, this);
    // кінець раунду: час, вікно після переможця, ніхто не лишився в гонці
    const stillRacing = this.racers().length;
    const timeUp = this.t >= this.phaseEndsAt;
    const graceUp = this.winner !== null && this.t >= this.graceUntil;
    if (timeUp || graceUp || stillRacing === 0) this.endRace();
  }

  private endRace() {
    const durationMs = this.t - this.raceStartedAt;
    // місця: фінішували за часом, решта - за близькістю до фінішу
    const all = [...this.entrants.values()].filter((e) => e.status === 'finished' || e.status === 'racing' || e.status === 'dropped');
    const finished = all.filter((e) => e.status === 'finished').sort((a, b) => (a.finishMs ?? 0) - (b.finishMs ?? 0));
    const rest = all.filter((e) => e.status !== 'finished').sort((a, b) => this.o.course.rankKey(a) - this.o.course.rankKey(b));
    const ordered = [...finished, ...rest];
    ordered.forEach((e, i) => (e.place = i + 1));
    const rows: RaceResultRow[] = ordered.map((e) => ({
      pid: e.pid,
      name: e.name,
      bot: e.bot,
      place: e.place,
      t: e.finishMs,
      cp: e.cp,
      ate: e.ate,
      eatenBy: e.eatenBy,
      status: e.status,
    }));
    const verdict = this.rewardVerdict(durationMs);
    this.results = {
      id: this.roundId,
      kind: this.o.course.kind,
      seed: this.seed,
      durationMs,
      win: this.winner?.pid ?? 0,
      rows,
      reward: { rubies: verdict.ok ? R.reward.rubies : 0, pending: verdict.ok, ...(verdict.ok ? {} : { reason: verdict.reason }), limit: R.reward.dailyWinLimit },
    };
    if (verdict.ok && this.winner?.userId) {
      this.settlement = { roundKey: this.roundId, kind: this.o.course.kind, winnerUserId: this.winner.userId, winnerPid: this.winner.pid };
    }
    this.phase = PH_RESULTS;
    this.phaseEndsAt = this.t + R.resultsMs;
    this.emit(0, 'rs', this.results);
  }

  /** Умови нагороди (серверні, до БД): ліміт на добу й добовий потолок перевіряє БД. */
  private rewardVerdict(durationMs: number): { ok: true } | { ok: false; reason: RaceNoReward } {
    const w = this.winner;
    if (!w) return { ok: false, reason: 'noWinner' };
    if (w.bot || !w.userId) return { ok: false, reason: 'bot' };
    if (this.humansAtWin < R.reward.minHumans) return { ok: false, reason: 'humans' };
    if (!w.connected || w.actions < R.reward.afkMinActions || w.moved < R.reward.afkMinMove) return { ok: false, reason: 'afk' };
    if (w.cp < this.o.course.checkpointCount()) return { ok: false, reason: 'incomplete' };
    const t = w.finishMs ?? durationMs;
    if (t < this.o.course.minTimeMs() * R.reward.minTimeSlack) return { ok: false, reason: 'tooFast' };
    return { ok: true };
  }

  /** Заберає підсумок для нарахування (один раз на раунд). */
  takeSettlement(): RaceSettlement | null {
    const s = this.settlement;
    this.settlement = null;
    return s;
  }

  lastResults() {
    return this.phase === PH_RESULTS ? this.results : null;
  }

  /** Повідомлення цього тіку (очищається). */
  drain(): RaceMsg[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  roster() {
    return [...this.entrants.values()].map((e) => ({ pid: e.pid, n: e.name, s: e.skin, b: e.bot ? 1 : 0, st: e.status === 'racing' ? 0 : e.status === 'spectator' ? 1 : e.status === 'finished' ? 2 : 3 }));
  }

  /** Живе місце гонщика серед тих, хто в гонці (за прогресом); для HUD. */
  livePlace(e: RaceEntrant): number {
    if (e.status === 'finished') return e.place;
    const key = this.o.course.rankKey(e);
    let place = this.finishCount + 1;
    for (const o of this.entrants.values()) {
      if (o === e || o.status !== 'racing') continue;
      if (this.o.course.rankKey(o) < key) place++;
    }
    return place;
  }

  /** Стан для гравця на цей тік (JSON): фаза, таймер, його клітина й область огляду від траси. Спостерігач дивиться за лідером. */
  stateFor(pid: number): object | null {
    const e = this.entrants.get(pid);
    if (!e) return null;
    let focus = e;
    let spec = 0;
    if (e.status === 'spectator' || e.status === 'dropped') {
      let best: RaceEntrant | null = null;
      for (const o of this.entrants.values()) {
        if (o.status !== 'racing') continue;
        if (!best || this.o.course.rankKey(o) < this.o.course.rankKey(best)) best = o;
      }
      if (best) {
        focus = best;
        spec = best.pid;
      }
    }
    const racing = this.racers().length;
    return {
      p: this.phase,
      l: Math.round(this.leftMs),
      e: Math.round(this.elapsedMs),
      st: e.status === 'racing' ? 0 : e.status === 'spectator' ? 1 : e.status === 'finished' ? 2 : 3,
      pl: e.status === 'racing' || e.status === 'finished' ? this.livePlace(e) : 0,
      n: racing + this.finishCount,
      ...(spec ? { sp: spec } : {}),
      ...this.o.course.viewFor(e, focus, this.entrants.values(), this.t, this.elapsedMs),
    };
  }

  /** Поля race для welcome: усе, що клієнту треба для побудови траси й формул (траса додає свої). */
  welcome(pid: number): object {
    const e = this.entrants.get(pid);
    return {
      kind: this.o.course.kind,
      phase: this.phase,
      left: Math.round(this.leftMs),
      elapsed: Math.round(this.elapsedMs),
      round: this.roundId || null,
      seed: this.phase === PH_LOBBY ? null : this.seed,
      timings: {
        lobbyMs: R.lobbyMs,
        countdownMs: R.countdownMs,
        finishGraceMs: R.finishGraceMs,
        resultsMs: R.resultsMs,
        dropMs: R.dropMs,
        maxParticipants: R.maxParticipants,
      },
      reward: { rubies: R.reward.rubies, dailyWinLimit: R.reward.dailyWinLimit, minHumans: R.reward.minHumans },
      roster: this.roster(),
      you: e ? { pid: e.pid, st: e.status === 'racing' ? 0 : e.status === 'spectator' ? 1 : e.status === 'finished' ? 2 : 3 } : undefined,
      results: this.lastResults() ?? undefined,
      ...(this.o.course.welcome() as object),
      ...(e && this.o.course.welcomeFor ? (this.o.course.welcomeFor(e) as object) : {}),
    };
  }

  /** Лобі для HTTP (картка режиму): скільки людей і яка фаза. */
  lobby() {
    return { phase: this.phase, leftMs: Math.round(this.leftMs), humans: this.humansRacing(), max: R.maxParticipants };
  }
}
