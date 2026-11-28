/**
 * Режим «Лабіринт»: детермінована сітка з seed раунду, шлях, чекпоінти, їжа в тупиках і ЄДИНА функція зіткнень зі стінами.
 * Усе чисте й без залежностей: сервер має «близнюка» цього файла (той самий алгоритм), клієнт будує ту саму сітку з welcome
 * (seed, cols, rows, cell, wall, braid), позицій стін по тікам не передаємо. Паритет перевіряється хешем `mazeHash`.
 *
 * ТОЧНИЙ АЛГОРИТМ (будь-яка зміна ламає паритет із сервером; близнюк мусить повторювати його буквально):
 *
 * 1. ГПСЧ mulberry32 (цілі числа, без Math.random):
 *      a = seed >>> 0
 *      next(): a = (a + 0x6D2B79F5) >>> 0; t = a; t = imul(t ^ (t >>> 15), t | 1);
 *              t ^= t + imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296
 *      int(n) = floor(next() * n)
 *    Для сітки (кроки 3-4) - один потік зі seed; для їжі (крок 7) - окремий потік зі (seed ^ 0x9E3779B9) >>> 0.
 * 2. Клітина = індекс i = y * cols + x. Стіни - бітова маска на клітину: N=1, E=2, S=4, W=8 (біт = стіна є).
 *    Спершу всі стіни стоять (15). Відкриття стіни між сусідами знімає відповідні біти в обох клітинах.
 * 3. Стартова кімната: клітини (0,0),(1,0),(0,1),(1,1) (2x2 у лівому верхньому куті). Внутрішні стіни кімнати знімаються,
 *    усі чотири клітини позначені відвіданими.
 * 4. Обхід у глибину (ітеративний стек), старт зі стеку [(1,1)]: на кожному кроці дивимось верх стеку; сусіди збираються
 *    у фіксованому порядку N,E,S,W (лише в межах сітки й не відвідані); немає сусідів - pop; інакше обираємо
 *    nb[int(nb.length)], знімаємо стіну між ними, позначаємо відвіданим, кладемо в стек.
 * 5. Петлі (braid): список усіх внутрішніх стін, що ще стоять, у порядку індексу клітини, потім E, потім S (кожна стіна
 *    один раз). k = floor(braid * довжина_списку). Частковий Фішер-Єйтс: для t = 0..k-1: j = t + int(len - t);
 *    swap(list[t], list[j]); відкриваємо list[t].
 * 6. Фініш: BFS мультиджерело від чотирьох клітин кімнати (відстань 0); фініш = клітина з максимальною відстанню,
 *    при рівності - з найменшим індексом. Шлях: від фінішу назад по батьках BFS до клітини кімнати, потім розвертаємо
 *    (path[0] - клітина кімнати, path[last] - фініш). Чекпоінти - клітини path[floor(L*1/4)], path[floor(L*2/4)],
 *    path[floor(L*3/4)], де L = path.length - 1.
 * 7. Їжа: кандидати - клітини не з кімнати, не на шляху, не ближче ніж 1 клітина (Чебишов) до фінішу. Групи:
 *    A - глухі кути (рівно 3 стіни), B - клітини з 2 стінами (ніші); у кожній групі порядок за індексом, потім частковий
 *    Фішер-Єйтс на потоці їжі. Беремо спершу A, потім B, до foodCount штук. Позиція = центр клітини + зсув
 *    ((next() - 0.5) * cell * 0.3) по x, потім по y (два виклики next() на штуку, у порядку взяття).
 *
 * Геометрія світу: сітка по центру світу, origin = (world - cols * cell) / 2 по обох осях. Клітина (x,y) займає
 * [ox + x*cell, ox + (x+1)*cell]; стіна - смуга товщини `wall`, центрована на межі клітин (зовнішній периметр теж).
 */

export const MAZE_DIRS = { N: 1, E: 2, S: 4, W: 8 } as const;

/** Параметри режиму з welcome (fork A опублікує ті самі поля в docs/flock-maze.md; назви легко підігнати тут). */
export interface MazeCfg {
  seed: number;
  cols: number;
  rows: number;
  /** Розмір клітини (одиниць світу) і товщина стіни. */
  cell: number;
  wall: number;
  /** Частка стін, що знімається для петель (0..1). */
  braid: number;
  /** Розмір світу (3400), щоб центрувати сітку. */
  world: number;
  /** Скільки їжі в тупиках. */
  foodCount: number;
  startMass: number;
  maxMass: number;
  foodMass: number;
  /** Скільки мс клітина «розчиняється» і скільки мс захисту після відродження. */
  dissolveMs: number;
  protectMs: number;
  /** Через скільки мс від початку раунду показувати стрілку до фінішу (0 - вимкнена). */
  hintArrowAfterMs: number;
  /** Ривок: множник швидкості, тривалість і перезарядка (мс). */
  dashMul: number;
  dashMs: number;
  dashCdMs: number;
}

/** Єдине місце з типовими значеннями (для підписів у «Режимах», «i» і HUD, поки не прийшов welcome). Фінальні числа - з конфіга сервера. */
export const MAZE_DEFAULTS: MazeCfg = {
  seed: 1,
  cols: 11,
  rows: 11,
  cell: 260,
  wall: 40,
  braid: 0.12,
  world: 3400,
  foodCount: 40,
  startMass: 20,
  maxMass: 36,
  foodMass: 1.5,
  dissolveMs: 500,
  protectMs: 3000,
  hintArrowAfterMs: 0,
  dashMul: 1.6,
  dashMs: 400,
  dashCdMs: 3000,
};

/** Скільки гравців у гонці і межі раунду (для підписів). */
export const MAZE_UI = { maxPlayers: 6, roundMaxSec: 180, rewardRubies: 5, winsPerDay: 3 } as const;

export interface MazeGrid {
  cols: number;
  rows: number;
  cell: number;
  wall: number;
  /** Верхній лівий кут сітки у світі. */
  ox: number;
  oy: number;
  /** Маска стін на клітину. */
  walls: Uint8Array;
  /** Індекси клітин кімнати старту (2x2). */
  room: number[];
  finish: number;
  /** Шлях від кімнати до фінішу (індекси клітин). */
  path: number[];
  /** Індекси клітин чекпоінтів (3). */
  checkpoints: number[];
  /** Позиції їжі (світові координати). */
  food: { x: number; y: number }[];
  /** Глухі кути (для декору: гриби). */
  deadEnds: number[];
}

// ---------------------------------------------------------------- ГПСЧ
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n) };
}

const DX = [0, 1, 0, -1]; // N,E,S,W
const DY = [-1, 0, 1, 0];
const BIT = [1, 2, 4, 8];
const OPP = [2, 3, 0, 1]; // індекс протилежного напрямку

function open(walls: Uint8Array, cols: number, i: number, d: number) {
  const x = i % cols;
  const y = (i - x) / cols;
  const j = (y + DY[d]) * cols + (x + DX[d]);
  walls[i] &= ~BIT[d];
  walls[j] &= ~BIT[OPP[d]];
}

function wallCount(m: number) {
  return (m & 1 ? 1 : 0) + (m & 2 ? 1 : 0) + (m & 4 ? 1 : 0) + (m & 8 ? 1 : 0);
}

// ---------------------------------------------------------------- побудова
export function buildMaze(cfg: Pick<MazeCfg, "seed" | "cols" | "rows" | "cell" | "wall" | "braid" | "world" | "foodCount">): MazeGrid {
  const { cols, rows, cell, wall } = cfg;
  const n = cols * rows;
  const walls = new Uint8Array(n).fill(15);
  const rnd = mulberry32(cfg.seed);
  const visited = new Uint8Array(n);

  // 3. стартова кімната 2x2
  const room = [0, 1, cols, cols + 1];
  for (const i of room) visited[i] = 1;
  open(walls, cols, 0, 1); // (0,0)-(1,0)
  open(walls, cols, 0, 2); // (0,0)-(0,1)
  open(walls, cols, 1, 2); // (1,0)-(1,1)
  open(walls, cols, cols, 1); // (0,1)-(1,1)

  // 4. обхід у глибину від (1,1)
  const stack: number[] = [cols + 1];
  const nb: number[] = [];
  while (stack.length) {
    const i = stack[stack.length - 1];
    const x = i % cols;
    const y = (i - x) / cols;
    nb.length = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (visited[ny * cols + nx]) continue;
      nb.push(d);
    }
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const d = nb[rnd.int(nb.length)];
    open(walls, cols, i, d);
    const j = (y + DY[d]) * cols + (x + DX[d]);
    visited[j] = 1;
    stack.push(j);
  }

  // 5. петлі: знімаємо floor(braid * N) стін, що лишилися
  const list: number[] = []; // кодуємо як i * 2 + (0 - E, 1 - S)
  for (let i = 0; i < n; i++) {
    const x = i % cols;
    const y = (i - x) / cols;
    if (x < cols - 1 && walls[i] & 2) list.push(i * 2);
    if (y < rows - 1 && walls[i] & 4) list.push(i * 2 + 1);
  }
  const k = Math.floor(cfg.braid * list.length);
  for (let t = 0; t < k; t++) {
    const j = t + rnd.int(list.length - t);
    const tmp = list[t];
    list[t] = list[j];
    list[j] = tmp;
    const code = list[t];
    open(walls, cols, code >> 1, code & 1 ? 2 : 1);
  }

  // 6. фініш і шлях: BFS мультиджерело від кімнати
  const dist = new Int32Array(n).fill(-1);
  const par = new Int32Array(n).fill(-1);
  const queue: number[] = [];
  for (const i of room) {
    dist[i] = 0;
    queue.push(i);
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    const x = i % cols;
    const y = (i - x) / cols;
    for (let d = 0; d < 4; d++) {
      if (walls[i] & BIT[d]) continue;
      const j = (y + DY[d]) * cols + (x + DX[d]);
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      par[j] = i;
      queue.push(j);
    }
  }
  let finish = 0;
  for (let i = 0; i < n; i++) if (dist[i] > dist[finish]) finish = i;
  const path: number[] = [];
  for (let i = finish; i >= 0; i = par[i]) path.push(i);
  path.reverse();
  const L = path.length - 1;
  const checkpoints = [path[Math.floor((L * 1) / 4)], path[Math.floor((L * 2) / 4)], path[Math.floor((L * 3) / 4)]];

  // 7. їжа в тупиках і нішах
  const ox = (cfg.world - cols * cell) / 2;
  const oy = (cfg.world - rows * cell) / 2;
  const onPath = new Uint8Array(n);
  for (const i of path) onPath[i] = 1;
  const inRoom = new Uint8Array(n);
  for (const i of room) inRoom[i] = 1;
  const fx = finish % cols;
  const fy = (finish - fx) / cols;
  const groupA: number[] = [];
  const groupB: number[] = [];
  const deadEnds: number[] = [];
  for (let i = 0; i < n; i++) {
    const wc = wallCount(walls[i]);
    if (wc === 3 && !inRoom[i]) deadEnds.push(i);
    if (inRoom[i] || onPath[i]) continue;
    const x = i % cols;
    const y = (i - x) / cols;
    if (Math.abs(x - fx) <= 1 && Math.abs(y - fy) <= 1) continue;
    if (wc === 3) groupA.push(i);
    else if (wc === 2) groupB.push(i);
  }
  const frnd = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0);
  const shuffle = (a: number[]) => {
    for (let t = 0; t < a.length - 1; t++) {
      const j = t + frnd.int(a.length - t);
      const tmp = a[t];
      a[t] = a[j];
      a[j] = tmp;
    }
  };
  shuffle(groupA);
  shuffle(groupB);
  const picked = [...groupA, ...groupB].slice(0, cfg.foodCount);
  const food: { x: number; y: number }[] = [];
  for (const i of picked) {
    const x = i % cols;
    const y = (i - x) / cols;
    const jx = (frnd.next() - 0.5) * cell * 0.3;
    const jy = (frnd.next() - 0.5) * cell * 0.3;
    food.push({ x: ox + (x + 0.5) * cell + jx, y: oy + (y + 0.5) * cell + jy });
  }

  return { cols, rows, cell, wall, ox, oy, walls, room, finish, path, checkpoints, food, deadEnds };
}

// ---------------------------------------------------------------- хеші паритету
function fnv(bytes: ArrayLike<number>, h = 0x811c9dc5) {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] & 255;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
const hex = (h: number) => h.toString(16).padStart(8, "0");

/** Хеш стін, фінішу й чекпоінтів: FNV-1a 32 по байтах стін, потім finish і три чекпоінти (u32 LE). */
export function mazeHash(g: MazeGrid): string {
  let h = fnv(g.walls);
  h = fnv(u32(g.finish), h);
  for (const c of g.checkpoints) h = fnv(u32(c), h);
  return hex(h);
}

/** Хеш їжі: FNV-1a 32 по координатах, округлених до 0.01 (i32 LE: x*100, y*100). */
export function mazeFoodHash(g: MazeGrid): string {
  let h = 0x811c9dc5;
  for (const f of g.food) {
    h = fnv(u32(Math.round(f.x * 100) | 0), h);
    h = fnv(u32(Math.round(f.y * 100) | 0), h);
  }
  return hex(h);
}

// ---------------------------------------------------------------- геометрія й допоміжні
export const mazeCellCenter = (g: MazeGrid, i: number) => ({ x: g.ox + ((i % g.cols) + 0.5) * g.cell, y: g.oy + (Math.floor(i / g.cols) + 0.5) * g.cell });

/** Клітина під точкою (-1 поза сіткою). */
export function mazeCellAt(g: MazeGrid, x: number, y: number): number {
  const cx = Math.floor((x - g.ox) / g.cell);
  const cy = Math.floor((y - g.oy) / g.cell);
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return -1;
  return cy * g.cols + cx;
}

/** Довжина шляху в одиницях світу (по центрах клітин) і мінімально можливий час (мс) при швидкості `speed` од./с. */
export function mazePathUnits(g: MazeGrid): number {
  return (g.path.length - 1) * g.cell;
}
export function mazeMinTimeMs(g: MazeGrid, speed: number): number {
  return (mazePathUnits(g) / Math.max(1, speed)) * 1000;
}

/** Кінець шляху до фінішу від клітини (BFS-відстань у клітинах); -1 якщо недосяжна. */
export function mazeDistField(g: MazeGrid, from: number): Int32Array {
  const dist = new Int32Array(g.cols * g.rows).fill(-1);
  const q = [from];
  dist[from] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    for (let d = 0; d < 4; d++) {
      if (g.walls[i] & BIT[d]) continue;
      const j = (y + DY[d]) * g.cols + (x + DX[d]);
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

// ---------------------------------------------------------------- зіткнення
/**
 * ЄДИНА функція руху зі стінами для клієнта й сервера: коло (x,y,r) зсувається на (dx,dy), осі по черзі, кожна з виштовхуванням
 * із прямокутників стін, що поряд (стіна = смуга `wall` по межі клітин, з перекриттям у кутах). Якщо клітину вже вдавило в стіну
 * (наприклад, після рівняння з сервером), вона мʼяко виштовхується (до `r` за виклик). Повертає нову позицію й чи був удар.
 */
export function mazeMove(g: MazeGrid, x: number, y: number, r: number, dx: number, dy: number): { x: number; y: number; hit: boolean } {
  let hit = false;
  const resolve = (px: number, py: number) => {
    const cx0 = Math.max(0, Math.floor((px - r - g.ox) / g.cell) - 1);
    const cx1 = Math.min(g.cols - 1, Math.floor((px + r - g.ox) / g.cell) + 1);
    const cy0 = Math.max(0, Math.floor((py - r - g.oy) / g.cell) - 1);
    const cy1 = Math.min(g.rows - 1, Math.floor((py + r - g.oy) / g.cell) + 1);
    const hw = g.wall / 2;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const m = g.walls[cy * g.cols + cx];
          if (!m) continue;
          const left = g.ox + cx * g.cell;
          const top = g.oy + cy * g.cell;
          for (let d = 0; d < 4; d++) {
            if (!(m & BIT[d])) continue;
            // прямокутник стіни d цієї клітини
            let rx0: number;
            let ry0: number;
            let rx1: number;
            let ry1: number;
            if (d === 0) {
              rx0 = left - hw;
              rx1 = left + g.cell + hw;
              ry0 = top - hw;
              ry1 = top + hw;
            } else if (d === 2) {
              rx0 = left - hw;
              rx1 = left + g.cell + hw;
              ry0 = top + g.cell - hw;
              ry1 = top + g.cell + hw;
            } else if (d === 3) {
              rx0 = left - hw;
              rx1 = left + hw;
              ry0 = top - hw;
              ry1 = top + g.cell + hw;
            } else {
              rx0 = left + g.cell - hw;
              rx1 = left + g.cell + hw;
              ry0 = top - hw;
              ry1 = top + g.cell + hw;
            }
            const qx = px < rx0 ? rx0 : px > rx1 ? rx1 : px;
            const qy = py < ry0 ? ry0 : py > ry1 ? ry1 : py;
            const ddx = px - qx;
            const ddy = py - qy;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= r * r) continue;
            if (d2 > 1e-9) {
              const dist = Math.sqrt(d2);
              const push = r - dist;
              px += (ddx / dist) * push;
              py += (ddy / dist) * push;
            } else {
              // центр усередині стіни: виштовхуємо по найкоротшій осі
              const l = px - rx0;
              const rr = rx1 - px;
              const t = py - ry0;
              const b = ry1 - py;
              const mn = Math.min(l, rr, t, b);
              if (mn === l) px = rx0 - r;
              else if (mn === rr) px = rx1 + r;
              else if (mn === t) py = ry0 - r;
              else py = ry1 + r;
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return { px, py };
  };
  let nx = x + dx;
  let r1 = resolve(nx, y);
  if (r1.px !== nx || r1.py !== y) hit = true;
  nx = r1.px;
  let ny = r1.py;
  r1 = resolve(nx, ny + dy);
  if (r1.px !== nx || r1.py !== ny + dy) hit = true;
  nx = r1.px;
  ny = r1.py;
  return { x: nx, y: ny, hit };
}

// ---------------------------------------------------------------- стан для відмальовки (адаптер: наповнює склейка з сервером)
/** Те, що рендеру потрібно знати про поточний раунд лабіринту; наповнюється з welcome та пакетів (склейка). */
export interface MazeView {
  cfg: MazeCfg;
  grid: MazeGrid;
  /** Відвідані клітини своєї клітини (для мінікарти з туманом). */
  visited: Uint8Array;
  /** Які з трьох чекпоінтів уже пройдені (запалені факели). */
  lit: [boolean, boolean, boolean];
  /** Клітини, що розчиняються: pid -> performance.now початку анімації; захищені pid до performance.now. */
  dissolving: Map<number, number>;
  protectedUntil: Map<number, number>;
  /** Мс від початку раунду, коли можна показувати стрілку до фінішу (0 - вимкнено). */
  hintArrowAfterMs: number;
  /** Мс від початку раунду (для підказки-стрілки). */
  roundMs: number;
}

export function createMazeView(cfg: MazeCfg): MazeView {
  const grid = buildMaze(cfg);
  return {
    cfg,
    grid,
    visited: new Uint8Array(grid.cols * grid.rows),
    lit: [false, false, false],
    dissolving: new Map(),
    protectedUntil: new Map(),
    hintArrowAfterMs: cfg.hintArrowAfterMs,
    roundMs: 0,
  };
}

/** Відмічає клітину під позицією (та сусідні відкриті) відвіданими: мінікарта показує лише їх. */
export function markVisited(v: MazeView, x: number, y: number) {
  const i = mazeCellAt(v.grid, x, y);
  if (i >= 0) v.visited[i] = 1;
}

/** Частка прозорості клітини, що розчиняється (1 -> 0 за dissolveMs). */
export function dissolveAlpha(ageMs: number, dissolveMs: number): number {
  return Math.max(0, 1 - ageMs / Math.max(1, dissolveMs));
}
