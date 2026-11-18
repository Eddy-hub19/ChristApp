import {
  PIECE_COUNTS,
  clampGroupOrigin,
  freeSlots,
  gridFor,
  layoutFor,
  neighborsOf,
} from './puzzle.engine';

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('puzzle engine', () => {
  it('grid always has exactly `count` pieces and follows the picture orientation', () => {
    for (const count of PIECE_COUNTS) {
      for (const aspect of [0.5, 0.8, 1, 1.25, 1.6, 2.2]) {
        const { cols, rows } = gridFor(count, aspect);
        expect(cols * rows).toBe(count);
      }
      const landscape = gridFor(count, 1.5);
      const portrait = gridFor(count, 1 / 1.5);
      expect(landscape.cols).toBeGreaterThanOrEqual(landscape.rows);
      expect(portrait.rows).toBeGreaterThanOrEqual(portrait.cols);
      expect(portrait.cols).toBe(landscape.rows);
    }
  });

  it('pieces stay close to square for typical pictures', () => {
    for (const count of PIECE_COUNTS) {
      for (const [w, h] of [
        [1276, 1600],
        [1600, 1180],
        [1600, 1600],
      ]) {
        const layout = layoutFor(count, w, h);
        const ratio = layout.cw / layout.ch;
        expect(ratio).toBeGreaterThan(0.6);
        expect(ratio).toBeLessThan(1.6);
        expect(layout.cw * layout.cols).toBeCloseTo(layout.boardW);
        expect(layout.ch * layout.rows).toBeCloseTo(layout.boardH);
      }
    }
  });

  it('neighbours are the grid-adjacent pieces only', () => {
    const layout = layoutFor(12, 1600, 1200); // 4×3
    expect(layout.cols).toBe(4);
    expect(neighborsOf(layout, 0).sort()).toEqual([1, 4]);
    expect(neighborsOf(layout, 5).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
    expect(neighborsOf(layout, 11).sort((a, b) => a - b)).toEqual([7, 10]);
  });

  it('free slots never overlap the board and stay inside the world', () => {
    for (const count of PIECE_COUNTS) {
      const layout = layoutFor(count, 1276, 1600);
      const slots = freeSlots(layout, seeded(7), 'random');
      expect(slots.length).toBeGreaterThanOrEqual(count);
      for (const { x, y } of slots) {
        const overlaps =
          x < layout.boardW &&
          x + layout.cw > 0 &&
          y < layout.boardH &&
          y + layout.ch > 0;
        expect(overlaps).toBe(false);
        expect(x).toBeGreaterThanOrEqual(layout.world.minX);
        expect(x + layout.cw).toBeLessThanOrEqual(layout.world.maxX + 0.01);
        expect(y).toBeGreaterThanOrEqual(layout.world.minY);
        expect(y + layout.ch).toBeLessThanOrEqual(layout.world.maxY + 0.01);
      }
    }
  });

  it('"edge" slots start with the farthest from the board', () => {
    const layout = layoutFor(24, 1600, 1200);
    const slots = freeSlots(layout, seeded(1), 'edge');
    const dist = (s: { x: number; y: number }) => {
      const cx = s.x + layout.cw / 2;
      const cy = s.y + layout.ch / 2;
      return Math.hypot(
        Math.max(-cx, 0, cx - layout.boardW),
        Math.max(-cy, 0, cy - layout.boardH),
      );
    };
    expect(dist(slots[0])).toBeGreaterThanOrEqual(
      dist(slots[slots.length - 1]),
    );
  });

  it('clamps a group so all of its pieces stay in the world', () => {
    const layout = layoutFor(12, 1600, 1200);
    const far = clampGroupOrigin(layout, [0, 1, 4, 5], 99999, -99999);
    // Група 2×2 (cols 0-1, rows 0-1): праворуч упирається в maxX, угорі — в minY.
    expect(far.x).toBeCloseTo(layout.world.maxX - 2 * layout.cw);
    expect(far.y).toBeCloseTo(layout.world.minY);
  });
});
