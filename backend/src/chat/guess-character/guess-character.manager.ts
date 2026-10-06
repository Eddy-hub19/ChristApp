import {
  HINT_LEVEL,
  MAX_QUESTIONS,
  ROUNDS_PER_MATCH,
  answerFor,
  candidatesFor,
  isLevel,
  isTraitId,
  pickRandom,
  pointsFor,
  poolForLevel,
  type HistoryEntry,
  type Level,
} from './guess-character.engine';
import { BIBLE_BOOKS } from './data/bible-books';
import { CHARACTERS, getCharacter } from './data/characters';
import { TRAITS, TRAIT_GROUPS } from './data/traits';
import type { Character } from './data/character.types';

export type GuessPhase =
  | 'lobby'
  | 'picking'
  | 'asking'
  | 'roundEnd'
  | 'matchEnd';
export type GuessMode = 'duel' | 'solo';

/** Скільки сесія може простоювати без дій, перш ніж сервер її забуде. */
export const IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Emit = (userId: string, event: string, payload: unknown) => void;

type RoundResult = {
  round: number;
  hiderId: string | null;
  guesserId: string;
  characterId: string;
  guessed: boolean;
  attempts: number;
  points: number;
};

type Session = {
  key: string;
  roomId: string;
  mode: GuessMode;
  /** Дуель: двоє учасників чату. Соло: лише користувач (загадує комп'ютер). */
  players: string[];
  level: Level;
  phase: GuessPhase;
  ready: Record<string, boolean>;
  present: Record<string, boolean>;
  round: number;
  secret: string | null;
  history: HistoryEntry[];
  scores: Record<string, number>;
  results: RoundResult[];
  matchWinner: string | null;
  /// Журнал завершених матчів (не очищується скиданням): клієнт дописує статистику з нього,
  /// навіть якщо в момент завершення був не в грі.
  matchLog: MatchLogEntry[];
  matchCount: number;
  lastTouch: number;
};

export type MatchLogEntry = {
  n: number;
  winner: string | null;
  scores: Record<string, number>;
};
const MATCH_LOG_LIMIT = 20;

/**
 * Серверна гра «Вгадай персонажа». Сесія живе в пам'яті сервера й не залежить від того, чи гравці
 * відкриті в грі: можна піти й повернутися — стан збережений. Загаданий персонаж ніколи не йде
 * відгадувачеві до кінця раунду, а відповіді «так / ні / невідомо» дає таблиця ознак.
 */
export class GuessCharacterManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly emit: Emit,
    private readonly rng: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  // ───────────── доступ ─────────────

  private session(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
  ): Session {
    const key = solo ? `${roomId}:solo:${userId}` : roomId;
    let s = this.sessions.get(key);
    if (!s) {
      const ps = solo ? [userId] : [...players];
      s = {
        key,
        roomId,
        mode: solo ? 'solo' : 'duel',
        players: ps,
        level: 1,
        phase: 'lobby',
        ready: Object.fromEntries(ps.map((id) => [id, false])),
        present: Object.fromEntries(ps.map((id) => [id, false])),
        round: 0,
        secret: null,
        history: [],
        scores: Object.fromEntries(ps.map((id) => [id, 0])),
        results: [],
        matchWinner: null,
        matchLog: [],
        matchCount: 0,
        lastTouch: this.now(),
      };
      this.sessions.set(key, s);
    }
    return s;
  }

  private find(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
  ) {
    if (!players.includes(userId)) return null;
    const s = this.session(roomId, players, userId, solo);
    s.lastTouch = this.now();
    return s;
  }

  // ───────────── публічні команди ─────────────

  /** Відкрили гру / реконект: позначаємо присутність і віддаємо актуальний стан саме цьому гравцеві. */
  sync(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s) return;
    s.present[userId] = true;
    this.emit(userId, 'guess-session', this.serialize(s, userId));
    this.broadcast(s, userId);
  }

  setPresence(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
    present: boolean,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || s.present[userId] === present) return;
    s.present[userId] = present;
    this.broadcast(s);
  }

  /** Усі сокети користувача закрились: він «пішов», але гра зберігається. */
  userDisconnected(userId: string) {
    for (const s of this.sessions.values()) {
      if (s.players.includes(userId) && s.present[userId]) {
        s.present[userId] = false;
        this.broadcast(s);
      }
    }
  }

  selectLevel(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
    level: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || !isLevel(level)) return;
    if (s.phase !== 'lobby' && s.phase !== 'matchEnd') return;
    this.resetMatch(s);
    s.level = level;
    this.broadcast(s);
  }

  setReady(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
    ready: boolean,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s) return;
    if (s.phase !== 'lobby' && s.phase !== 'matchEnd') return;
    s.ready[userId] = ready;
    if (s.players.every((id) => s.ready[id])) {
      // З matchEnd новий матч стартує лише коли готові обидва: так суперник встигає побачити підсумок.
      if (s.phase === 'matchEnd') this.resetMatch(s);
      s.ready = Object.fromEntries(s.players.map((id) => [id, false]));
      this.beginRound(s);
      return;
    }
    this.broadcast(s);
  }

  /** Загадувач обирає персонажа зі списку рівня. */
  pick(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
    characterId: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || s.phase !== 'picking' || this.hiderOf(s) !== userId) return;
    const character = getCharacter(characterId);
    if (!character || !this.pool(s).some((c) => c.id === character.id)) return;
    s.secret = character.id;
    s.phase = 'asking';
    this.broadcast(s);
  }

  /** Питання-кнопка: відповідь береться з таблиці ознак таємного персонажа. */
  ask(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
    trait: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || !this.canAct(s, userId) || !isTraitId(trait) || !s.secret) return;
    if (s.history.some((h) => h.kind === 'question' && h.trait === trait))
      return;
    const secret = getCharacter(s.secret);
    if (!secret) return;
    s.history.push({
      kind: 'question',
      trait,
      answer: answerFor(secret, trait),
    });
    if (s.history.length >= MAX_QUESTIONS) {
      this.finishRound(s, false);
      return;
    }
    this.broadcast(s);
  }

  /** Спроба вгадати: правильна завершує раунд, неправильна коштує одного питання. */
  guess(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
    characterId: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || !this.canAct(s, userId) || !s.secret) return;
    const character = getCharacter(characterId);
    if (!character || !this.pool(s).some((c) => c.id === character.id)) return;
    if (
      s.history.some((h) => h.kind === 'guess' && h.character === character.id)
    )
      return;
    const correct = character.id === s.secret;
    s.history.push({ kind: 'guess', character: character.id, correct });
    if (correct) {
      this.finishRound(s, true);
      return;
    }
    if (s.history.length >= MAX_QUESTIONS) {
      this.finishRound(s, false);
      return;
    }
    this.broadcast(s);
  }

  /** Після картки персонажа — наступний раунд (або кінець матчу вже оголошено сервером). */
  next(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || s.phase !== 'roundEnd') return;
    this.beginRound(s);
  }

  /** Скинути матч і повернутися в лобі (без запису результату). */
  abort(
    roomId: string,
    players: [string, string],
    userId: string,
    solo: boolean,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s) return;
    this.resetMatch(s);
    this.broadcast(s);
  }

  /** Забуває сесії, до яких давно ніхто не торкався. */
  sweepIdle() {
    const cutoff = this.now() - IDLE_TTL_MS;
    for (const [key, s] of this.sessions) {
      if (s.lastTouch < cutoff) this.sessions.delete(key);
    }
  }

  disposeAll() {
    this.sessions.clear();
  }

  // ───────────── життєвий цикл ─────────────

  private pool(s: Session): Character[] {
    return poolForLevel(s.level);
  }

  /** Хто загадує в поточному раунді; у соло — комп'ютер (null). */
  private hiderOf(s: Session): string | null {
    if (s.mode === 'solo') return null;
    return s.players[(s.round - 1) % 2];
  }

  private guesserOf(s: Session): string {
    if (s.mode === 'solo') return s.players[0];
    return s.players[s.round % 2];
  }

  private canAct(s: Session, userId: string) {
    return s.phase === 'asking' && this.guesserOf(s) === userId;
  }

  private resetMatch(s: Session) {
    s.phase = 'lobby';
    s.round = 0;
    s.secret = null;
    s.history = [];
    s.scores = Object.fromEntries(s.players.map((id) => [id, 0]));
    s.results = [];
    s.matchWinner = null;
    s.ready = Object.fromEntries(s.players.map((id) => [id, false]));
  }

  private beginRound(s: Session) {
    s.round += 1;
    s.history = [];
    if (s.mode === 'solo') {
      s.secret = pickRandom(this.pool(s), this.rng).id;
      s.phase = 'asking';
    } else {
      s.secret = null;
      s.phase = 'picking';
    }
    this.broadcast(s);
  }

  private finishRound(s: Session, guessed: boolean) {
    const attempts = s.history.length;
    const points = pointsFor(attempts, guessed);
    const guesserId = this.guesserOf(s);
    s.scores[guesserId] = (s.scores[guesserId] ?? 0) + points;
    s.results.push({
      round: s.round,
      hiderId: this.hiderOf(s),
      guesserId,
      characterId: s.secret ?? '',
      guessed,
      attempts,
      points,
    });
    if (s.round >= ROUNDS_PER_MATCH) {
      s.phase = 'matchEnd';
      s.matchWinner = this.winnerOf(s);
      s.matchCount += 1;
      s.matchLog.push({
        n: s.matchCount,
        winner: s.matchWinner,
        scores: { ...s.scores },
      });
      if (s.matchLog.length > MATCH_LOG_LIMIT) s.matchLog.shift();
    } else {
      s.phase = 'roundEnd';
    }
    this.broadcast(s);
  }

  private winnerOf(s: Session): string | null {
    if (s.mode === 'solo') return null;
    const [a, b] = s.players;
    if (s.scores[a] === s.scores[b]) return null;
    return s.scores[a] > s.scores[b] ? a : b;
  }

  // ───────────── серіалізація ─────────────

  private broadcast(s: Session, except?: string) {
    for (const id of s.players) {
      if (id !== except) this.emit(id, 'guess-session', this.serialize(s, id));
    }
  }

  /** Знімок для конкретного гравця: таємниця потрапляє лише до загадувача (і всім після раунду). */
  private serialize(s: Session, viewerId: string) {
    const hiderId = s.round > 0 ? this.hiderOf(s) : null;
    const guesserId = s.round > 0 ? this.guesserOf(s) : null;
    const over = s.phase === 'roundEnd' || s.phase === 'matchEnd';
    const secret = s.secret ? getCharacter(s.secret) : undefined;
    const isHider = viewerId === hiderId;
    const last = s.results[s.results.length - 1];
    const candidates =
      s.level === HINT_LEVEL && s.phase === 'asking' && viewerId === guesserId
        ? candidatesFor(this.pool(s), s.history).map((c) => c.id)
        : null;

    return {
      roomId: s.roomId,
      mode: s.mode,
      players: s.players,
      level: s.level,
      phase: s.phase,
      ready: s.ready,
      present: s.present,
      round: s.round,
      rounds: ROUNDS_PER_MATCH,
      maxQuestions: MAX_QUESTIONS,
      hiderId,
      guesserId,
      scores: s.scores,
      history: s.history,
      secretId: isHider && s.phase === 'asking' ? s.secret : null,
      candidates,
      reveal:
        over && secret && last ? { ...last, card: this.card(secret) } : null,
      results: s.results,
      matchWinner: s.matchWinner,
      matches: s.matchLog,
      serverTime: this.now(),
    };
  }

  private card(c: Character) {
    return {
      id: c.id,
      name: c.name,
      about: c.about,
      refs: c.refs.map((r) => {
        const book = BIBLE_BOOKS[r.book - 1];
        const tail = `${r.chapter}${r.verses ? `:${r.verses}` : ''}`;
        return {
          book: r.book,
          chapter: r.chapter,
          verses: r.verses ?? null,
          label: {
            ua: `${book.ua} ${tail}`,
            ru: `${book.ru} ${tail}`,
            en: `${book.en} ${tail}`,
          },
        };
      }),
    };
  }
}

/** Каталог для клієнта: імена й складність персонажів (без ознак) та перелік питань за вкладками. */
export function guessCatalog() {
  return {
    characters: CHARACTERS.map((c) => ({
      id: c.id,
      difficulty: c.difficulty,
      name: c.name,
    })),
    traits: TRAITS.map((t) => ({ id: t.id, group: t.group })),
    groups: TRAIT_GROUPS,
    maxQuestions: MAX_QUESTIONS,
    rounds: ROUNDS_PER_MATCH,
  };
}
