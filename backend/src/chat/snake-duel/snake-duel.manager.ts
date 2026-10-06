import {
  createRound,
  isDir,
  queueDirection,
  stepRound,
  type Cell,
  type Dir,
  type DuelLevel,
  type DuelRound,
} from './snake-duel.engine';
import {
  CLASSIC_LEVEL_ID,
  SELECTABLE_LEVEL_IDS,
  getDuelLevel,
} from './snake-duel.levels';

export type SnakePhase =
  | 'lobby'
  | 'countdown'
  | 'playing'
  | 'roundEnd'
  | 'paused'
  | 'matchEnd';

/** Скільки чекаємо на повернення гравця, перш ніж зарахувати перемогу суперникові. */
export const DISCONNECT_GRACE_MS = 5000;
export const COUNTDOWN_SECONDS = 3;
export const ROUND_END_PAUSE_MS = 2000;

type Emit = (roomId: string, event: string, payload: unknown) => void;

type Session = {
  roomId: string;
  players: [string, string];
  level: number;
  phase: SnakePhase;
  ready: Record<string, boolean>;
  present: Record<string, boolean>;
  /// Лічильник запусків рівня 1: клієнти стартують класику, коли він змінюється.
  classicRun: number;
  // Дуель
  round: DuelRound | null;
  roundNumber: number;
  wins: Record<string, number>;
  countdown: number | null;
  roundWinner: string | null | undefined; // undefined — раунд ще йде; null — нічия
  matchWinner: string | null;
  endReason: 'score' | 'disconnect' | null;
  pausedFor: string | null;
  resumePhase: SnakePhase | null;
  tickTimer: ReturnType<typeof setTimeout> | null;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
};

/**
 * Серверна гра «Дуель»: лобі, відлік, фіксований тік, зіткнення, матч до N перемог,
 * пауза при відключенні. Клієнти лише шлють напрямок і малюють те, що надіслав сервер.
 */
export class SnakeDuelManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly emit: Emit,
    private readonly rng: () => number = Math.random,
  ) {}

  // ───────────── доступ ─────────────

  private session(roomId: string, players: [string, string]): Session {
    let s = this.sessions.get(roomId);
    if (!s) {
      s = {
        roomId,
        players,
        level: CLASSIC_LEVEL_ID,
        phase: 'lobby',
        ready: { [players[0]]: false, [players[1]]: false },
        present: { [players[0]]: false, [players[1]]: false },
        classicRun: 0,
        round: null,
        roundNumber: 0,
        wins: { [players[0]]: 0, [players[1]]: 0 },
        countdown: null,
        roundWinner: undefined,
        matchWinner: null,
        endReason: null,
        pausedFor: null,
        resumePhase: null,
        tickTimer: null,
        phaseTimer: null,
        graceTimer: null,
      };
      this.sessions.set(roomId, s);
    }
    return s;
  }

  private isPlayer(s: Session, userId: string) {
    return s.players.includes(userId);
  }

  private levelOf(s: Session): DuelLevel | undefined {
    return getDuelLevel(s.level);
  }

  // ───────────── публічні команди ─────────────

  /** Швидка перевірка для гарячого шляху `snake-input`: без запитів до БД, якщо сесія вже відома. */
  playersIfParticipant(roomId: string, userId: string): [string, string] | null {
    const s = this.sessions.get(roomId);
    return s && this.isPlayer(s, userId) ? s.players : null;
  }

  snapshot(roomId: string, players: [string, string]) {
    return this.serialize(this.session(roomId, players));
  }

  selectLevel(roomId: string, players: [string, string], userId: string, level: number) {
    const s = this.session(roomId, players);
    if (!this.isPlayer(s, userId) || !SELECTABLE_LEVEL_IDS.includes(level)) return;
    if (s.phase !== 'lobby' && s.phase !== 'matchEnd') return;
    s.level = level;
    s.phase = 'lobby';
    this.resetMatchState(s);
    s.ready = { [s.players[0]]: false, [s.players[1]]: false };
    this.broadcast(s);
  }

  setReady(roomId: string, players: [string, string], userId: string, ready: boolean) {
    const s = this.session(roomId, players);
    if (!this.isPlayer(s, userId)) return;
    if (s.phase !== 'lobby' && s.phase !== 'matchEnd') return;
    s.ready[userId] = ready;
    if (s.ready[s.players[0]] && s.ready[s.players[1]]) {
      s.ready = { [s.players[0]]: false, [s.players[1]]: false };
      this.start(s);
      return;
    }
    this.broadcast(s);
  }

  input(roomId: string, players: [string, string], userId: string, dir: unknown) {
    const s = this.session(roomId, players);
    if (!isDir(dir) || !s.round || !this.isPlayer(s, userId)) return;
    // Натискання, що прийшли під час відліку, теж ставимо в буфер: перший тік їх застосує.
    if (s.phase !== 'playing' && s.phase !== 'countdown') return;
    queueDirection(s.round, s.players[0] === userId ? 0 : 1, dir as Dir);
  }

  /** Гравець відкрив/закрив гру або втратив з'єднання. */
  setPresence(roomId: string, players: [string, string], userId: string, present: boolean) {
    const s = this.session(roomId, players);
    if (!this.isPlayer(s, userId)) return;
    if (s.present[userId] === present) return;
    s.present[userId] = present;

    const live = s.phase === 'countdown' || s.phase === 'playing' || s.phase === 'roundEnd';
    if (!present && live) {
      this.pause(s, userId);
      return;
    }
    if (present && s.phase === 'paused' && s.pausedFor === userId) {
      this.resume(s);
      return;
    }
    this.broadcast(s);
  }

  /** Зʼєднання користувача впало (усі його сокети): зараховуємо як відхід із гри в усіх його сесіях. */
  userDisconnected(userId: string) {
    for (const s of this.sessions.values()) {
      if (this.isPlayer(s, userId)) {
        this.setPresence(s.roomId, s.players, userId, false);
      }
    }
  }

  dispose(roomId: string) {
    const s = this.sessions.get(roomId);
    if (!s) return;
    this.clearTimers(s);
    this.sessions.delete(roomId);
  }

  disposeAll() {
    for (const roomId of [...this.sessions.keys()]) this.dispose(roomId);
  }

  // ───────────── життєвий цикл ─────────────

  private resetMatchState(s: Session) {
    this.clearTimers(s);
    s.round = null;
    s.roundNumber = 0;
    s.wins = { [s.players[0]]: 0, [s.players[1]]: 0 };
    s.countdown = null;
    s.roundWinner = undefined;
    s.matchWinner = null;
    s.endReason = null;
    s.pausedFor = null;
    s.resumePhase = null;
  }

  private start(s: Session) {
    if (s.level === CLASSIC_LEVEL_ID) {
      s.classicRun += 1;
      s.phase = 'lobby';
      this.broadcast(s);
      return;
    }
    const level = this.levelOf(s);
    if (!level) return;
    this.resetMatchState(s);
    s.roundNumber = 0;
    this.beginRound(s, level);
  }

  private beginRound(s: Session, level: DuelLevel) {
    s.roundNumber += 1;
    s.round = createRound(level, this.rng);
    s.roundWinner = undefined;
    this.runCountdown(s, COUNTDOWN_SECONDS);
  }

  private runCountdown(s: Session, from: number) {
    this.clearTimers(s);
    s.phase = 'countdown';
    s.countdown = from;
    this.broadcast(s);
    const step = () => {
      if (s.countdown === null) return;
      s.countdown -= 1;
      if (s.countdown <= 0) {
        s.countdown = null;
        this.beginPlaying(s);
        return;
      }
      this.broadcast(s);
      s.phaseTimer = setTimeout(step, 1000);
    };
    s.phaseTimer = setTimeout(step, 1000);
  }

  private beginPlaying(s: Session) {
    const level = this.levelOf(s);
    if (!level || !s.round) return;
    s.phase = 'playing';
    this.broadcast(s);
    this.scheduleTick(s, level);
  }

  /** setTimeout-ланцюжок (а не setInterval): `tickMs` може залежати від номера ходу. */
  private scheduleTick(s: Session, level: DuelLevel) {
    if (s.tickTimer) clearTimeout(s.tickTimer);
    const round = s.round;
    if (!round) return;
    s.tickTimer = setTimeout(() => this.tick(s, level), level.tickMs(round.tick));
  }

  private tick(s: Session, level: DuelLevel) {
    s.tickTimer = null;
    const round = s.round;
    if (!round || s.phase !== 'playing') return;

    const result = stepRound(round, level);
    if (result.outcome === 'continue') {
      this.broadcast(s);
      this.scheduleTick(s, level);
      return;
    }

    const winnerId =
      result.outcome === 'win0'
        ? s.players[0]
        : result.outcome === 'win1'
          ? s.players[1]
          : null;
    this.finishRound(s, level, winnerId);
  }

  private finishRound(s: Session, level: DuelLevel, winnerId: string | null) {
    this.clearTimers(s);
    s.phase = 'roundEnd';
    s.roundWinner = winnerId;
    if (winnerId) s.wins[winnerId] = (s.wins[winnerId] ?? 0) + 1;

    if (winnerId && s.wins[winnerId] >= level.winsToTake) {
      s.phase = 'matchEnd';
      s.matchWinner = winnerId;
      s.endReason = 'score';
      this.broadcast(s);
      return;
    }
    this.broadcast(s);
    s.phaseTimer = setTimeout(() => this.beginRound(s, level), ROUND_END_PAUSE_MS);
  }

  // ───────────── відключення ─────────────

  private pause(s: Session, userId: string) {
    this.clearTimers(s);
    s.resumePhase = s.phase;
    s.phase = 'paused';
    s.pausedFor = userId;
    this.broadcast(s);
    s.graceTimer = setTimeout(() => this.forfeit(s, userId), DISCONNECT_GRACE_MS);
  }

  private resume(s: Session) {
    if (s.graceTimer) clearTimeout(s.graceTimer);
    s.graceTimer = null;
    s.pausedFor = null;
    const level = this.levelOf(s);
    const was = s.resumePhase;
    s.resumePhase = null;
    if (!level) return;
    if (was === 'roundEnd') {
      // Результат раунду вже зафіксований: продовжуємо з наступного.
      s.phase = 'roundEnd';
      this.broadcast(s);
      s.phaseTimer = setTimeout(() => this.beginRound(s, level), ROUND_END_PAUSE_MS);
      return;
    }
    // Раунд ставили на паузу посеред ходу: чесно відновлюємо через повний відлік.
    this.runCountdown(s, COUNTDOWN_SECONDS);
  }

  private forfeit(s: Session, userId: string) {
    this.clearTimers(s);
    const winner = s.players.find((id) => id !== userId) ?? null;
    s.phase = 'matchEnd';
    s.matchWinner = winner;
    s.endReason = 'disconnect';
    s.pausedFor = null;
    s.resumePhase = null;
    if (winner) s.wins[winner] = Math.max(s.wins[winner] ?? 0, this.levelOf(s)?.winsToTake ?? 0);
    this.broadcast(s);
  }

  private clearTimers(s: Session) {
    if (s.tickTimer) clearTimeout(s.tickTimer);
    if (s.phaseTimer) clearTimeout(s.phaseTimer);
    if (s.graceTimer) clearTimeout(s.graceTimer);
    s.tickTimer = null;
    s.phaseTimer = null;
    s.graceTimer = null;
  }

  // ───────────── серіалізація ─────────────

  private broadcast(s: Session) {
    this.emit(s.roomId, 'snake-session', this.serialize(s));
  }

  private serialize(s: Session) {
    const level = this.levelOf(s);
    const round = s.round;
    const duel =
      level && round
        ? {
            board: level.board,
            tickMs: level.tickMs(round.tick),
            winsToTake: level.winsToTake,
            round: s.roundNumber,
            tick: round.tick,
            food: round.food as Cell,
            snakes: Object.fromEntries(
              s.players.map((id, i) => [
                id,
                {
                  body: round.snakes[i].body,
                  dir: round.snakes[i].dir,
                  alive: round.snakes[i].alive,
                },
              ]),
            ),
            obstacles: level.obstacles(),
          }
        : null;

    return {
      roomId: s.roomId,
      players: s.players,
      level: s.level,
      levels: SELECTABLE_LEVEL_IDS,
      phase: s.phase,
      ready: s.ready,
      present: s.present,
      classicRun: s.classicRun,
      wins: s.wins,
      countdown: s.countdown,
      roundWinner: s.roundWinner === undefined ? undefined : s.roundWinner,
      matchWinner: s.matchWinner,
      endReason: s.endReason,
      pausedFor: s.pausedFor,
      graceMs: DISCONNECT_GRACE_MS,
      duel,
      serverTime: Date.now(),
    };
  }
}
