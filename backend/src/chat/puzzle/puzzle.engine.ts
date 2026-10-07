/**
 * Чиста геометрія й правила «Пазлів» (без стану сесії): сітка, розкид кусочків, прилипання.
 * Форма кусочків (виступи/впадини) — лише візуальна й будується на клієнті з `seed`; сервер знає тільки сітку.
 *
 * Координати — «одиниці поля». Група має початок (x, y): кусочок (col, row) групи лежить у
 * (x + col·cw, y + row·ch), тож група стоїть на своєму місці, коли x = y = 0.
 */
export const PIECE_COUNTS = [12, 24, 48, 96] as const;
export type PieceCount = (typeof PIECE_COUNTS)[number];

/** Довша сторона картини в одиницях поля. */
export const BOARD_LONG_SIDE = 1200;
/** Скільки вільного місця навколо картини, куди розсипаються кусочки (частка довшої сторони). */
export const WORLD_MARGIN = Math.round(BOARD_LONG_SIDE * 0.5);
/** Допуск прилипання — частка меншої сторони кусочка. */
export const SNAP_FRACTION = 0.28;

export type Layout = {
  count: PieceCount;
  cols: number;
  rows: number;
  boardW: number;
  boardH: number;
  /** Розмір комірки кусочка. */
  cw: number;
  ch: number;
  /** Допуск прилипання в одиницях поля. */
  snap: number;
  world: { minX: number; minY: number; maxX: number; maxY: number };
};

export function isPieceCount(value: unknown): value is PieceCount {
  return (
    typeof value === 'number' &&
    (PIECE_COUNTS as readonly number[]).includes(value)
  );
}

/** Сітка cols×rows з добутком `count`, найближча до квадратних кусочків для пропорцій картини. */
export function gridFor(
  count: number,
  aspect: number,
): { cols: number; rows: number } {
  let best = { cols: count, rows: 1 };
  let bestScore = Infinity;
  for (let cols = 2; cols <= count / 2; cols += 1) {
    if (count % cols !== 0) continue;
    const rows = count / cols;
    // ширина/висота комірки при ширині картини = aspect·H
    const score = Math.abs(Math.log(aspect / cols / (1 / rows)));
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }
  return best;
}

export function layoutFor(
  count: PieceCount,
  imageWidth: number,
  imageHeight: number,
): Layout {
  const aspect = imageWidth / imageHeight;
  const boardW = Math.round(
    aspect >= 1 ? BOARD_LONG_SIDE : BOARD_LONG_SIDE * aspect,
  );
  const boardH = Math.round(
    aspect >= 1 ? BOARD_LONG_SIDE / aspect : BOARD_LONG_SIDE,
  );
  const { cols, rows } = gridFor(count, boardW / boardH);
  const cw = boardW / cols;
  const ch = boardH / rows;
  return {
    count,
    cols,
    rows,
    boardW,
    boardH,
    cw,
    ch,
    snap: Math.min(cw, ch) * SNAP_FRACTION,
    world: {
      minX: -WORLD_MARGIN,
      minY: -WORLD_MARGIN,
      maxX: boardW + WORLD_MARGIN,
      maxY: boardH + WORLD_MARGIN,
    },
  };
}

export function colOf(layout: Layout, piece: number) {
  return piece % layout.cols;
}

export function rowOf(layout: Layout, piece: number) {
  return Math.floor(piece / layout.cols);
}

/** Сусідні кусочки за сіткою (ліворуч, праворуч, вгорі, внизу). */
export function neighborsOf(layout: Layout, piece: number): number[] {
  const col = colOf(layout, piece);
  const row = rowOf(layout, piece);
  const out: number[] = [];
  if (col > 0) out.push(piece - 1);
  if (col < layout.cols - 1) out.push(piece + 1);
  if (row > 0) out.push(piece - layout.cols);
  if (row < layout.rows - 1) out.push(piece + layout.cols);
  return out;
}

/** Обмежує початок групи так, щоб усі її кусочки лишались у межах світу. */
export function clampGroupOrigin(
  layout: Layout,
  pieces: number[],
  x: number,
  y: number,
): { x: number; y: number } {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const p of pieces) {
    const col = colOf(layout, p);
    const row = rowOf(layout, p);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
  }
  const { world, cw, ch } = layout;
  const loX = world.minX - minCol * cw;
  const hiX = world.maxX - (maxCol + 1) * cw;
  const loY = world.minY - minRow * ch;
  const hiY = world.maxY - (maxRow + 1) * ch;
  return {
    x: Math.min(Math.max(x, loX), Math.max(loX, hiX)),
    y: Math.min(Math.max(y, loY), Math.max(loY, hiY)),
  };
}

/** Розмір першого/останнього рядка-стовпця групи — для розміщення її в слот. */
export function groupMinCell(layout: Layout, pieces: number[]) {
  let minCol = Infinity;
  let minRow = Infinity;
  for (const p of pieces) {
    minCol = Math.min(minCol, colOf(layout, p));
    minRow = Math.min(minRow, rowOf(layout, p));
  }
  return { minCol, minRow };
}

export type Slot = { x: number; y: number };

/**
 * Вільні місця навколо картини, куди можна покласти кусочок (комірка не перекриває поле й лежить у світі).
 * `edge` — спершу найдальші від поля (щоб «зібрати до краю»), `random` — у довільному порядку.
 */
export function freeSlots(
  layout: Layout,
  rng: () => number,
  order: 'random' | 'edge',
): Slot[] {
  const { world, cw, ch, boardW, boardH } = layout;
  const stepX = cw * 1.06;
  const stepY = ch * 1.06;
  const pad = Math.min(cw, ch) * 0.2;
  const slots: Array<Slot & { d: number }> = [];
  for (let y = world.minY; y + ch <= world.maxY + 0.001; y += stepY) {
    for (let x = world.minX; x + cw <= world.maxX + 0.001; x += stepX) {
      const overlapsBoard =
        x < boardW + pad && x + cw > -pad && y < boardH + pad && y + ch > -pad;
      if (overlapsBoard) continue;
      const cx = x + cw / 2;
      const cy = y + ch / 2;
      const dx = Math.max(-cx, 0, cx - boardW);
      const dy = Math.max(-cy, 0, cy - boardH);
      slots.push({ x, y, d: Math.hypot(dx, dy) });
    }
  }
  if (order === 'edge') {
    slots.sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
  } else {
    for (let i = slots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
  }
  return slots.map(({ x, y }) => ({ x, y }));
}

/** Невеликий випадковий зсув, щоб кусочки лежали «природно», а не по лінійці. */
export function jitter(layout: Layout, rng: () => number) {
  return {
    x: (rng() - 0.5) * layout.cw * 0.22,
    y: (rng() - 0.5) * layout.ch * 0.22,
  };
}

export function nearlyEqual(a: number, b: number, tolerance: number) {
  return Math.abs(a - b) < tolerance;
}
