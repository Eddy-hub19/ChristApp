import { describe, expect, it } from "vitest";
import {
  buildShapes,
  isEdgePiece,
  mulberry32,
  pieceOutline,
  pieceSidePoints,
  tabMargin,
  type Pt,
  type Side,
} from "./puzzleShape";

const LAYOUTS: Array<[number, number, number, number]> = [
  [4, 3, 300, 280],
  [6, 4, 160, 150],
  [8, 6, 120, 130],
  [12, 8, 100, 98],
  [3, 4, 320, 300],
];

const same = (a: Pt[], b: Pt[]) =>
  a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-9 && Math.abs(p.y - b[i].y) < 1e-9);

describe("buildShapes", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = buildShapes(123, 6, 4, 100, 100);
    const b = buildShapes(123, 6, 4, 100, 100);
    const c = buildShapes(124, 6, 4, 100, 100);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("mulberry32 is stable and in [0, 1)", () => {
    const r1 = mulberry32(5);
    const r2 = mulberry32(5);
    for (let i = 0; i < 50; i += 1) {
      const v = r1();
      expect(v).toBe(r2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("piece outlines", () => {
  it.each(LAYOUTS)("%i×%i: every piece matches each of its neighbours exactly", (cols, rows, cw, ch) => {
    for (const seed of [1, 99, 2024]) {
      const shapes = buildShapes(seed, cols, rows, cw, ch);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (col < cols - 1) {
            const mine = pieceSidePoints(shapes, col, row, "right");
            const theirs = pieceSidePoints(shapes, col + 1, row, "left");
            expect(same(mine, [...theirs].reverse())).toBe(true);
          }
          if (row < rows - 1) {
            const mine = pieceSidePoints(shapes, col, row, "bottom");
            const theirs = pieceSidePoints(shapes, col, row + 1, "top");
            expect(same(mine, [...theirs].reverse())).toBe(true);
          }
        }
      }
    }
  });

  it("outer sides are straight lines on the frame", () => {
    const shapes = buildShapes(7, 4, 3, 300, 280);
    const sides: Array<[number, number, Side]> = [
      [0, 1, "left"],
      [3, 1, "right"],
      [2, 0, "top"],
      [2, 2, "bottom"],
    ];
    for (const [col, row, side] of sides) {
      expect(pieceSidePoints(shapes, col, row, side)).toHaveLength(2);
    }
    expect(pieceSidePoints(shapes, 1, 1, "top").length).toBeGreaterThan(2);
  });

  it("a tab on one piece is a blank on the neighbour (same bulge, opposite sides)", () => {
    const shapes = buildShapes(11, 6, 4, 100, 100);
    // Виступ посеред краю: середня точка (p4/p5 у «шийці») лежить по один бік від прямої краю.
    const bulge = (pts: Pt[], axis: "x" | "y") => pts[4][axis] - pts[0][axis];
    const mine = pieceSidePoints(shapes, 2, 1, "right");
    const theirs = pieceSidePoints(shapes, 3, 1, "left");
    // Той самий бік поля, але для сусіда це «всередину», для мене — «назовні»: різниця x від лінії краю та сама.
    const edgeX = 300;
    expect(Math.abs(mine[4].x - edgeX)).toBeCloseTo(Math.abs(theirs[5].x - edgeX));
    expect(bulge(mine, "x")).not.toBe(0);
  });

  it("outline is a closed 12-segment path starting at the cell corner", () => {
    const shapes = buildShapes(3, 4, 3, 300, 280);
    const inner = pieceOutline(shapes, 1, 1); // 4 внутрішні сторони → 4×3 кубічних
    expect(inner.start).toEqual({ x: 0, y: 0 });
    expect(inner.segs).toHaveLength(12);
    expect(inner.segs.every((s) => s.kind === "C")).toBe(true);
    const corner = pieceOutline(shapes, 0, 0); // дві прямі сторони
    expect(corner.segs.filter((s) => s.kind === "L")).toHaveLength(2);
    const last = inner.segs[inner.segs.length - 1].p;
    expect(Math.abs(last.x)).toBeLessThan(1e-9);
    expect(Math.abs(last.y)).toBeLessThan(1e-9);
  });

  it("shapes vary: not every interior edge bulges the same way, and edges differ", () => {
    const shapes = buildShapes(5, 8, 6, 120, 120);
    const flips = new Set(shapes.h.flat().map((e) => e.flip));
    expect(flips.size).toBe(2);
    const ts = new Set(shapes.v.flat().map((e) => e.t.toFixed(4)));
    expect(ts.size).toBeGreaterThan(5);
  });

  it("tabs stay within the margin reserved for the sprite", () => {
    const shapes = buildShapes(21, 8, 6, 120, 130);
    const m = tabMargin(shapes);
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const outline = pieceOutline(shapes, col, row);
        const pts: Pt[] = [outline.start];
        for (const s of outline.segs) {
          if (s.kind === "C") pts.push(s.c1, s.c2);
          pts.push(s.p);
        }
        for (const p of pts) {
          expect(p.x).toBeGreaterThan(-m);
          expect(p.x).toBeLessThan(shapes.cw + m);
          expect(p.y).toBeGreaterThan(-m);
          expect(p.y).toBeLessThan(shapes.ch + m);
        }
      }
    }
  });
});

describe("isEdgePiece", () => {
  it("marks exactly the frame pieces", () => {
    const edges = Array.from({ length: 12 }, (_, i) => i).filter((i) => isEdgePiece(i, 4, 3));
    expect(edges).toEqual([0, 1, 2, 3, 4, 7, 8, 9, 10, 11]);
  });
});
