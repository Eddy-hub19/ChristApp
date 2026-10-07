import {
  HOLD_TTL_MS,
  IDLE_TTL_MS,
  MOVE_MIN_INTERVAL_MS,
  PuzzleManager,
  puzzleCatalog,
} from './puzzle.manager';
import { imagesOfCharacter } from './data/puzzle-images';
import { CHARACTERS } from '../guess-character/data/characters';

// Герої беруться з каталогу, а не вшиті в тести: набір картин поповнюється скриптом.
const CATALOG = puzzleCatalog();
const HERO = CATALOG.characters[0].id;
const OTHER_HERO = CATALOG.characters[1].id;
const MULTI_HERO = CATALOG.characters.find((c) => c.imageIds.length > 1)?.id;
const NO_IMAGE_HERO = CHARACTERS.find(
  (c) => imagesOfCharacter(c.id).length === 0,
)?.id;

type Msg = { userId: string; event: string; payload: any };

const ROOM = 'room-1';
const A = 'alice';
const B = 'bob';
const PLAYERS: [string, string] = [A, B];

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function setup(rng: () => number = seeded(42)) {
  const clock = { t: 1_000_000 };
  const sent: Msg[] = [];
  const manager = new PuzzleManager(
    (userId, event, payload) => sent.push({ userId, event, payload }),
    rng,
    () => clock.t,
  );
  const view = (userId: string) =>
    [...sent]
      .reverse()
      .find((m) => m.userId === userId && m.event === 'puzzle-session')
      ?.payload;
  const g = {
    sync: (u: string) => manager.sync(ROOM, PLAYERS, u, false),
    presence: (u: string, p: boolean) =>
      manager.setPresence(ROOM, PLAYERS, u, false, p),
    select: (u: string, mode: unknown, character?: unknown) =>
      manager.select(ROOM, PLAYERS, u, false, mode, character),
    count: (u: string, c: unknown) =>
      manager.setCount(ROOM, PLAYERS, u, false, c),
    start: (u: string) => manager.start(ROOM, PLAYERS, u, false),
    again: (u: string) => manager.again(ROOM, PLAYERS, u, false),
    lobby: (u: string) => manager.toLobby(ROOM, PLAYERS, u, false),
    grab: (u: string, id: unknown) => manager.grab(ROOM, PLAYERS, u, false, id),
    move: (u: string, id: unknown, x: unknown, y: unknown) =>
      manager.move(ROOM, PLAYERS, u, false, id, x, y),
    drop: (u: string, id: unknown, x: unknown, y: unknown) =>
      manager.drop(ROOM, PLAYERS, u, false, id, x, y),
    gather: (u: string) => manager.gather(ROOM, PLAYERS, u, false),
  };
  return { manager, sent, view, clock, g };
}

/** Починає партію на `count` кусочків для Авраама. */
function started(count = 12) {
  const ctx = setup();
  ctx.g.sync(A);
  ctx.g.sync(B);
  ctx.g.select(A, 'byName', HERO);
  ctx.g.count(A, count);
  ctx.g.start(A);
  return ctx;
}

const group = (ctx: ReturnType<typeof setup>, id: number, as = A) =>
  ctx.view(as).puzzle.groups.find((x: any) => x.id === id);

/** Кусочок i лежить у групі з рівно одним кусочком — повертає її id. */
const groupOf = (ctx: ReturnType<typeof setup>, piece: number, as = A) =>
  ctx.view(as).puzzle.groups.find((x: any) => x.pieces.includes(piece));

describe('PuzzleManager — вибір картини', () => {
  it('«Випадкова»: обирається персонаж, у якого є картина, і вибір бачать обоє', () => {
    const { g, view } = setup();
    g.sync(A);
    g.sync(B);
    g.select(A, 'random');
    const sel = view(B).selection;
    expect(sel.mode).toBe('random');
    expect(imagesOfCharacter(sel.characterId).map((i) => i.id)).toContain(
      sel.imageId,
    );
  });

  it("«За ім'ям»: тільки персонажі з картинами; картина — одна з його картин", () => {
    const { g, view } = setup();
    g.sync(A);
    g.select(A, 'byName', HERO);
    expect(view(A).selection.characterId).toBe(HERO);
    expect(imagesOfCharacter(HERO).map((i) => i.id)).toContain(
      view(A).selection.imageId,
    );

    if (NO_IMAGE_HERO) {
      g.select(A, 'byName', NO_IMAGE_HERO); // персонаж є в «Вгадай», але кольорової картини немає
      expect(view(A).selection.characterId).toBe(HERO);
    }
    g.select(A, 'byName', 'not-a-character');
    expect(view(A).selection.characterId).toBe(HERO);
    g.select(A, 'nonsense');
    expect(view(A).selection.characterId).toBe(HERO);
  });

  (MULTI_HERO ? it : it.skip)(
    '«Інша картина»: той самий герой, але інша картина',
    () => {
      const { g, view } = setup();
      g.sync(A);
      g.select(A, 'byName', MULTI_HERO);
      for (let i = 0; i < 12; i += 1) {
        const before = view(A).selection.imageId;
        g.select(A, 'byName', MULTI_HERO);
        const after = view(A).selection;
        expect(after.characterId).toBe(MULTI_HERO);
        expect(after.imageId).not.toBe(before);
      }
    },
  );

  it('обирає й змінює складність лише автор; другий бачить вибір', () => {
    const { g, view } = setup();
    g.sync(A);
    g.sync(B);
    expect(view(B).creatorId).toBe(A);
    g.select(B, 'random'); // не автор
    g.count(B, 96);
    expect(view(B).selection).toBeNull();
    expect(view(B).count).toBe(24);
    g.count(A, 96);
    expect(view(B).count).toBe(96);
    g.count(A, 50); // нестандартне значення відкидається
    expect(view(B).count).toBe(96);
  });

  it('якщо автора немає в грі, вибирати може той, хто зараз тут', () => {
    const { g, view } = setup();
    g.sync(A);
    g.sync(B);
    g.presence(A, false);
    g.select(B, 'random');
    expect(view(B).selection).not.toBeNull();
    expect(view(B).creatorId).toBe(B);
  });

  it('не стартує без вибраної картини', () => {
    const { g, view } = setup();
    g.sync(A);
    g.start(A);
    expect(view(A).phase).toBe('lobby');
  });

  it('каталог містить щонайменше 30 персонажів, і в кожного є картина', () => {
    const catalog = puzzleCatalog();
    expect(catalog.characters.length).toBeGreaterThanOrEqual(30);
    for (const c of catalog.characters)
      expect(c.imageIds.length).toBeGreaterThan(0);
  });
});

describe('PuzzleManager — розкид', () => {
  it.each([12, 24, 48, 96])(
    '%i кусочків: усі окремо, у світі й поза полем',
    (count) => {
      const ctx = started(count);
      const v = ctx.view(A).puzzle;
      expect(v.groups).toHaveLength(count);
      expect(v.cols * v.rows).toBe(count);
      const pieces = v.groups
        .flatMap((x: any) => x.pieces)
        .sort((a: number, b: number) => a - b);
      expect(pieces).toEqual(Array.from({ length: count }, (_, i) => i));
      for (const grp of v.groups) {
        expect(grp.pieces).toHaveLength(1);
        expect(grp.placed).toBe(false);
        expect(grp.heldBy).toBeNull();
        const col = grp.pieces[0] % v.cols;
        const row = Math.floor(grp.pieces[0] / v.cols);
        const px = grp.x + col * v.cw;
        const py = grp.y + row * v.ch;
        const overlapsBoard =
          px < v.boardW && px + v.cw > 0 && py < v.boardH && py + v.ch > 0;
        expect(overlapsBoard).toBe(false);
        expect(px).toBeGreaterThanOrEqual(v.world.minX - 1);
        expect(px + v.cw).toBeLessThanOrEqual(v.world.maxX + 1);
      }
    },
  );

  it('кусочки перемішані, а кожна нова партія — з іншим розкидом і seed', () => {
    const ctx = started(24);
    const first = ctx.view(A).puzzle;
    const pos = (puzzle: any) =>
      puzzle.groups
        .map((x: any) => `${x.id}:${Math.round(x.x)}:${Math.round(x.y)}`)
        .join();
    ctx.g.again(A);
    const second = ctx.view(A).puzzle;
    expect(second.seed).not.toBe(first.seed);
    expect(pos(second)).not.toBe(pos(first));
  });
});

describe('PuzzleManager — блокування кусочка', () => {
  it('взятий кусочок блокується за гравцем; другий не може його взяти', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    expect(group(ctx, 3, B).heldBy).toBe(A);
    ctx.g.grab(B, 3);
    expect(group(ctx, 3, B).heldBy).toBe(A);
  });

  it('другий гравець не може ні рухати, ні відпустити чужий кусочок', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    const before = { ...group(ctx, 3) };
    ctx.clock.t += 500;
    ctx.g.move(B, 3, 10, 10);
    ctx.g.drop(B, 3, 0, 0);
    const after = group(ctx, 3);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.heldBy).toBe(A);
    expect(after.placed).toBe(false);
  });

  it('після відпускання кусочок знову вільний', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    ctx.g.drop(A, 3, -300, -300);
    expect(group(ctx, 3).heldBy).toBeNull();
    ctx.g.grab(B, 3);
    expect(group(ctx, 3).heldBy).toBe(B);
  });

  it('гравець тримає один кусочок: взявши другий, першого відпускає', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    ctx.g.grab(A, 4);
    expect(group(ctx, 3).heldBy).toBeNull();
    expect(group(ctx, 4).heldBy).toBe(A);
  });

  it('рух ретранслюється лише іншому гравцеві й не частіше за ліміт', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    ctx.sent.length = 0;
    ctx.clock.t += 100;
    ctx.g.move(A, 3, -200, -250);
    const moves = ctx.sent.filter((m) => m.event === 'puzzle-move');
    expect(moves).toHaveLength(1);
    expect(moves[0].userId).toBe(B);
    expect(moves[0].payload).toMatchObject({
      groupId: 3,
      x: -200,
      y: -250,
      by: A,
    });
    ctx.clock.t += MOVE_MIN_INTERVAL_MS - 10;
    ctx.g.move(A, 3, -100, -100); // надто швидко
    expect(ctx.sent.filter((m) => m.event === 'puzzle-move')).toHaveLength(1);
  });

  it('позиція відкидається в межі світу', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    ctx.clock.t += 100;
    ctx.g.move(A, 3, 9e9, -9e9);
    const v = ctx.view(A).puzzle;
    // знімок бере позицію зі стану: відпускаємо, щоб побачити
    ctx.g.drop(A, 3, 9e9, -9e9);
    const grp = group(ctx, 3);
    const col = 3 % v.cols;
    expect(grp.x + col * v.cw + v.cw).toBeLessThanOrEqual(v.world.maxX + 0.01);
    expect(grp.y + Math.floor(3 / v.cols) * v.ch).toBeGreaterThanOrEqual(
      v.world.minY - 0.01,
    );
  });

  it('виліт гравця (сокет закрито або вийшов із гри) відпускає його кусочок', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    ctx.manager.userDisconnected(A);
    expect(group(ctx, 3, B).heldBy).toBeNull();
    ctx.g.sync(A);
    ctx.g.grab(A, 4);
    ctx.g.presence(A, false);
    expect(group(ctx, 4, B).heldBy).toBeNull();
  });

  it('застарілий замок знімається сам, і кусочок можна взяти', () => {
    const ctx = started();
    ctx.g.grab(A, 3);
    ctx.clock.t += HOLD_TTL_MS + 1;
    ctx.g.grab(B, 3);
    expect(group(ctx, 3).heldBy).toBe(B);
  });

  it('невідомі й нечислові id не ламають сервер', () => {
    const ctx = started();
    ctx.g.grab(A, 9999);
    ctx.g.grab(A, 'x');
    ctx.g.move(A, 9999, 1, 1);
    ctx.g.drop(A, null, 1, 1);
    expect(ctx.view(A).phase).toBe('playing');
  });
});

describe('PuzzleManager — прилипання', () => {
  it('кусочок, відпущений біля свого місця на полі, прилипає й більше не рухається', () => {
    const ctx = started();
    const v = ctx.view(A).puzzle;
    ctx.g.grab(A, 5);
    ctx.g.drop(A, 5, v.cw * 0.1, -v.ch * 0.1); // близько до (0, 0)
    const grp = groupOf(ctx, 5);
    expect(grp.placed).toBe(true);
    expect(grp.x).toBe(0);
    expect(grp.y).toBe(0);
    ctx.g.grab(B, grp.id);
    expect(groupOf(ctx, 5).heldBy).toBeNull(); // покладений кусочок не береться
  });

  it('відпущений далеко від місця — лишається де є', () => {
    const ctx = started();
    ctx.g.grab(A, 5);
    ctx.g.drop(A, 5, -400, -400);
    const grp = groupOf(ctx, 5);
    expect(grp.placed).toBe(false);
    expect(grp.x).toBe(-400);
    expect(grp.y).toBe(-400);
  });

  it('допуск — частка розміру кусочка: трохи за межею не липне', () => {
    const ctx = started();
    const v = ctx.view(A).puzzle;
    ctx.g.grab(A, 5);
    ctx.g.drop(A, 5, v.cw * 0.5, 0);
    expect(groupOf(ctx, 5).placed).toBe(false);
  });
});

describe('PuzzleManager — склейка груп', () => {
  it('сусідні кусочки, виставлені правильно відносно одне одного, склеюються в групу', () => {
    const ctx = started();
    ctx.g.grab(A, 0);
    ctx.g.drop(A, 0, -300, -300);
    ctx.g.grab(B, 1);
    ctx.g.drop(B, 1, -300, -300); // той самий «початок» = правильне взаємне положення
    const grp = groupOf(ctx, 0);
    expect(grp.pieces.sort()).toEqual([0, 1]);
    expect(grp.placed).toBe(false);
  });

  it('несусідні кусочки не клеяться, навіть якщо початки збігаються', () => {
    const ctx = started();
    ctx.g.grab(A, 0);
    ctx.g.drop(A, 0, -300, -300);
    ctx.g.grab(B, 7);
    ctx.g.drop(B, 7, -300, -300);
    expect(groupOf(ctx, 0).pieces).toEqual([0]);
    expect(groupOf(ctx, 7).pieces).toEqual([7]);
  });

  it('сусіди з неправильним взаємним положенням не клеяться', () => {
    const ctx = started();
    ctx.g.grab(A, 0);
    ctx.g.drop(A, 0, -300, -300);
    ctx.g.grab(B, 1);
    ctx.g.drop(B, 1, -300 + ctx.view(A).puzzle.cw, -300);
    expect(groupOf(ctx, 0).pieces).toEqual([0]);
  });

  it('склеєна група рухається разом: позиція одна на всіх кусочків', () => {
    const ctx = started();
    ctx.g.grab(A, 0);
    ctx.g.drop(A, 0, -300, -300);
    ctx.g.grab(A, 1);
    ctx.g.drop(A, 1, -300, -300);
    const joined = groupOf(ctx, 0);
    ctx.g.grab(B, joined.id);
    ctx.clock.t += 100;
    ctx.g.drop(B, joined.id, -350, -420);
    const moved = groupOf(ctx, 1);
    expect(moved.pieces.sort()).toEqual([0, 1]);
    expect(moved.x).toBe(-350);
    expect(moved.y).toBe(-420);
  });

  it('склейка ланцюгом: один кусочок з’єднує дві групи в одну', () => {
    const ctx = started();
    for (const [piece, who] of [
      [0, A],
      [2, B],
    ] as const) {
      ctx.g.grab(who, piece);
      ctx.g.drop(who, piece, -300, -300);
    }
    expect(
      ctx.view(A).puzzle.groups.filter((x: any) => x.pieces.length === 1),
    ).toHaveLength(12);
    ctx.g.grab(A, 1);
    ctx.g.drop(A, 1, -300, -300); // 1 — сусід і 0, і 2
    expect(groupOf(ctx, 0).pieces.sort()).toEqual([0, 1, 2]);
  });

  it('кусочок, який тримає інший гравець, не клеїться', () => {
    const ctx = started();
    ctx.g.grab(A, 0);
    ctx.g.drop(A, 0, -300, -300);
    ctx.g.grab(B, 1);
    ctx.g.grab(A, 2);
    ctx.g.drop(A, 2, -300, -300); // 2 стоїть правильно щодо 1, але 1 зараз у руках B
    expect(groupOf(ctx, 2).pieces).toEqual([2]);
  });

  it('група, що торкнулась поля, прилипає разом з усіма кусочками', () => {
    const ctx = started();
    for (const piece of [0, 1, 4]) {
      ctx.g.grab(A, piece);
      ctx.g.drop(A, piece, -300, -300);
    }
    const grp = groupOf(ctx, 0);
    expect(grp.pieces.sort((a: number, b: number) => a - b)).toEqual([0, 1, 4]);
    ctx.g.grab(A, grp.id);
    ctx.g.drop(A, grp.id, 5, 5);
    const placed = groupOf(ctx, 0);
    expect(placed.placed).toBe(true);
    expect(placed.pieces.sort((a: number, b: number) => a - b)).toEqual([
      0, 1, 4,
    ]);
  });

  it('кусочок, прилеглий до покладеної групи, стає її частиною одним рухом', () => {
    const ctx = started();
    ctx.g.grab(A, 0);
    ctx.g.drop(A, 0, 0, 0);
    ctx.g.grab(B, 1);
    ctx.g.drop(B, 1, 3, -2);
    const grp = groupOf(ctx, 0);
    expect(grp.placed).toBe(true);
    expect(grp.pieces.sort()).toEqual([0, 1]);
    expect(ctx.view(A).puzzle.groups.filter((x: any) => x.placed)).toHaveLength(
      1,
    );
  });
});

describe('PuzzleManager — фінал і статистика', () => {
  function solve(
    ctx: ReturnType<typeof setup>,
    order: number[],
    playerFor: (i: number) => string,
  ) {
    for (const piece of order) {
      const who = playerFor(piece);
      const grp = groupOf(ctx, piece, who);
      ctx.clock.t += 200;
      ctx.g.grab(who, grp.id);
      ctx.g.drop(who, grp.id, 0, 0);
    }
  }

  it('збірка до кінця: фаза done, час, картка персонажа, підпис картини', () => {
    const ctx = started(12);
    ctx.clock.t += 60_000;
    const order = Array.from({ length: 12 }, (_, i) => i);
    solve(ctx, order, (i) => (i % 2 === 0 ? A : B));
    const v = ctx.view(B);
    expect(v.phase).toBe('done');
    expect(v.puzzle.groups).toHaveLength(1);
    expect(v.puzzle.groups[0].placed).toBe(true);
    expect(v.reveal.elapsedMs).toBeGreaterThanOrEqual(60_000);
    expect(v.reveal.card.id).toBe(HERO);
    expect(v.reveal.card.name.ua).toBeTruthy();
    expect(v.reveal.card.refs.length).toBeGreaterThan(0);
    expect(v.reveal.image.author).toBeTruthy();
    expect(v.reveal.image.title).toBeTruthy();
    expect(v.reveal.image.source).toBeTruthy();
    expect(v.reveal.image.license).toMatch(/public domain|pd|cc0/i);
    expect(v.reveal.image.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(v.reveal.image.sourceUrl).toContain('commons.wikimedia.org');
  });

  it('статистика: кожному зараховано кусочки, які він поставив; разом — усі', () => {
    const ctx = started(12);
    solve(
      ctx,
      Array.from({ length: 12 }, (_, i) => i),
      (i) => (i < 9 ? A : B),
    );
    const { placedBy } = ctx.view(A).reveal;
    expect(placedBy[A]).toBe(9);
    expect(placedBy[B]).toBe(3);
    expect(placedBy[A] + placedBy[B]).toBe(12);
  });

  it('після фіналу кусочки не рухаються, а «Ще раз» стартує ту саму картину заново', () => {
    const ctx = started(12);
    const imageId = ctx.view(A).selection.imageId;
    solve(
      ctx,
      Array.from({ length: 12 }, (_, i) => i),
      () => A,
    );
    ctx.g.grab(A, 0);
    expect(ctx.view(A).phase).toBe('done');
    ctx.g.again(B);
    const v = ctx.view(A);
    expect(v.phase).toBe('playing');
    expect(v.puzzle.imageId).toBe(imageId);
    expect(v.puzzle.groups).toHaveLength(12);
    expect(v.reveal).toBeNull();
  });

  it('«Інша картинка»: назад у вибір, той, хто натиснув, тепер обирає', () => {
    const ctx = started(12);
    solve(
      ctx,
      Array.from({ length: 12 }, (_, i) => i),
      () => A,
    );
    ctx.g.lobby(B);
    const v = ctx.view(A);
    expect(v.phase).toBe('lobby');
    expect(v.selection).toBeNull();
    expect(v.creatorId).toBe(B);
    expect(v.puzzle).toBeNull();
  });
});

describe('PuzzleManager — збір до краю', () => {
  it('вільні розсипані кусочки йдуть до краю, покладені й затиснуті в руці — ні', () => {
    const ctx = started(24);
    ctx.g.grab(A, 0);
    ctx.g.drop(A, 0, 0, 0); // покладений
    ctx.g.grab(B, 1); // у руці
    const before = new Map<number, { x: number; y: number }>(
      ctx.view(A).puzzle.groups.map((x: any) => [x.id, { x: x.x, y: x.y }]),
    );
    ctx.g.gather(A);
    const v = ctx.view(A).puzzle;
    const placed = v.groups.find((x: any) => x.placed);
    expect(placed.pieces).toEqual([0]);
    expect(v.groups.find((x: any) => x.id === 1).x).toBe(before.get(1)!.x);
    expect(v.groups.find((x: any) => x.id === 1).heldBy).toBe(B);
    const moved = v.groups.filter((x: any) => !x.placed && x.id !== 1);
    expect(moved.length).toBe(22);
    for (const grp of moved) {
      const col = grp.pieces[0] % v.cols;
      const row = Math.floor(grp.pieces[0] / v.cols);
      const px = grp.x + col * v.cw;
      const py = grp.y + row * v.ch;
      const overlapsBoard =
        px < v.boardW && px + v.cw > 0 && py < v.boardH && py + v.ch > 0;
      expect(overlapsBoard).toBe(false);
    }
  });
});

describe('PuzzleManager — сесія', () => {
  it('вийшов у чат і повернувся: пазл на місці, зі збереженими позиціями', () => {
    const ctx = started(24);
    ctx.g.grab(A, 3);
    ctx.g.drop(A, 3, -300, -300);
    ctx.g.grab(B, 4);
    ctx.g.drop(B, 4, -300, -300);
    ctx.g.presence(A, false);
    ctx.manager.userDisconnected(B);
    const saved = JSON.stringify(ctx.view(A).puzzle.groups);

    ctx.g.sync(A);
    const back = ctx.view(A);
    expect(back.phase).toBe('playing');
    expect(JSON.stringify(back.puzzle.groups)).toBe(saved);
    expect(back.selection.characterId).toBe(HERO);
    expect(back.present[A]).toBe(true);
    expect(back.present[B]).toBe(false);
  });

  it('другий гравець бачить повернення першого', () => {
    const ctx = started();
    ctx.g.presence(A, false);
    expect(ctx.view(B).present[A]).toBe(false);
    ctx.g.sync(A);
    expect(ctx.view(B).present[A]).toBe(true);
  });

  it('сесія забувається через 7 днів без активності, а не раніше', () => {
    const ctx = started();
    ctx.clock.t += IDLE_TTL_MS - 1000;
    ctx.manager.sweepIdle();
    ctx.g.sync(A);
    expect(ctx.view(A).phase).toBe('playing');

    ctx.clock.t += IDLE_TTL_MS + 1000;
    ctx.manager.sweepIdle();
    ctx.g.sync(A);
    expect(ctx.view(A).phase).toBe('lobby');
    expect(ctx.view(A).puzzle).toBeNull();
  });

  it('сторонній користувач не може ні читати, ні міняти сесію', () => {
    const ctx = started();
    const before = ctx.sent.length;
    ctx.manager.sync(ROOM, PLAYERS, 'mallory', false);
    ctx.manager.grab(ROOM, PLAYERS, 'mallory', false, 0);
    ctx.manager.drop(ROOM, PLAYERS, 'mallory', false, 0, 0, 0);
    expect(ctx.sent.length).toBe(before);
  });

  it('одиночний режим: власна сесія, без другого гравця', () => {
    const ctx = setup();
    ctx.manager.sync(ROOM, PLAYERS, A, true);
    ctx.manager.select(ROOM, PLAYERS, A, true, 'byName', OTHER_HERO);
    ctx.manager.setCount(ROOM, PLAYERS, A, true, 12);
    ctx.manager.start(ROOM, PLAYERS, A, true);
    const solo = ctx.view(A);
    expect(solo.mode).toBe('solo');
    expect(solo.players).toEqual([A]);
    expect(solo.phase).toBe('playing');
    // дуель у цій кімнаті окрема й не зачеплена
    ctx.g.sync(B);
    expect(ctx.view(B).phase).toBe('lobby');
    expect(
      ctx.sent.filter((m) => m.userId === B && m.payload?.mode === 'solo'),
    ).toHaveLength(0);
  });
});
