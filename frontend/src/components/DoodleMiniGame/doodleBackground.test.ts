import { describe, expect, it } from "vitest";
import { DOODLE_THEMES, easeFactor, hexToRgb, themeIndexForScore } from "./doodleBackground";

describe("doodle themes", () => {
  it("are ordered by threshold and start at 0", () => {
    expect(DOODLE_THEMES[0].minScore).toBe(0);
    for (let i = 1; i < DOODLE_THEMES.length; i += 1) {
      expect(DOODLE_THEMES[i].minScore).toBeGreaterThan(DOODLE_THEMES[i - 1].minScore);
    }
  });

  it("picks the theme by score", () => {
    expect(themeIndexForScore(0)).toBe(0);
    expect(themeIndexForScore(499)).toBe(0);
    expect(themeIndexForScore(500)).toBe(1);
    expect(themeIndexForScore(1000)).toBe(2);
    expect(themeIndexForScore(1999)).toBe(2);
    expect(themeIndexForScore(2000)).toBe(3);
    expect(themeIndexForScore(99999)).toBe(DOODLE_THEMES.length - 1);
  });
});

describe("easing", () => {
  it("is ~95% done after the transition and fps-independent", () => {
    const at60 = 1 - Array.from({ length: 102 }).reduce<number>((rest) => rest * (1 - easeFactor(1 / 60)), 1);
    const at30 = 1 - Array.from({ length: 51 }).reduce<number>((rest) => rest * (1 - easeFactor(1 / 30)), 1);
    expect(at60).toBeGreaterThan(0.94);
    expect(Math.abs(at60 - at30)).toBeLessThan(0.001);
  });

  it("parses hex colors", () => {
    expect(hexToRgb("#1f2a5c")).toEqual([31, 42, 92]);
  });
});
