import { describe, expect, it } from "vitest";
import { EMPTY_STATS, applyMatches, parseStats } from "./guessStats";

const me = "me";
const peer = "peer";
const m = (n: number, winner: string | null) => ({ n, winner, scores: { [me]: 0, [peer]: 0 } });

describe("applyMatches", () => {
  it("counts wins, losses and draws from the match log", () => {
    const s = applyMatches(EMPTY_STATS, [m(1, me), m(2, peer), m(3, null)], me);
    expect(s.record).toEqual({ wins: 1, losses: 1, draws: 1 });
    expect(s.lastMatch).toBe(3);
  });

  it("never counts the same match twice, even when the log is replayed", () => {
    const once = applyMatches(EMPTY_STATS, [m(1, me)], me);
    const again = applyMatches(once, [m(1, me)], me);
    expect(again).toBe(once);
    const more = applyMatches(once, [m(1, me), m(2, me)], me);
    expect(more.record.wins).toBe(2);
    expect(more.lastMatch).toBe(2);
  });

  it("picks up matches that finished while the player was away", () => {
    const s = applyMatches({ record: { wins: 1, losses: 0, draws: 0 }, lastMatch: 1 }, [m(1, me), m(2, peer), m(3, peer)], me);
    expect(s.record).toEqual({ wins: 1, losses: 2, draws: 0 });
  });
});

describe("parseStats", () => {
  it("falls back to empty stats for garbage", () => {
    expect(parseStats(null)).toEqual(EMPTY_STATS);
    expect(parseStats({ record: { wins: "x", losses: -3 }, lastMatch: 2.7 })).toEqual({
      record: { wins: 0, losses: 0, draws: 0 },
      lastMatch: 2,
    });
  });
});
