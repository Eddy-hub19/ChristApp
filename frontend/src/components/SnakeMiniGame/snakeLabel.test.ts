import { beforeAll, describe, expect, it } from "vitest";
import { findLabelSpot } from "./snakeLabel";
import { interpolateBody } from "./snakeInterp";
import { getBestScore, getDuelRecord, recordBestScore, recordDuelResult } from "./snakeStats";

const board = { w: 24, h: 16 };
const cell = 18;
const label = { w: 60, h: 14 };

const overlaps = (r: { x: number; y: number; w: number; h: number }, occupied: Set<string>) => {
  for (let x = Math.floor(r.x / cell); x <= Math.floor((r.x + r.w - 1) / cell); x += 1)
    for (let y = Math.floor(r.y / cell); y <= Math.floor((r.y + r.h - 1) / cell); y += 1)
      if (occupied.has(`${x}:${y}`)) return true;
  return false;
};

describe("findLabelSpot", () => {
  it("puts the label above the head when that is free", () => {
    const spot = findLabelSpot({ head: { x: 10, y: 8 }, label, cell, board, occupied: new Set(["10:8"]) });
    expect(spot.y).toBeLessThan(8 * cell);
  });

  it("never covers an occupied cell", () => {
    // змійка над головою блокує верх: підпис має піти вбік або вниз
    const occupied = new Set(["10:8", "10:7", "9:7", "11:7", "10:6", "9:6", "11:6"]);
    const spot = findLabelSpot({ head: { x: 10, y: 8 }, label, cell, board, occupied });
    expect(overlaps(spot, occupied)).toBe(false);
  });

  it("stays inside the board near the edges", () => {
    const spot = findLabelSpot({ head: { x: 0, y: 0 }, label, cell, board, occupied: new Set(["0:0"]) });
    expect(spot.x).toBeGreaterThanOrEqual(0);
    expect(spot.y).toBeGreaterThanOrEqual(0);
    expect(spot.x + spot.w).toBeLessThanOrEqual(board.w * cell);
  });
});

describe("interpolateBody", () => {
  it("glides each segment from its previous cell to the new one", () => {
    const prev = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
    const cur = [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
    expect(interpolateBody(prev, cur, 0)).toEqual(prev);
    expect(interpolateBody(prev, cur, 1)).toEqual(cur);
    expect(interpolateBody(prev, cur, 0.5)[0]).toEqual({ x: 5.5, y: 5 });
  });

  it("handles growth (longer body) and clamps t", () => {
    const prev = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    const cur = [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
    const mid = interpolateBody(prev, cur, 2);
    expect(mid).toEqual(cur);
    expect(interpolateBody(null, cur, 0.5)).toEqual(cur);
  });
});

describe("snake stats", () => {
  beforeAll(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  });

  it("keeps best scores per level and duel records per rival", () => {
    expect(getBestScore("u1", 1)).toBe(0);
    expect(recordBestScore("u1", 1, 7)).toBe(7);
    expect(recordBestScore("u1", 1, 3)).toBe(7);
    expect(getBestScore("u1", 2)).toBe(0);

    expect(getDuelRecord("u1", "neko")).toEqual({ wins: 0, losses: 0 });
    recordDuelResult("u1", "neko", "win");
    recordDuelResult("u1", "neko", "win");
    recordDuelResult("u1", "neko", "loss");
    expect(getDuelRecord("u1", "neko")).toEqual({ wins: 2, losses: 1 });
    expect(getDuelRecord("u1", "other")).toEqual({ wins: 0, losses: 0 });
  });
});
