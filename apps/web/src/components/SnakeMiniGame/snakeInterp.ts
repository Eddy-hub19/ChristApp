export type Cell = { x: number; y: number };

/**
 * Позиції сегментів між двома серверними тіками. Сегмент i їде з prev[i] у cur[i]
 * (тіло зсувається на одну клітинку); новий хвіст після росту стартує з останньої клітинки.
 * t ∈ [0,1] — частка тіку, що минула.
 */
export function interpolateBody(prev: Cell[] | null, cur: Cell[], t: number): Cell[] {
  const k = Math.max(0, Math.min(1, t));
  if (!prev || prev.length === 0) return cur.map((c) => ({ ...c }));
  return cur.map((c, i) => {
    const from = prev[Math.min(i, prev.length - 1)];
    return { x: from.x + (c.x - from.x) * k, y: from.y + (c.y - from.y) * k };
  });
}
