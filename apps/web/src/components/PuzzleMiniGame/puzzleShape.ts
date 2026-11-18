/**
 * Форма кусочков: класична «пазлова» (виступи й впадини) на кубічних кривих Безьє.
 * Кожен внутрішній край — одна крива з власними випадковими параметрами, а обидва сусіди користуються
 * ТІЄЮ САМОЮ кривою (один — прямо, другий — у зворотному напрямку), тому кусочки збігаються по формі завжди.
 * Усе виводиться з `seed` сесії: у обох гравців форма однакова, а в кожній новій партії трохи інша.
 * Параметри кривої — за мотивами генератора jigsaw Draradech (CC0).
 */
export type Pt = { x: number; y: number };
export type Seg =
  | { kind: "L"; p: Pt }
  | { kind: "C"; c1: Pt; c2: Pt; p: Pt };
export type Outline = { start: Pt; segs: Seg[] };
export type Side = "top" | "right" | "bottom" | "left";

type EdgeParams = { flip: 1 | -1; a: number; b: number; c: number; d: number; e: number; t: number };

export type PuzzleShapes = {
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  /** Нижній край кожного кусочка (rows-1 рядків): h[row][col] ділить рядки row і row+1. */
  h: EdgeParams[][];
  /** Правий край (cols-1 стовпців): v[row][col] ділить стовпці col і col+1. */
  v: EdgeParams[][];
};

/** Детермінований ГВЧ (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JITTER = 0.04;
const TAB = 0.1;

function randomEdge(rng: () => number): EdgeParams {
  const j = () => (rng() * 2 - 1) * JITTER;
  return {
    flip: rng() < 0.5 ? 1 : -1,
    a: j(),
    b: j(),
    c: j(),
    d: j(),
    e: j(),
    t: TAB * (1 + (rng() * 2 - 1) * 0.18),
  };
}

export function buildShapes(seed: number, cols: number, rows: number, cw: number, ch: number): PuzzleShapes {
  const rng = mulberry32(seed);
  const h = Array.from({ length: Math.max(0, rows - 1) }, () => Array.from({ length: cols }, () => randomEdge(rng)));
  const v = Array.from({ length: rows }, () => Array.from({ length: Math.max(0, cols - 1) }, () => randomEdge(rng)));
  return { cols, rows, cw, ch, h, v };
}

/** 10 опорних точок краю від `from` до `to`; `n` — нормаль до краю (бік, куди «дивиться» виступ). */
function edgePoints(params: EdgeParams, from: Pt, to: Pt): Pt[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const { a, b, c, d, e, t, flip } = params;
  const at = (l: number, w: number): Pt => ({
    x: from.x + ux * l * length + nx * w * length * flip,
    y: from.y + uy * l * length + ny * w * length * flip,
  });
  return [
    at(0, 0),
    at(0.2, a),
    at(0.5 + b + d, -t + c),
    at(0.5 - t + b, t + c),
    at(0.5 - 2 * t + b - d, 3 * t + c),
    at(0.5 + 2 * t + b - d, 3 * t + c),
    at(0.5 + t + b, t + c),
    at(0.5 + b + d, -t + c),
    at(0.8, e),
    at(1, 0),
  ];
}

/** Три кубічні сегменти за точками краю. */
function edgeSegments(points: Pt[]): Seg[] {
  return [
    { kind: "C", c1: points[1], c2: points[2], p: points[3] },
    { kind: "C", c1: points[4], c2: points[5], p: points[6] },
    { kind: "C", c1: points[7], c2: points[8], p: points[9] },
  ];
}

/** Точки краю в абсолютних координатах поля: `forward` — у напрямку «ліворуч→праворуч»/«зверху→вниз». */
function sharedEdge(shapes: PuzzleShapes, kind: "h" | "v", row: number, col: number): Pt[] {
  const { cw, ch } = shapes;
  if (kind === "h") {
    const y = (row + 1) * ch;
    return edgePoints(shapes.h[row][col], { x: col * cw, y }, { x: (col + 1) * cw, y });
  }
  const x = (col + 1) * cw;
  return edgePoints(shapes.v[row][col], { x, y: row * ch }, { x, y: (row + 1) * ch });
}

/**
 * Точки сторони кусочка в абсолютних координатах поля, у порядку обходу за годинниковою стрілкою
 * (верх → право → низ → ліво). Для крайових сторін — дві точки прямої.
 */
export function pieceSidePoints(shapes: PuzzleShapes, col: number, row: number, side: Side): Pt[] {
  const { cols, rows, cw, ch } = shapes;
  const x0 = col * cw;
  const y0 = row * ch;
  switch (side) {
    case "top":
      return row === 0 ? [{ x: x0, y: y0 }, { x: x0 + cw, y: y0 }] : sharedEdge(shapes, "h", row - 1, col);
    case "right":
      return col === cols - 1
        ? [{ x: x0 + cw, y: y0 }, { x: x0 + cw, y: y0 + ch }]
        : sharedEdge(shapes, "v", row, col);
    case "bottom":
      return row === rows - 1
        ? [{ x: x0 + cw, y: y0 + ch }, { x: x0, y: y0 + ch }]
        : [...sharedEdge(shapes, "h", row, col)].reverse();
    case "left":
      return col === 0
        ? [{ x: x0, y: y0 + ch }, { x: x0, y: y0 }]
        : [...sharedEdge(shapes, "v", row, col - 1)].reverse();
  }
}

/** Контур кусочка в локальних координатах (початок — лівий верхній кут комірки). */
export function pieceOutline(shapes: PuzzleShapes, col: number, row: number): Outline {
  const ox = col * shapes.cw;
  const oy = row * shapes.ch;
  const local = (p: Pt): Pt => ({ x: p.x - ox, y: p.y - oy });
  const segs: Seg[] = [];
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const points = pieceSidePoints(shapes, col, row, side).map(local);
    if (points.length === 2) segs.push({ kind: "L", p: points[1] });
    else segs.push(...edgeSegments(points));
  }
  return { start: { x: 0, y: 0 }, segs };
}

/** Наскільки виступи можуть виходити за комірку (з запасом): під цей відступ малюємо спрайт кусочка. */
export function tabMargin(shapes: PuzzleShapes): number {
  return 0.4 * Math.max(shapes.cw, shapes.ch);
}

/** Крайовий кусочок (торкається рамки картини). */
export function isEdgePiece(piece: number, cols: number, rows: number): boolean {
  const col = piece % cols;
  const row = Math.floor(piece / cols);
  return col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
}
