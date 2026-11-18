export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Місце для підпису біля голови так, щоб він НЕ накривав жодної клітинки змійок/їжі:
 * пробуємо над головою, під нею, праворуч, ліворуч; якщо ніде не вміщується — кут поля.
 */
export function findLabelSpot(opts: {
  head: { x: number; y: number };
  label: { w: number; h: number };
  cell: number;
  board: { w: number; h: number };
  occupied: ReadonlySet<string>;
}): Rect {
  const { head, label, cell, board, occupied } = opts;
  const worldW = board.w * cell;
  const worldH = board.h * cell;
  const gap = 2;
  const hx = head.x * cell;
  const hy = head.y * cell;
  const clampX = (x: number) => Math.max(1, Math.min(worldW - label.w - 1, x));

  const candidates: Rect[] = [
    { x: clampX(hx + cell / 2 - label.w / 2), y: hy - label.h - gap, w: label.w, h: label.h },
    { x: clampX(hx + cell / 2 - label.w / 2), y: hy + cell + gap, w: label.w, h: label.h },
    { x: hx + cell + gap, y: hy + cell / 2 - label.h / 2, w: label.w, h: label.h },
    { x: hx - label.w - gap, y: hy + cell / 2 - label.h / 2, w: label.w, h: label.h },
  ];

  const fits = (r: Rect) => {
    if (r.x < 0 || r.y < 0 || r.x + r.w > worldW || r.y + r.h > worldH) return false;
    const x0 = Math.floor(r.x / cell);
    const x1 = Math.floor((r.x + r.w - 1) / cell);
    const y0 = Math.floor(r.y / cell);
    const y1 = Math.floor((r.y + r.h - 1) / cell);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (occupied.has(`${x}:${y}`)) return false;
      }
    }
    return true;
  };

  return (
    candidates.find(fits) ?? {
      x: worldW - label.w - 2,
      y: 2,
      w: label.w,
      h: label.h,
    }
  );
}
