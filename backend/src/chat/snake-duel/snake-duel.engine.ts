/**
 * Чистий (без I/O) рушій дуелі Snake: усе рішення про рух, зіткнення й їжу ухвалює сервер.
 * Матч один, безперервний: кожна штучка = +1 до рахунку й +1 до довжини, перемагає той, хто першим
 * набрав `targetScore`. Загибель не обнуляє рахунок: змійка кілька секунд «мертва» й відроджується.
 * Рівні описуються `DuelLevel` (див. snake-duel.levels.ts) — нові рівні додаються без змін тут.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Cell = { x: number; y: number };

export type DuelLevel = {
  id: number;
  board: { w: number; h: number };
  /** Мілісекунд на хід. Може залежати від номера ходу (прискорення на майбутніх рівнях). */
  tickMs: (tick: number) => number;
  /** Скільки штучок треба з'їсти, щоб виграти матч. */
  targetScore: number;
  /** Скільки змійка «мертва» до відродження. */
  respawnMs: number;
  /** Статичні перешкоди (майбутні рівні): зіткнення з ними вбиває, їжа на них не з'являється. */
  obstacles: () => Cell[];
  /** Старт двох змійок: голова першою, довжина 3. */
  spawns: () => [Spawn, Spawn];
};

export type Spawn = { head: Cell; dir: Dir };

export type SnakeState = {
  /** body[0] — голова. Тіло мертвої змійки лишається для відмальовки, але в зіткненнях не бере участі. */
  body: Cell[];
  dir: Dir;
  /** Буфер натискань, що чекають на найближчі тіки (до INPUT_BUFFER). */
  queue: Dir[];
  alive: boolean;
  /** Номер ходу, на якому мертва змійка відродиться (null — жива). */
  respawnAtTick: number | null;
};

export type DuelMatch = {
  snakes: [SnakeState, SnakeState];
  scores: [number, number];
  food: Cell;
  tick: number;
};

export type StepResult = {
  /** Індекс гравця, який першим набрав targetScore, або null. */
  winner: 0 | 1 | null;
  ate: [boolean, boolean];
  died: [boolean, boolean];
  respawned: [boolean, boolean];
  /** Їжу переставлено без нарахування (одночасний захват). */
  foodRelocated: boolean;
};

export const INPUT_BUFFER = 2;
export const SNAKE_START_LENGTH = 3;

const VECTORS: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function oppositeOf(dir: Dir): Dir {
  switch (dir) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    default:
      return 'left';
  }
}

export function isDir(value: unknown): value is Dir {
  return (
    value === 'up' || value === 'down' || value === 'left' || value === 'right'
  );
}

const key = (c: Cell) => `${c.x}:${c.y}`;

function buildSnake({ head, dir }: Spawn): SnakeState {
  return {
    body: bodyFor(head, dir),
    dir,
    queue: [],
    alive: true,
    respawnAtTick: null,
  };
}

function bodyFor(head: Cell, dir: Dir): Cell[] {
  const back = VECTORS[oppositeOf(dir)];
  const body: Cell[] = [];
  for (let i = 0; i < SNAKE_START_LENGTH; i += 1) {
    body.push({ x: head.x + back.x * i, y: head.y + back.y * i });
  }
  return body;
}

const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function inBounds(level: DuelLevel, c: Cell) {
  return c.x >= 0 && c.y >= 0 && c.x < level.board.w && c.y < level.board.h;
}

/** Найменша відстань від нової їжі до голови будь-якої живої змійки. */
export const FOOD_HEAD_CLEARANCE = 3;
/** Відродження: щонайменше стільки клітинок (Manhattan) від голови суперника… */
export const RESPAWN_HEAD_CLEARANCE = 4;
/** …і не на прямій перед нею на цю кількість ходів уперед. */
export const RESPAWN_LOOKAHEAD = 6;

/**
 * Перша їжа матчу — приблизно однакова відстань (Manhattan) до обох голів: чесний старт.
 */
export function placeFairFood(
  level: DuelLevel,
  snakes: [SnakeState, SnakeState],
  rng: () => number,
): Cell {
  const blocked = new Set<string>();
  for (const snake of snakes) for (const c of snake.body) blocked.add(key(c));
  for (const c of level.obstacles()) blocked.add(key(c));

  const [a, b] = [snakes[0].body[0], snakes[1].body[0]];
  const scored: Array<{ cell: Cell; diff: number; dist: number }> = [];
  for (let x = 0; x < level.board.w; x += 1) {
    for (let y = 0; y < level.board.h; y += 1) {
      const cell = { x, y };
      if (blocked.has(key(cell))) continue;
      const da = manhattan(a, cell);
      const db = manhattan(b, cell);
      scored.push({ cell, diff: Math.abs(da - db), dist: Math.min(da, db) });
    }
  }
  if (scored.length === 0) return { x: 0, y: 0 };

  const far = scored.filter((s) => s.dist >= 5);
  const pool = far.length > 0 ? far : scored;
  const best = Math.min(...pool.map((s) => s.diff));
  const fair = pool.filter((s) => s.diff === best);
  return fair[Math.floor(rng() * fair.length)].cell;
}

/**
 * Нова їжа після з'їденої: вільна клітинка (не на змійках, мертвих теж, і не на перешкодах),
 * не впритул до голови живої змійки. Якщо таких немає — будь-яка вільна.
 */
export function placeFood(
  level: DuelLevel,
  match: Pick<DuelMatch, 'snakes' | 'food'>,
  rng: () => number,
  avoidCurrent = false,
): Cell {
  const blocked = new Set<string>();
  for (const snake of match.snakes) for (const c of snake.body) blocked.add(key(c));
  for (const c of level.obstacles()) blocked.add(key(c));
  if (avoidCurrent) blocked.add(key(match.food));

  const heads = match.snakes.filter((s) => s.alive).map((s) => s.body[0]);
  const free: Cell[] = [];
  const spaced: Cell[] = [];
  for (let x = 0; x < level.board.w; x += 1) {
    for (let y = 0; y < level.board.h; y += 1) {
      const cell = { x, y };
      if (blocked.has(key(cell))) continue;
      free.push(cell);
      if (heads.every((h) => manhattan(h, cell) >= FOOD_HEAD_CLEARANCE)) spaced.push(cell);
    }
  }
  const pool = spaced.length > 0 ? spaced : free;
  if (pool.length === 0) return { ...match.food };
  return pool[Math.floor(rng() * pool.length)];
}

export function createMatch(level: DuelLevel, rng: () => number): DuelMatch {
  const [s0, s1] = level.spawns();
  const snakes: [SnakeState, SnakeState] = [buildSnake(s0), buildSnake(s1)];
  return {
    snakes,
    scores: [0, 0],
    food: placeFairFood(level, snakes, rng),
    tick: 0,
  };
}

/**
 * Ставить натискання в буфер. Розворот на 180° (відносно останнього напрямку в буфері) і повтор
 * поточного напрямку ігноруються. Мертва змійка керування не приймає.
 */
export function queueDirection(
  match: DuelMatch,
  index: 0 | 1,
  dir: Dir,
): boolean {
  const snake = match.snakes[index];
  if (!snake.alive) return false;
  const reference = snake.queue.length
    ? snake.queue[snake.queue.length - 1]
    : snake.dir;
  if (dir === reference || dir === oppositeOf(reference)) return false;
  if (snake.queue.length >= INPUT_BUFFER) return false;
  snake.queue.push(dir);
  return true;
}

/**
 * Безпечне місце відродження: усі 3 клітинки тіла й кілька клітинок попереду вільні, голова не ближче
 * RESPAWN_HEAD_CLEARANCE до голови живого суперника й не на прямій перед нею (RESPAWN_LOOKAHEAD ходів).
 * Якщо ідеального місця немає — послаблюємо вимоги, а в крайньому разі беремо стартову позицію рівня.
 */
export function pickRespawn(
  level: DuelLevel,
  match: DuelMatch,
  index: 0 | 1,
  rng: () => number,
): Spawn {
  const other = match.snakes[1 - index];
  const rivalHead = other.alive ? other.body[0] : null;

  const blocked = new Set<string>();
  // Своє старе тіло вже не заважає: воно замінюється новим.
  for (const c of other.body) blocked.add(key(c));
  for (const c of level.obstacles()) blocked.add(key(c));
  blocked.add(key(match.food));

  // Клітинки на прямій перед головою суперника, куди він доїде за RESPAWN_LOOKAHEAD ходів.
  const danger = new Set<string>();
  if (rivalHead) {
    const v = VECTORS[other.dir];
    for (let i = 1; i <= RESPAWN_LOOKAHEAD; i += 1) {
      danger.add(key({ x: rivalHead.x + v.x * i, y: rivalHead.y + v.y * i }));
    }
  }

  const dirs: Dir[] = ['up', 'down', 'left', 'right'];
  const candidates: Array<{ spawn: Spawn; far: number; onLine: boolean }> = [];
  for (let x = 0; x < level.board.w; x += 1) {
    for (let y = 0; y < level.board.h; y += 1) {
      for (const dir of dirs) {
        const head = { x, y };
        const cells = bodyFor(head, dir);
        const v = VECTORS[dir];
        const ahead = [1, 2, 3].map((i) => ({ x: x + v.x * i, y: y + v.y * i }));
        const all = [...cells, ...ahead];
        if (!all.every((c) => inBounds(level, c) && !blocked.has(key(c)))) continue;
        const far = rivalHead
          ? Math.min(...cells.map((c) => manhattan(c, rivalHead)))
          : 99;
        const onLine = cells.some((c) => danger.has(key(c)));
        candidates.push({ spawn: { head, dir }, far, onLine });
      }
    }
  }

  const strict = candidates.filter((c) => c.far >= RESPAWN_HEAD_CLEARANCE && !c.onLine);
  // Серед підходящих віддаємо перевагу тим, що подалі від суперника.
  let pool = strict;
  if (pool.length === 0) pool = candidates.filter((c) => c.far >= 2 && !c.onLine);
  if (pool.length === 0) pool = candidates;
  if (pool.length === 0) return level.spawns()[index];
  const best = Math.max(...pool.map((c) => Math.min(c.far, 8)));
  const preferred = pool.filter((c) => Math.min(c.far, 8) >= Math.min(best, RESPAWN_HEAD_CLEARANCE + 2));
  const choices = preferred.length > 0 ? preferred : pool;
  return choices[Math.floor(rng() * choices.length)].spawn;
}

/**
 * Один хід обох змійок одночасно.
 * Порядок: відродження → напрямок з буфера → нові голови → їжа → смерті. Смерть має пріоритет над їжею:
 * хто з'їв, але загинув на цьому ж ході, нічого не отримує. Одночасно на одну штучку — ніхто.
 * Мертві змійки не рухаються і в зіткненнях (як перешкода й як ціль) не беруть участі.
 */
export function stepMatch(
  match: DuelMatch,
  level: DuelLevel,
  rng: () => number,
): StepResult {
  match.tick += 1;
  const { snakes } = match;
  const respawned: [boolean, boolean] = [false, false];

  // Відродження: нова змійка стоїть цей хід і починає рух наступного.
  for (const i of [0, 1] as const) {
    const snake = snakes[i];
    if (!snake.alive && snake.respawnAtTick !== null && match.tick >= snake.respawnAtTick) {
      const spawn = pickRespawn(level, match, i, rng);
      snakes[i] = buildSnake(spawn);
      respawned[i] = true;
    }
  }

  const obstacles = new Set(level.obstacles().map(key));
  const moving = snakes.map((snake, i) => snake.alive && !respawned[i]);

  const newHeads: Array<Cell | null> = snakes.map((snake, i) => {
    if (!moving[i]) return null;
    const next = snake.queue.shift();
    if (next && next !== oppositeOf(snake.dir)) snake.dir = next;
    const v = VECTORS[snake.dir];
    return { x: snake.body[0].x + v.x, y: snake.body[0].y + v.y };
  });

  const reached = [0, 1].map((i) => {
    const h = newHeads[i];
    return h !== null && h.x === match.food.x && h.y === match.food.y;
  });
  const contested = reached[0] && reached[1];
  const ate: [boolean, boolean] = [reached[0] && !contested, reached[1] && !contested];

  // Тіла ПІСЛЯ ходу: хвіст звільняється, якщо змійка не росте. Нерухомі (мертві/щойно відроджені) — як є.
  const postBodies: Array<Cell[] | null> = snakes.map((snake, i) => {
    const head = newHeads[i];
    if (!moving[i] || !head) return snake.alive ? snake.body : null;
    const grown = [head, ...snake.body];
    if (!ate[i]) grown.pop();
    return grown;
  });

  const died: [boolean, boolean] = [false, false];
  for (const i of [0, 1] as const) {
    const head = newHeads[i];
    if (!moving[i] || !head) continue;
    const other = 1 - i;
    const outOfBounds = !inBounds(level, head);
    const ownTail = postBodies[i]!.slice(1).some((c) => c.x === head.x && c.y === head.y);
    // Тіло живого суперника після ходу включно з його новою головою: ловить і лобове, і «обмін місцями».
    const hitOther = (postBodies[other] ?? []).some((c) => c.x === head.x && c.y === head.y);
    died[i] = outOfBounds || ownTail || hitOther || obstacles.has(key(head));
  }

  let winner: 0 | 1 | null = null;
  for (const i of [0, 1] as const) {
    if (!moving[i]) continue;
    if (died[i]) {
      ate[i] = false;
      snakes[i].alive = false;
      snakes[i].queue = [];
      snakes[i].respawnAtTick = match.tick + Math.max(1, Math.ceil(level.respawnMs / level.tickMs(match.tick)));
      continue;
    }
    snakes[i].body = postBodies[i]!;
    if (ate[i] && !died[i]) {
      match.scores[i] += 1;
      if (winner === null && match.scores[i] >= level.targetScore) winner = i;
    } else {
      ate[i] = false;
    }
  }

  const anyAte = ate[0] || ate[1];
  const foodRelocated = contested;
  if (anyAte) match.food = placeFood(level, match, rng);
  else if (contested) match.food = placeFood(level, match, rng, true);

  return { winner, ate, died, respawned, foodRelocated };
}
