/**
 * Лабіринт: детермінована сітка з seed, колізії зі ковзанням і поле відстаней. ЧИСТИЙ код без імпортів:
 * сервер і клієнт будують ту саму сітку (перевіряється хешем на 1000 seed) і рухають клітини тією самою функцією.
 * Копіюється на веб як `apps/web/src/components/FlockMiniGame/flockMazeGrid.ts` без змін у логіці.
 *
 * Геометрія. Стіни - смуги завтовшки `wall`; ліва/верхня межа стіни №i лежить на `o + i*cell`. Внутрішність клітини (c, r):
 * [ox + c*cell + wall, ox + (c+1)*cell] x [oy + r*cell + wall, oy + (r+1)*cell]. Весь лабіринт займає
 * cols*cell + wall по x і rows*cell + wall по y і стоїть по центру світу (`world`).
 * Тверді тіла: стовпи на кожному перетині ліній сітки, закриті відрізки стін між ними й рамка.
 */

export interface MazeParams {
  seed: number;
  cols: number;
  rows: number;
  cell: number;
  wall: number;
  /** Частка закритих внутрішніх стін, яку знімаємо для петель (0..1). */
  braid: number;
  /** Розмір світу (лабіринт по центру). */
  world: number;
  /** Скільки штук їжі (рівномірно в діапазоні [foodMin, foodMax]). */
  foodMin: number;
  foodMax: number;
  /** Кількість чекпойнтів на найкоротшому шляху. */
  checkpoints: number;
  /** Допустима довжина найкоротшого шляху в клітинах (0/0 - без обмеження): інакше лабіринт перегенеровується з солі seed. */
  pathMin: number;
  pathMax: number;
}

export const OPEN_N = 1;
export const OPEN_E = 2;
export const OPEN_S = 4;
export const OPEN_W = 8;

export interface MazeGrid {
  p: MazeParams;
  cols: number;
  rows: number;
  cell: number;
  wall: number;
  ox: number;
  oy: number;
  /** Біти OPEN_*: відкриті проходи клітини (індекс r*cols + c). */
  open: Uint8Array;
  /** Клітини стартової кімнати 2x2. */
  startRoom: number[];
  /** 6 слотів старту (центри клітин не збігаються: розкладка в кімнаті). */
  startSlots: [number, number][];
  /** Фініш («Печерний кристал»): індекс клітини і центр. */
  finish: number;
  finishX: number;
  finishY: number;
  /** Найкоротший шлях від стартової кімнати до фінішу (індекси клітин) і його довжина по центрах клітин (од.). */
  path: number[];
  pathLen: number;
  /** Чекпойнти (факели): індекси клітин у порядку проходження; кожна - вузол, повз який не обійти. */
  checkpoints: number[];
  /** Відстань до фінішу в клітинах (BFS по відкритих проходах). */
  dist: Int16Array;
  /** Їжа: детерміновані місця (id = індекс). */
  food: { x: number; y: number }[];
  /** Частка braid, яку довелось застосувати, і сіль seed (скільки перегенерацій), діагностика. */
  braidUsed: number;
  salt: number;
  hash: string;
}

/** Цілочисельний ГПСЧ (mulberry32): однаковий результат на сервері й клієнті, без Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const BIT = [OPEN_N, OPEN_E, OPEN_S, OPEN_W];
const OPP = [2, 3, 0, 1];

/** Відкриті сусіди клітини (індекси). */
export function openNeighbors(g: MazeGrid, idx: number, out: number[] = []): number[] {
  out.length = 0;
  const c = idx % g.cols;
  const r = (idx - c) / g.cols;
  const o = g.open[idx];
  for (let d = 0; d < 4; d++) if (o & BIT[d]) out.push((r + DY[d]) * g.cols + (c + DX[d]));
  return out;
}

export const cellCol = (g: MazeGrid, idx: number) => idx % g.cols;
export const cellRow = (g: MazeGrid, idx: number) => Math.floor(idx / g.cols);

/** Центр клітини (світові координати). */
export function cellCenter(g: MazeGrid, idx: number): [number, number] {
  const c = idx % g.cols;
  const r = (idx - c) / g.cols;
  return [g.ox + c * g.cell + (g.cell + g.wall) / 2, g.oy + r * g.cell + (g.cell + g.wall) / 2];
}

/** Клітина під точкою (за сіткою ліній; у товщі стіни - найближча клітина). -1 - поза лабіринтом. */
export function cellAt(g: MazeGrid, x: number, y: number): number {
  const c = Math.floor((x - g.ox - g.wall / 2) / g.cell);
  const r = Math.floor((y - g.oy - g.wall / 2) / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return -1;
  return r * g.cols + c;
}

/** Чи центр у внутрішності клітини (для чекпойнтів: будь-який маршрут крізь клітину проходить центром через її внутрішність). */
export function inCellInterior(g: MazeGrid, idx: number, x: number, y: number): boolean {
  const c = idx % g.cols;
  const r = (idx - c) / g.cols;
  const x0 = g.ox + c * g.cell + g.wall;
  const y0 = g.oy + r * g.cell + g.wall;
  return x >= x0 && x <= x0 + g.cell - g.wall && y >= y0 && y <= y0 + g.cell - g.wall;
}

function fnv(h: number, v: number): number {
  h ^= v & 0xff;
  h = Math.imul(h, 16777619);
  h ^= (v >>> 8) & 0xff;
  h = Math.imul(h, 16777619);
  return h >>> 0;
}

/** Хеш геометрії й розкладки (для звірки сервера з клієнтом бит-в-бит). */
export function mazeHash(g: MazeGrid): string {
  let h = 2166136261;
  h = fnv(h, g.cols);
  h = fnv(h, g.rows);
  for (let i = 0; i < g.open.length; i++) h = fnv(h, g.open[i]);
  h = fnv(h, g.finish);
  for (const i of g.startRoom) h = fnv(h, i);
  for (const i of g.checkpoints) h = fnv(h, i);
  for (const i of g.path) h = fnv(h, i);
  for (const f of g.food) {
    h = fnv(h, Math.round(f.x));
    h = fnv(h, Math.round(f.y));
  }
  return h.toString(16).padStart(8, '0');
}

function bfsFrom(cols: number, rows: number, open: Uint8Array, sources: number[], blocked = -1): Int16Array {
  const dist = new Int16Array(cols * rows).fill(-1);
  const q: number[] = [];
  for (const s of sources) {
    if (s === blocked) continue;
    dist[s] = 0;
    q.push(s);
  }
  for (let h = 0; h < q.length; h++) {
    const idx = q[h];
    const c = idx % cols;
    const r = (idx - c) / cols;
    const o = open[idx];
    for (let d = 0; d < 4; d++) {
      if (!(o & BIT[d])) continue;
      const n = (r + DY[d]) * cols + (c + DX[d]);
      if (n === blocked || dist[n] >= 0) continue;
      dist[n] = dist[idx] + 1;
      q.push(n);
    }
  }
  return dist;
}

function carve(p: MazeParams, seed: number, braid: number): { open: Uint8Array; room: number[] } {
  const { cols, rows } = p;
  const rng = mulberry32(seed);
  const open = new Uint8Array(cols * rows);
  const seen = new Uint8Array(cols * rows);
  // стартова кімната 2x2 в одному з кутів (за seed); усі чотири внутрішні проходи відкриті, клітини відразу «відвідані»
  const sc = rng() < 0.5 ? 0 : cols - 1;
  const sr = rng() < 0.5 ? 0 : rows - 1;
  const rc0 = sc === 0 ? 0 : cols - 2;
  const rr0 = sr === 0 ? 0 : rows - 2;
  const room = [rr0 * cols + rc0, rr0 * cols + rc0 + 1, (rr0 + 1) * cols + rc0, (rr0 + 1) * cols + rc0 + 1];
  open[room[0]] |= OPEN_E | OPEN_S;
  open[room[1]] |= OPEN_W | OPEN_S;
  open[room[2]] |= OPEN_E | OPEN_N;
  open[room[3]] |= OPEN_W | OPEN_N;
  for (const i of room) seen[i] = 1;
  // обхід у глибину від кімнати: кожна клітина кімнати може дати власну гілку, гілки між собою не зливаються
  // (дерево з коренем-кімнатою), тож кожна клітина шляху за дверима кімнати - вузол, повз який не обійти
  const stack = [...room];
  while (stack.length) {
    const idx = stack[stack.length - 1];
    const c = idx % cols;
    const r = (idx - c) / cols;
    const cand: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nc = c + DX[d];
      const nr = r + DY[d];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (!seen[nr * cols + nc]) cand.push(d);
    }
    if (!cand.length) {
      stack.pop();
      continue;
    }
    const d = cand[Math.floor(rng() * cand.length)];
    const n = (r + DY[d]) * cols + (c + DX[d]);
    open[idx] |= BIT[d];
    open[n] |= BIT[OPP[d]];
    seen[n] = 1;
    stack.push(n);
  }
  // петлі: знімаємо частку закритих внутрішніх стін (список у фіксованому порядку, вибір - частковим Фішером-Йєтсом)
  if (braid > 0) {
    const walls: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (c + 1 < cols && !(open[idx] & OPEN_E)) walls.push([idx, 1]);
        if (r + 1 < rows && !(open[idx] & OPEN_S)) walls.push([idx, 2]);
      }
    }
    const take = Math.floor(walls.length * braid);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(rng() * (walls.length - i));
      const t = walls[i];
      walls[i] = walls[j];
      walls[j] = t;
      const [idx, d] = walls[i];
      const n = idx + (d === 1 ? 1 : cols);
      open[idx] |= BIT[d];
      open[n] |= BIT[OPP[d]];
    }
  }
  return { open, room };
}

function tryBuild(p: MazeParams, seed: number, salt: number): MazeGrid | null {
  const { cols, rows } = p;
  let braid = p.braid;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { open, room } = carve(p, seed, braid);
    const dStart = bfsFrom(cols, rows, open, room);
    let finish = -1;
    let best = -1;
    for (let i = 0; i < dStart.length; i++) {
      if (dStart[i] > best) {
        best = dStart[i];
        finish = i;
      }
    }
    const dist = bfsFrom(cols, rows, open, [finish]);
    // найкоротший шлях: з кімнатної клітини з мінімальною відстанню, спуском за dist (порядок N,E,S,W)
    let from = room[0];
    for (const rIdx of room) if (dist[rIdx] < dist[from]) from = rIdx;
    const path = [from];
    while (path[path.length - 1] !== finish) {
      const cur = path[path.length - 1];
      const c = cur % cols;
      const r = (cur - c) / cols;
      let next = -1;
      for (let d = 0; d < 4; d++) {
        if (!(open[cur] & BIT[d])) continue;
        const n = (r + DY[d]) * cols + (c + DX[d]);
        if (dist[n] === dist[cur] - 1) {
          next = n;
          break;
        }
      }
      path.push(next);
    }
    if ((p.pathMin > 0 && path.length < p.pathMin) || (p.pathMax > 0 && path.length > p.pathMax)) return null;
    const cps = pickCheckpoints(p, open, room, path, finish);
    if (!cps) {
      // повз чекпойнт можна обійти (петлі): пробуємо менше петель, на останній спробі - без них
      braid = attempt === 4 ? 0 : braid / 2;
      continue;
    }
    return finishGrid(p, open, room, path, finish, dist, cps, braid, salt);
  }
  return null;
}

/**
 * Будує лабіринт із seed раунду (детерміновано). Шлях за довжиною має вкластися у [pathMin, pathMax] клітин, а чекпойнти -
 * бути вузлами, повз які не обійти; інакше береться наступна «сіль» seed (до 64 спроб), далі - перший придатний за вузлами.
 */
export function buildMaze(p: MazeParams): MazeGrid {
  for (let salt = 0; salt < 64; salt++) {
    const g = tryBuild(p, (p.seed + Math.imul(salt, 0x9e3779b1)) >>> 0, salt);
    if (g) return g;
  }
  // без вікна довжини: перший придатний за чекпойнтами (з гарантією braid = 0 на останній спробі)
  const loose: MazeParams = { ...p, pathMin: 0, pathMax: 0 };
  for (let salt = 0; salt < 64; salt++) {
    const g = tryBuild(loose, (p.seed + Math.imul(salt, 0x9e3779b1)) >>> 0, 64 + salt);
    if (g) return g;
  }
  throw new Error('maze: unreachable');
}

function pickCheckpoints(p: MazeParams, open: Uint8Array, room: number[], path: number[], finish: number): number[] | null {
  const { cols, rows } = p;
  const L = path.length;
  const roomSet = new Set(room);
  // вузол: без нього фініш недосяжний зі стартової кімнати (повз нього не обійти)
  const cut: boolean[] = new Array(L).fill(false);
  for (let i = 0; i < L; i++) {
    const idx = path[i];
    if (roomSet.has(idx) || idx === finish) continue;
    const d = bfsFrom(cols, rows, open, room, idx);
    cut[i] = d[finish] < 0;
  }
  const out: number[] = [];
  let prev = -1;
  for (let k = 1; k <= p.checkpoints; k++) {
    const target = Math.round((L * k) / (p.checkpoints + 1));
    let pick = -1;
    let bestDelta = Infinity;
    for (let i = prev + 1; i < L; i++) {
      if (!cut[i]) continue;
      const delta = Math.abs(i - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        pick = i;
      }
    }
    // допустимий розкид - до ~1/8 довжини шляху від мети (інакше пробуємо менше петель)
    if (pick < 0 || bestDelta > Math.max(2, Math.round(L / 8))) return null;
    out.push(path[pick]);
    prev = pick;
  }
  return out;
}

function finishGrid(p: MazeParams, open: Uint8Array, room: number[], path: number[], finish: number, dist: Int16Array, checkpoints: number[], braidUsed: number, salt: number): MazeGrid {
  const { cols, rows, cell, wall } = p;
  const ox = (p.world - (cols * cell + wall)) / 2;
  const oy = (p.world - (rows * cell + wall)) / 2;
  const g: MazeGrid = {
    p,
    cols,
    rows,
    cell,
    wall,
    ox,
    oy,
    open,
    startRoom: room,
    startSlots: [],
    finish,
    finishX: 0,
    finishY: 0,
    path,
    pathLen: 0,
    checkpoints,
    dist,
    food: [],
    braidUsed,
    salt,
    hash: '',
  };
  const [fx, fy] = cellCenter(g, finish);
  g.finishX = fx;
  g.finishY = fy;
  // слоти старту: кімната 2x2 займає 2*cell - wall у кожному напрямку; 3 колонки x 2 ряди
  const [r0x, r0y] = cellCenter(g, Math.min(...room));
  const half = (cell + wall) / 2;
  const left = r0x - half + wall; // внутрішній лівий край кімнати (поправка нижче через мін. клітину)
  const top = r0y - half + wall;
  const W = 2 * cell - wall;
  const slots: [number, number][] = [];
  for (const fy2 of [0.3, 0.7]) for (const fx2 of [0.2, 0.5, 0.8]) slots.push([Math.round(left + W * fx2), Math.round(top + W * fy2)]);
  g.startSlots = slots;
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = cellCenter(g, path[i - 1]);
    const [bx, by] = cellCenter(g, path[i]);
    len += Math.hypot(bx - ax, by - ay);
  }
  g.pathLen = len;
  g.food = placeFood(g, p);
  g.hash = mazeHash(g);
  return g;
}

function placeFood(g: MazeGrid, p: MazeParams): { x: number; y: number }[] {
  const rng = mulberry32((p.seed ^ 0x9e3779b9) >>> 0);
  const count = p.foodMin + Math.floor(rng() * (p.foodMax - p.foodMin + 1));
  const onPath = new Set(g.path);
  const roomSet = new Set(g.startRoom);
  const fc = g.finish % g.cols;
  const fr = Math.floor(g.finish / g.cols);
  const dead: number[] = [];
  const rest: number[] = [];
  for (let i = 0; i < g.open.length; i++) {
    if (onPath.has(i) || roomSet.has(i)) continue;
    const c = i % g.cols;
    const r = Math.floor(i / g.cols);
    // не ближче 1 клітини до фінішу (по Чебишову: 0 і 1 виключено)
    if (Math.max(Math.abs(c - fc), Math.abs(r - fr)) <= 1) continue;
    const o = g.open[i];
    const n = (o & 1) + ((o >> 1) & 1) + ((o >> 2) & 1) + ((o >> 3) & 1);
    (n === 1 ? dead : rest).push(i);
  }
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
  };
  shuffle(dead);
  shuffle(rest);
  const out: { x: number; y: number }[] = [];
  const spread = (g.cell - g.wall) * 0.3;
  const put = (idx: number) => {
    const [cx, cy] = cellCenter(g, idx);
    out.push({ x: Math.round(cx + (rng() * 2 - 1) * spread), y: Math.round(cy + (rng() * 2 - 1) * spread) });
  };
  // тупики - «ніші» з гроном по 2-3 штуки, далі решта клітин поза шляхом по одній
  for (const idx of dead) {
    if (out.length >= count) break;
    const k = Math.min(count - out.length, 2 + Math.floor(rng() * 2));
    for (let j = 0; j < k; j++) put(idx);
  }
  for (const idx of rest) {
    if (out.length >= count) break;
    put(idx);
  }
  return out;
}

// ---------------------------------------------------------------- колізії

type RectCb = (x0: number, y0: number, x1: number, y1: number) => void;

function forEachSolidNear(g: MazeGrid, x: number, y: number, r: number, cb: RectCb) {
  const { cols, rows, cell, wall, ox, oy, open } = g;
  const iMin = Math.max(0, Math.floor((x - r - ox) / cell) - 1);
  const iMax = Math.min(cols, Math.floor((x + r - ox) / cell) + 1);
  const jMin = Math.max(0, Math.floor((y - r - oy) / cell) - 1);
  const jMax = Math.min(rows, Math.floor((y + r - oy) / cell) + 1);
  for (let j = jMin; j <= jMax; j++) {
    const wy = oy + j * cell;
    for (let i = iMin; i <= iMax; i++) {
      const wx = ox + i * cell;
      // стовп на перетині
      cb(wx, wy, wx + wall, wy + wall);
      // вертикальний відрізок лінії i у ряду j (між стовпами (i, j) і (i, j + 1))
      if (j < rows) {
        const closedV = i === 0 || i === cols || !(open[j * cols + (i - 1)] & OPEN_E);
        if (closedV) cb(wx, wy + wall, wx + wall, oy + (j + 1) * cell);
      }
      // горизонтальний відрізок лінії j у колонці i
      if (i < cols) {
        const closedH = j === 0 || j === rows || !(open[(j - 1) * cols + i] & OPEN_S);
        if (closedH) cb(wx + wall, wy, ox + (i + 1) * cell, wy + wall);
      }
    }
  }
}

/** Виштовхує коло (x, y, r) з твердих тіл: до 3 проходів, повертає нову позицію. */
export function pushOut(g: MazeGrid, x: number, y: number, r: number): [number, number] {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    forEachSolidNear(g, x, y, r, (x0, y0, x1, y1) => {
      const px = x < x0 ? x0 : x > x1 ? x1 : x;
      const py = y < y0 ? y0 : y > y1 ? y1 : y;
      let dx = x - px;
      let dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const k = (r - d) / d;
        x += dx * k;
        y += dy * k;
      } else {
        // центр усередині прямокутника: виходимо найкоротшою віссю
        const l = x - x0;
        const rr = x1 - x;
        const t = y - y0;
        const b = y1 - y;
        const m = Math.min(l, rr, t, b);
        if (m === l) x = x0 - r;
        else if (m === rr) x = x1 + r;
        else if (m === t) y = y0 - r;
        else y = y1 + r;
        dx = 0;
        dy = 0;
      }
      moved = true;
    });
    if (!moved) break;
  }
  return [x, y];
}

/**
 * Єдина функція руху й ковзання для сервера та клієнта: зсув (mx, my) розбивається на кроки не довші за r/2
 * (ні ривок, ні швидка клітина не «тунелюють» крізь стіну завтовшки wall), після кожного кроку - виштовхування зі стін.
 */
export function moveInMaze(g: MazeGrid, x: number, y: number, mx: number, my: number, r: number): [number, number] {
  const len = Math.hypot(mx, my);
  const n = Math.max(1, Math.min(16, Math.ceil(len / Math.max(4, r * 0.5))));
  const sx = mx / n;
  const sy = my / n;
  for (let i = 0; i < n; i++) {
    x += sx;
    y += sy;
    [x, y] = pushOut(g, x, y, r);
  }
  return [x, y];
}
