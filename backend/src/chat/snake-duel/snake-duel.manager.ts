import {
  createMatch,
  isDir,
  queueDirection,
  stepMatch,
  type Cell,
  type Dir,
  type DuelLevel,
  type DuelMatch,
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
  | 'paused'
  | 'matchEnd';

/** Скільки чекаємо на повернення гравця, перш ніж зарахувати перемогу суперникові. */
export const DISCONNECT_GRACE_MS = 5000;
export const COUNTDOWN_SECONDS = 3;

type Emit = (roomId: string, event: string, payload: unknown) => void;

type Session = {
  roomId: string;
  players: [string, string];
  level: number;
  phase: SnakePhase;
  ready: Record<string, boolean>;
  present: Record<string, boolean>;
  // Дуель: один безперервний матч до targetScore штучок
  match: DuelMatch | null;
  countdown: number | null;
  matchWinner: string | null;
  endReason: 'score' | 'disconnect' | null;
  pausedFor: string | null;
  resumePhase: SnakePhase | null;
  tickTimer: ReturnType<typeof setTimeout> | null;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
};

/**
 * Серверна гра «Дуель»: лобі, відлік, фіксований тік, зіткнення, гонка до N штучок з відродженням,
 * пауза при відключенні. «Класика» (рівень 1) сюди не входить: вона локальна й стартує без «Готовий». Клієнти лише шлють напрямок і малюють те, що надіслав сервер.
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
        match: null,
        countdown: null,
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
    // «Готовий» потрібен лише для серверної Дуелі; Класика стартує локально без підтвердження.
    if (s.level === CLASSIC_LEVEL_ID) return;
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
    if (!isDir(dir) || !s.match || !this.isPlayer(s, userId)) return;
    // Натискання, що прийшли під час відліку, теж ставимо в буфер: перший тік їх застосує.
    if (s.phase !== 'playing' && s.phase !== 'countdown') return;
    queueDirection(s.match, s.players[0] === userId ? 0 : 1, dir as Dir);
  }

  /** Гравець відкрив/закрив гру або втратив з'єднання. */
  setPresence(roomId: string, players: [string, string], userId: string, present: boolean) {
    const s = this.session(roomId, players);
    if (!this.isPlayer(s, userId)) return;
    if (s.present[userId] === present) return;
    s.present[userId] = present;

    const live = s.phase === 'countdown' || s.phase === 'playing';
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
    s.match = null;
    s.countdown = null;
    s.matchWinner = null;
    s.endReason = null;
    s.pausedFor = null;
    s.resumePhase = null;
  }

  private start(s: Session) {
    const level = this.levelOf(s);
    if (!level) return;
    this.resetMatchState(s);
    s.match = createMatch(level, this.rng);
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
    if (!level || !s.match) return;
    s.phase = 'playing';
    this.broadcast(s);
    this.scheduleTick(s, level);
  }

  /** setTimeout-ланцюжок (а не setInterval): `tickMs` може залежати від номера ходу. */
  private scheduleTick(s: Session, level: DuelLevel) {
    if (s.tickTimer) clearTimeout(s.tickTimer);
    const match = s.match;
    if (!match) return;
    s.tickTimer = setTimeout(() => this.tick(s, level), level.tickMs(match.tick));
  }

  private tick(s: Session, level: DuelLevel) {
    s.tickTimer = null;
    const match = s.match;
    if (!match || s.phase !== 'playing') return;

    const result = stepMatch(match, level, this.rng);
    if (result.winner === null) {
      this.broadcast(s);
      this.scheduleTick(s, level);
      return;
    }
    this.finishMatch(s, s.players[result.winner]);
  }

  private finishMatch(s: Session, winnerId: string) {
    this.clearTimers(s);
    s.phase = 'matchEnd';
    s.matchWinner = winnerId;
    s.endReason = 'score';
    this.broadcast(s);
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
    s.resumePhase = null;
    if (!this.levelOf(s)) return;
    // Матч стоїть на місці (рахунок, їжа, змійки): чесно відновлюємо через повний відлік.
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
    const match = s.match;
    const duel =
      level && match
        ? {
            board: level.board,
            tickMs: level.tickMs(match.tick),
            targetScore: level.targetScore,
            tick: match.tick,
            food: match.food as Cell,
            snakes: Object.fromEntries(
              s.players.map((id, i) => {
                const snake = match.snakes[i];
                return [
                  id,
                  {
                    body: snake.body,
                    dir: snake.dir,
                    alive: snake.alive,
                    /** Скільки ще до відродження (мс); 0 — жива. */
                    respawnInMs:
                      snake.alive || snake.respawnAtTick === null
                        ? 0
                        : Math.max(0, (snake.respawnAtTick - match.tick) * level.tickMs(match.tick)),
                  },
                ];
              }),
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
      scores: Object.fromEntries(
        s.players.map((id, i) => [id, match ? match.scores[i] : 0]),
      ),
      countdown: s.countdown,
      matchWinner: s.matchWinner,
      endReason: s.endReason,
      pausedFor: s.pausedFor,
      graceMs: DISCONNECT_GRACE_MS,
      duel,
      serverTime: Date.now(),
    };
  }
}
