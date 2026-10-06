/**
 * Чистий (без I/O) рушій дуелі Snake: усе рішення про рух, зіткнення й їжу ухвалює сервер.
 * Рівні описуються `DuelLevel` (див. snake-duel.levels.ts) — нові рівні додаються без змін тут.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Cell = { x: number; y: number };

export type DuelLevel = {
  id: number;
  board: { w: number; h: number };
  /** Мілісекунд на хід. Може залежати від номера ходу (прискорення на майбутніх рівнях). */
  tickMs: (tick: number) => number;
  winsToTake: number;
  /** Статичні перешкоди (майбутні рівні): зіткнення з ними вбиває, їжа на них не з'являється. */
  obstacles: () => Cell[];
  /** Старт двох змійок: голова першою, довжина 3. */
  spawns: () => [Spawn, Spawn];
};

export type Spawn = { head: Cell; dir: Dir };

export type SnakeState = {
  /** body[0] — голова. */
  body: Cell[];
  dir: Dir;
  /** Буфер натискань, що чекають на найближчі тіки (до INPUT_BUFFER). */
  queue: Dir[];
  alive: boolean;
};

export type DuelRound = {
  snakes: [SnakeState, SnakeState];
  food: Cell;
  tick: number;
};

export type StepOutcome = 'continue' | 'win0' | 'win1' | 'draw';

export type StepResult = {
  outcome: StepOutcome;
  ate: [boolean, boolean];
  died: [boolean, boolean];
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
  const back = VECTORS[oppositeOf(dir)];
  const body: Cell[] = [];
  for (let i = 0; i < SNAKE_START_LENGTH; i += 1) {
    body.push({ x: head.x + back.x * i, y: head.y + back.y * i });
  }
  return { body, dir, queue: [], alive: true };
}

/**
 * Їжа з приблизно однаковою відстанню (Manhattan) до обох голів: чесний старт для обох гравців.
 * Якщо точної рівності немає — клітинки з найменшою різницею.
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
      const da = Math.abs(a.x - x) + Math.abs(a.y - y);
      const db = Math.abs(b.x - x) + Math.abs(b.y - y);
      scored.push({ cell, diff: Math.abs(da - db), dist: Math.min(da, db) });
    }
  }
  if (scored.length === 0) return { x: 0, y: 0 };

  // Не біля голови (щоб не було «подарунка») — якщо клітинок вистачає.
  const far = scored.filter((s) => s.dist >= 5);
  const pool = far.length > 0 ? far : scored;
  const best = Math.min(...pool.map((s) => s.diff));
  const fair = pool.filter((s) => s.diff === best);
  return fair[Math.floor(rng() * fair.length)].cell;
}

export function createRound(level: DuelLevel, rng: () => number): DuelRound {
  const [s0, s1] = level.spawns();
  const snakes: [SnakeState, SnakeState] = [buildSnake(s0), buildSnake(s1)];
  return { snakes, food: placeFairFood(level, snakes, rng), tick: 0 };
}

/**
 * Ставить натискання в буфер. Розворот на 180° (відносно останнього напрямку в буфері) і повтор
 * поточного напрямку ігноруються.
 */
export function queueDirection(
  round: DuelRound,
  index: 0 | 1,
  dir: Dir,
): boolean {
  const snake = round.snakes[index];
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
 * Один хід обох змійок одночасно.
 * Порядок: напрямок з буфера → нові голови → смерті → їжа. Смерть має пріоритет над їжею:
 * хто з'їв, але загинув на цьому ж ході, не виграє.
 */
export function stepRound(round: DuelRound, level: DuelLevel): StepResult {
  round.tick += 1;
  const { snakes } = round;
  const obstacles = new Set(level.obstacles().map(key));

  const newHeads: Cell[] = snakes.map((snake) => {
    const next = snake.queue.shift();
    if (next && next !== oppositeOf(snake.dir)) snake.dir = next;
    const v = VECTORS[snake.dir];
    return { x: snake.body[0].x + v.x, y: snake.body[0].y + v.y };
  });

  const ate: [boolean, boolean] = [
    newHeads[0].x === round.food.x && newHeads[0].y === round.food.y,
    newHeads[1].x === round.food.x && newHeads[1].y === round.food.y,
  ];

  // Тіла ПІСЛЯ ходу: хвіст звільняється, якщо змійка не росте.
  const postBodies: Cell[][] = snakes.map((snake, i) => {
    const grown = [newHeads[i], ...snake.body];
    if (!ate[i]) grown.pop();
    return grown;
  });

  const died: [boolean, boolean] = [false, false];
  for (let i = 0; i < 2; i += 1) {
    const head = newHeads[i];
    const other = 1 - i;
    const outOfBounds =
      head.x < 0 ||
      head.y < 0 ||
      head.x >= level.board.w ||
      head.y >= level.board.h;
    // Власне тіло після ходу без голови (сама голова — це newHeads[i]).
    const ownTail = postBodies[i].slice(1).some((c) => c.x === head.x && c.y === head.y);
    // Тіло суперника після ходу включно з його новою головою: це ловить і лобове зіткнення,
    // і «обмін місцями» (голова А входить у клітинку, де щойно стояла голова Б — вона в його тілі).
    const hitOther = postBodies[other].some(
      (c) => c.x === head.x && c.y === head.y,
    );
    died[i] =
      outOfBounds || ownTail || hitOther || obstacles.has(key(head));
  }

  // Рухаються лише живі; загиблі лишаються на місці (для відмальовки).
  for (let i = 0; i < 2; i += 1) {
    if (!died[i]) snakes[i].body = postBodies[i];
    else snakes[i].alive = false;
  }

  let outcome: StepOutcome = 'continue';
  if (died[0] && died[1]) outcome = 'draw';
  else if (died[0]) outcome = 'win1';
  else if (died[1]) outcome = 'win0';
  else if (ate[0] && ate[1]) outcome = 'draw';
  else if (ate[0]) outcome = 'win0';
  else if (ate[1]) outcome = 'win1';

  return { outcome, ate, died };
}
