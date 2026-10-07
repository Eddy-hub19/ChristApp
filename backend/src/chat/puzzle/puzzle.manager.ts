import { characterCard } from '../guess-character/data/character-card';
import { CHARACTERS, getCharacter } from '../guess-character/data/characters';
import {
  PUZZLE_IMAGES,
  charactersWithImages,
  getPuzzleImage,
  imagesOfCharacter,
  type PuzzleImage,
} from './data/puzzle-images';
import {
  PIECE_COUNTS,
  clampGroupOrigin,
  colOf,
  freeSlots,
  groupMinCell,
  isPieceCount,
  jitter,
  layoutFor,
  nearlyEqual,
  neighborsOf,
  rowOf,
  type Layout,
  type PieceCount,
} from './puzzle.engine';

export type PuzzlePhase = 'lobby' | 'playing' | 'done';
export type PuzzleMode = 'duel' | 'solo';
export type SelectionMode = 'random' | 'byName';

/** Скільки сесія може простоювати без дій, перш ніж сервер її забуде. */
export const IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Кусочок, який тримали й не рухали довше за цей час, знову стає вільним (вкладку закрили, зв'язок зник). */
export const HOLD_TTL_MS = 8_000;
/** Рідше за цей інтервал рух одного гравця не приймається (клієнт шле ~15 разів на секунду). */
export const MOVE_MIN_INTERVAL_MS = 40;

type Emit = (userId: string, event: string, payload: unknown) => void;
type Players = [string, string];

type Group = {
  id: number;
  pieces: number[];
  x: number;
  y: number;
  placed: boolean;
  heldBy: string | null;
  heldAt: number;
  /** Порядок малювання: останній зрушений — зверху. */
  z: number;
  /** Хто востаннє відпускав групу (йому зараховується кусочок, що стояв самотнім). */
  lastHolder: string | null;
};

type Puzzle = {
  seed: number;
  imageId: string;
  layout: Layout;
  groups: Map<number, Group>;
  /** Кусочок → id групи. */
  pieceGroup: number[];
  /** Кому зараховано кусочок (став частиною більшої групи чи ліг на місце). */
  credit: Array<string | null>;
  nextGroupId: number;
  zCounter: number;
  startedAt: number;
  finishedAt: number | null;
};

type Selection = {
  mode: SelectionMode;
  characterId: string;
  imageId: string;
};

type Session = {
  key: string;
  roomId: string;
  mode: PuzzleMode;
  players: string[];
  /** Той, хто обирає картинку й складність; другий бачить вибір. */
  creatorId: string;
  present: Record<string, boolean>;
  phase: PuzzlePhase;
  count: PieceCount;
  selection: Selection | null;
  puzzle: Puzzle | null;
  lastMoveAt: Record<string, number>;
  lastTouch: number;
};

/**
 * Серверна гра «Пазли». Сесія живе в пам'яті сервера й не залежить від того, чи гравці відкриті в грі:
 * можна піти в чат і повернутися — пазл на місці (забувається через 7 днів без дій). Сервер — єдине
 * джерело істини: позиції груп, блокування «хто що тримає», прилипання й склейка рахуються тут.
 */
export class PuzzleManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly emit: Emit,
    private readonly rng: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  // ───────────── доступ ─────────────

  private session(
    roomId: string,
    players: Players,
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
        creatorId: userId,
        present: Object.fromEntries(ps.map((id) => [id, false])),
        phase: 'lobby',
        count: 24,
        selection: null,
        puzzle: null,
        lastMoveAt: {},
        lastTouch: this.now(),
      };
      this.sessions.set(key, s);
    }
    return s;
  }

  private find(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
  ) {
    if (!players.includes(userId)) return null;
    const s = this.session(roomId, players, userId, solo);
    s.lastTouch = this.now();
    return s;
  }

  /** Обирати картинку може автор гри; якщо його немає в грі, роль переходить до того, хто зараз тут. */
  private canSetup(s: Session, userId: string) {
    if (s.phase !== 'lobby') return false;
    if (s.creatorId === userId) return true;
    if (!s.present[s.creatorId] && s.present[userId]) {
      s.creatorId = userId;
      return true;
    }
    return false;
  }

  // ───────────── публічні команди ─────────────

  /** Відкрили гру / реконект: присутність і актуальний стан (кусочки, які гравець тримав, відпускаємо). */
  sync(roomId: string, players: Players, userId: string, solo: boolean) {
    const s = this.find(roomId, players, userId, solo);
    if (!s) return;
    s.present[userId] = true;
    this.expireHolds(s);
    this.emit(userId, 'puzzle-session', this.serialize(s));
    this.broadcast(s, userId);
  }

  setPresence(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
    present: boolean,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || s.present[userId] === present) return;
    s.present[userId] = present;
    if (!present) this.releaseHolds(s, userId);
    this.broadcast(s);
  }

  /** Усі сокети користувача закрились: він «пішов», кусочки відпущено, але гра зберігається. */
  userDisconnected(userId: string) {
    for (const s of this.sessions.values()) {
      if (s.players.includes(userId) && s.present[userId]) {
        s.present[userId] = false;
        this.releaseHolds(s, userId);
        this.broadcast(s);
      }
    }
  }

  /** «Випадкова» (mode=random) або «За ім'ям» (mode=byName + characterId). Вибір бачать обоє. */
  select(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
    mode: unknown,
    characterId?: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || !this.canSetup(s, userId)) return;
    let character: string | undefined;
    if (mode === 'byName') {
      const candidate =
        typeof characterId === 'string' ? getCharacter(characterId) : undefined;
      if (!candidate || imagesOfCharacter(candidate.id).length === 0) return;
      character = candidate.id;
    } else if (mode === 'random') {
      const pool = charactersWithImages();
      if (pool.length === 0) return;
      character = this.pickOf(pool).id;
    } else {
      return;
    }
    // Повторний вибір того ж героя («Інша картина») не повертає ту саму картину, якщо є з чого обирати.
    const all = imagesOfCharacter(character);
    const others =
      s.selection?.characterId === character
        ? all.filter((i) => i.id !== s.selection?.imageId)
        : all;
    const image = this.pickOf(others.length > 0 ? others : all);
    s.selection = {
      mode: mode as SelectionMode,
      characterId: character,
      imageId: image.id,
    };
    this.broadcast(s);
  }

  setCount(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
    count: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || !isPieceCount(count) || !this.canSetup(s, userId)) return;
    s.count = count;
    this.broadcast(s);
  }

  start(roomId: string, players: Players, userId: string, solo: boolean) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || !this.canSetup(s, userId) || !s.selection) return;
    const image = getPuzzleImage(s.selection.imageId);
    if (!image) return;
    this.begin(s, image);
    this.broadcast(s);
  }

  /** «Ще раз»: та сама картина, свіжий розкид і нова форма кусочків. Може будь-хто з гравців. */
  again(roomId: string, players: Players, userId: string, solo: boolean) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || s.phase === 'lobby' || !s.selection) return;
    const image = getPuzzleImage(s.selection.imageId);
    if (!image) return;
    this.begin(s, image);
    this.broadcast(s);
  }

  /** «Інша картинка» / вихід із партії: назад у вибір картинки. Хто натиснув — той тепер обирає. */
  toLobby(roomId: string, players: Players, userId: string, solo: boolean) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || s.phase === 'lobby') return;
    s.phase = 'lobby';
    s.puzzle = null;
    s.selection = null;
    s.creatorId = userId;
    this.broadcast(s);
  }

  /** Береться кусочок (група): блокується за гравцем, поки він його не відпустить. */
  grab(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
    groupId: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    const puzzle = s?.phase === 'playing' ? s.puzzle : null;
    if (!s || !puzzle || typeof groupId !== 'number') return;
    const group = puzzle.groups.get(groupId);
    if (!group || group.placed) return;
    this.expireHolds(s);
    if (group.heldBy && group.heldBy !== userId) return;
    // Один гравець тримає одну групу: попередню (якщо вона лишилась) відпускаємо на місці.
    this.releaseHolds(s, userId, group.id);
    group.heldBy = userId;
    group.heldAt = this.now();
    group.z = ++puzzle.zCounter;
    this.broadcast(s);
  }

  /** Рух зі сторони власника: позиція зберігається й, як правило, ретранслюється іншому гравцеві без повного знімка. */
  move(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
    groupId: unknown,
    x: unknown,
    y: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    const puzzle = s?.phase === 'playing' ? s.puzzle : null;
    if (!s || !puzzle || typeof groupId !== 'number') return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const group = puzzle.groups.get(groupId);
    if (!group || group.heldBy !== userId) return;
    const now = this.now();
    if (now - (s.lastMoveAt[userId] ?? 0) < MOVE_MIN_INTERVAL_MS) return;
    s.lastMoveAt[userId] = now;
    const pos = clampGroupOrigin(
      puzzle.layout,
      group.pieces,
      x as number,
      y as number,
    );
    group.x = pos.x;
    group.y = pos.y;
    group.heldAt = now;
    for (const id of s.players) {
      if (id !== userId) {
        this.emit(id, 'puzzle-move', {
          roomId: s.roomId,
          groupId,
          x: pos.x,
          y: pos.y,
          by: userId,
        });
      }
    }
  }

  /** Курсор/палець гравця на полі — лише для відображення соперникові. */
  cursor(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
    x: unknown,
    y: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    if (!s || s.phase !== 'playing') return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    for (const id of s.players) {
      if (id !== userId) {
        this.emit(id, 'puzzle-cursor', { roomId: s.roomId, x, y, by: userId });
      }
    }
  }

  /** Гравець відпустив кусочок: підтверджена позиція, прилипання до місця й склейка з сусідами. */
  drop(
    roomId: string,
    players: Players,
    userId: string,
    solo: boolean,
    groupId: unknown,
    x: unknown,
    y: unknown,
  ) {
    const s = this.find(roomId, players, userId, solo);
    const puzzle = s?.phase === 'playing' ? s.puzzle : null;
    if (!s || !puzzle || typeof groupId !== 'number') return;
    const group = puzzle.groups.get(groupId);
    if (!group || group.heldBy !== userId) return;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const pos = clampGroupOrigin(
        puzzle.layout,
        group.pieces,
        x as number,
        y as number,
      );
      group.x = pos.x;
      group.y = pos.y;
    }
    group.heldBy = null;
    group.lastHolder = userId;
    group.z = ++puzzle.zCounter;
    const joined = this.settle(s, puzzle, group, userId);
    this.broadcast(s);
    if (joined) {
      for (const id of s.players) {
        this.emit(id, 'puzzle-event', {
          roomId: s.roomId,
          type: s.phase === 'done' ? 'done' : 'join',
          by: userId,
        });
      }
    }
  }

  /** «Зібрати до краю»: усі вільні розсипані кусочки лягають по периметру світу. */
  gather(roomId: string, players: Players, userId: string, solo: boolean) {
    const s = this.find(roomId, players, userId, solo);
    const puzzle = s?.phase === 'playing' ? s.puzzle : null;
    if (!s || !puzzle) return;
    this.expireHolds(s);
    const movable = [...puzzle.groups.values()].filter(
      (g) => !g.placed && !g.heldBy,
    );
    if (movable.length === 0) return;
    const slots = freeSlots(puzzle.layout, this.rng, 'edge');
    if (slots.length === 0) return;
    this.shuffle(movable).forEach((group, index) => {
      const slot = slots[index % slots.length];
      const { minCol, minRow } = groupMinCell(puzzle.layout, group.pieces);
      const j =
        index >= slots.length
          ? jitter(puzzle.layout, this.rng)
          : { x: 0, y: 0 };
      const pos = clampGroupOrigin(
        puzzle.layout,
        group.pieces,
        slot.x - minCol * puzzle.layout.cw + j.x,
        slot.y - minRow * puzzle.layout.ch + j.y,
      );
      group.x = pos.x;
      group.y = pos.y;
      group.z = ++puzzle.zCounter;
    });
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

  private begin(s: Session, image: PuzzleImage) {
    const layout = layoutFor(s.count, image.width, image.height);
    const total = layout.cols * layout.rows;
    const slots = freeSlots(layout, this.rng, 'random');
    const groups = new Map<number, Group>();
    const order = this.shuffle(Array.from({ length: total }, (_, i) => i));
    order.forEach((piece, index) => {
      const slot = slots[index % slots.length];
      const j = jitter(layout, this.rng);
      const pos = clampGroupOrigin(
        layout,
        [piece],
        slot.x - colOf(layout, piece) * layout.cw + j.x,
        slot.y - rowOf(layout, piece) * layout.ch + j.y,
      );
      groups.set(piece, {
        id: piece,
        pieces: [piece],
        x: pos.x,
        y: pos.y,
        placed: false,
        heldBy: null,
        heldAt: 0,
        z: index + 1,
        lastHolder: null,
      });
    });
    s.puzzle = {
      seed: Math.floor(this.rng() * 0x7fffffff),
      imageId: image.id,
      layout,
      groups,
      pieceGroup: Array.from({ length: total }, (_, i) => i),
      credit: Array.from({ length: total }, () => null),
      nextGroupId: total,
      zCounter: total,
      startedAt: this.now(),
      finishedAt: null,
    };
    s.phase = 'playing';
    s.lastMoveAt = {};
  }

  /**
   * Після відпускання: прилипання до своєї позиції на полі та склейка з правильними сусідами
   * (повторюється, доки є що клеїти). Повертає true, якщо щось склеїлось.
   */
  private settle(s: Session, puzzle: Puzzle, start: Group, userId: string) {
    const { layout } = puzzle;
    let group = start;
    let joined = false;

    if (
      nearlyEqual(group.x, 0, layout.snap) &&
      nearlyEqual(group.y, 0, layout.snap)
    ) {
      group = this.placeOnBoard(puzzle, group, userId);
      joined = true;
    }

    let merged = true;
    while (merged && !group.placed) {
      merged = false;
      for (const piece of group.pieces) {
        for (const neighbor of neighborsOf(layout, piece)) {
          const otherId = puzzle.pieceGroup[neighbor];
          if (otherId === group.id) continue;
          const other = puzzle.groups.get(otherId);
          // Кусочок, який зараз тримає інший гравець, не клеїмо: він рухається.
          if (!other || other.placed || other.heldBy) continue;
          if (
            nearlyEqual(group.x, other.x, layout.snap) &&
            nearlyEqual(group.y, other.y, layout.snap)
          ) {
            group = this.merge(puzzle, group, other, userId);
            joined = true;
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    if (group.pieces.length === layout.cols * layout.rows) {
      group = this.placeOnBoard(puzzle, group, userId);
      s.phase = 'done';
      puzzle.finishedAt = this.now();
      joined = true;
    }
    return joined;
  }

  /** Група лягає на місце (0, 0) і зливається з уже покладеною. */
  private placeOnBoard(puzzle: Puzzle, group: Group, userId: string): Group {
    this.creditPieces(puzzle, group, userId);
    group.x = 0;
    group.y = 0;
    group.placed = true;
    const base = [...puzzle.groups.values()].find(
      (g) => g.placed && g.id !== group.id,
    );
    if (!base) return group;
    return this.absorb(puzzle, base, group);
  }

  private merge(puzzle: Puzzle, a: Group, b: Group, userId: string): Group {
    this.creditPieces(puzzle, a, userId);
    this.creditPieces(puzzle, b, b.lastHolder ?? userId);
    // Склеєна група лишається там, де стояла більша: менша «підтягується» до неї.
    const [big, small] = a.pieces.length >= b.pieces.length ? [a, b] : [b, a];
    return this.absorb(puzzle, big, small);
  }

  private absorb(puzzle: Puzzle, into: Group, from: Group): Group {
    for (const piece of from.pieces) {
      into.pieces.push(piece);
      puzzle.pieceGroup[piece] = into.id;
    }
    into.placed = into.placed || from.placed;
    into.z = ++puzzle.zCounter;
    into.lastHolder = into.lastHolder ?? from.lastHolder;
    puzzle.groups.delete(from.id);
    return into;
  }

  /** Самотній кусочок, що вперше з чимось з'єднався, зараховується тому, хто його поставив. */
  private creditPieces(puzzle: Puzzle, group: Group, userId: string) {
    for (const piece of group.pieces) {
      if (puzzle.credit[piece] === null) puzzle.credit[piece] = userId;
    }
  }

  private releaseHolds(s: Session, userId: string, exceptGroup?: number) {
    const puzzle = s.puzzle;
    if (!puzzle) return;
    for (const group of puzzle.groups.values()) {
      if (group.heldBy === userId && group.id !== exceptGroup) {
        group.heldBy = null;
        group.lastHolder = userId;
      }
    }
  }

  /** Знімає застарілі блокування (власник зник, не відпустивши кусочок). */
  private expireHolds(s: Session) {
    const puzzle = s.puzzle;
    if (!puzzle) return;
    const cutoff = this.now() - HOLD_TTL_MS;
    for (const group of puzzle.groups.values()) {
      if (group.heldBy && group.heldAt < cutoff) {
        group.lastHolder = group.heldBy;
        group.heldBy = null;
      }
    }
  }

  private pickOf<T>(items: T[]): T {
    return items[
      Math.min(items.length - 1, Math.floor(this.rng() * items.length))
    ];
  }

  private shuffle<T>(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ───────────── серіалізація ─────────────

  private broadcast(s: Session, except?: string) {
    for (const id of s.players) {
      if (id !== except) this.emit(id, 'puzzle-session', this.serialize(s));
    }
  }

  private serialize(s: Session) {
    const puzzle = s.puzzle;
    const image = puzzle ? getPuzzleImage(puzzle.imageId) : undefined;
    const done = s.phase === 'done' && puzzle && image;
    const character =
      done && s.selection ? getCharacter(s.selection.characterId) : undefined;
    return {
      roomId: s.roomId,
      mode: s.mode,
      players: s.players,
      creatorId: s.creatorId,
      present: s.present,
      phase: s.phase,
      count: s.count,
      counts: PIECE_COUNTS,
      selection: s.selection,
      puzzle: puzzle
        ? {
            seed: puzzle.seed,
            imageId: puzzle.imageId,
            cols: puzzle.layout.cols,
            rows: puzzle.layout.rows,
            boardW: puzzle.layout.boardW,
            boardH: puzzle.layout.boardH,
            cw: puzzle.layout.cw,
            ch: puzzle.layout.ch,
            world: puzzle.layout.world,
            startedAt: puzzle.startedAt,
            finishedAt: puzzle.finishedAt,
            groups: [...puzzle.groups.values()]
              .sort((a, b) => a.z - b.z)
              .map((g) => ({
                id: g.id,
                pieces: g.pieces,
                x: g.x,
                y: g.y,
                placed: g.placed,
                heldBy: g.heldBy,
              })),
          }
        : null,
      reveal: done
        ? {
            image: image,
            card: character ? characterCard(character) : null,
            elapsedMs: (puzzle.finishedAt ?? this.now()) - puzzle.startedAt,
            placedBy: Object.fromEntries(
              s.players.map((id) => [
                id,
                puzzle.credit.filter((c) => c === id).length,
              ]),
            ),
          }
        : null,
      serverTime: this.now(),
    };
  }
}

/** Каталог для клієнта: персонажі з картинками (імена трьома мовами) і сама інформація про картини. */
export function puzzleCatalog() {
  const characters = charactersWithImages().map((c) => ({
    id: c.id,
    name: c.name,
    imageIds: imagesOfCharacter(c.id).map((i) => i.id),
  }));
  return {
    counts: PIECE_COUNTS,
    characters,
    images: PUZZLE_IMAGES,
    totalCharacters: CHARACTERS.length,
  };
}
