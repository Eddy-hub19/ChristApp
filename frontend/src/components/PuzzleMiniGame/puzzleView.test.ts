import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM_OVER_FIT,
  MIN_ZOOM_OVER_FIT,
  clampCamera,
  connectedCount,
  fitCamera,
  fitRect,
  formatDuration,
  placedCount,
  screenToWorld,
  stepToward,
  worldToScreen,
  zoomAt,
} from "./puzzleView";

const WORLD = { minX: -500, minY: -500, maxX: 1500, maxY: 1700 };

describe("camera", () => {
  it("fit shows the whole world centred", () => {
    const cam = fitCamera(WORLD, 400, 800, 0);
    const tl = worldToScreen(cam, WORLD.minX, WORLD.minY);
    const br = worldToScreen(cam, WORLD.maxX, WORLD.maxY);
    expect(tl.x).toBeGreaterThanOrEqual(-0.001);
    expect(tl.y).toBeGreaterThanOrEqual(-0.001);
    expect(br.x).toBeLessThanOrEqual(400.001);
    expect(br.y).toBeLessThanOrEqual(800.001);
    // по одній осі впирається в край, по другій — центрується
    expect(Math.abs(tl.x - 0) < 0.001 || Math.abs(tl.y - 0) < 0.001).toBe(true);
  });

  it("screen/world conversion round-trips", () => {
    const cam = { scale: 0.37, x: 41, y: -12 };
    const w = screenToWorld(cam, 120, 250);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(120);
    expect(s.y).toBeCloseTo(250);
  });

  it("pinch zoom keeps the world point under the fingers in place", () => {
    const fit = fitCamera(WORLD, 400, 800);
    const before = screenToWorld(fit, 150, 300);
    const zoomed = zoomAt(fit, 2.5, 150, 300, fit);
    const after = screenToWorld(zoomed, 150, 300);
    expect(zoomed.scale).toBeCloseTo(fit.scale * 2.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zoom is limited around the fit scale", () => {
    const fit = fitCamera(WORLD, 400, 800);
    expect(zoomAt(fit, 1000, 10, 10, fit).scale).toBeCloseTo(fit.scale * MAX_ZOOM_OVER_FIT);
    expect(zoomAt(fit, 0.0001, 10, 10, fit).scale).toBeCloseTo(fit.scale * MIN_ZOOM_OVER_FIT);
  });

  it("panning cannot lose the field entirely", () => {
    const fit = fitCamera(WORLD, 400, 800);
    const lost = clampCamera({ ...fit, x: 99999, y: -99999 }, WORLD, 400, 800);
    const center = worldToScreen(lost, 500, 600);
    expect(center.x).toBeLessThanOrEqual(400.001);
    expect(center.y).toBeGreaterThanOrEqual(-0.001);
    expect(clampCamera(fit, WORLD, 400, 800)).toBe(fit);
  });

  it("fitRect centres a rectangle", () => {
    const cam = fitRect({ x: 0, y: 0, w: 1000, h: 1250 }, 400, 800, 0);
    const c = worldToScreen(cam, 500, 625);
    expect(c.x).toBeCloseTo(200);
    expect(c.y).toBeCloseTo(400);
  });
});

describe("stepToward", () => {
  it("moves toward the target without overshooting and finishes", () => {
    let value = 0;
    let done = false;
    let steps = 0;
    while (!done && steps < 200) {
      ({ value, done } = stepToward(value, 100, 16));
      expect(value).toBeLessThanOrEqual(100);
      steps += 1;
    }
    expect(done).toBe(true);
    expect(value).toBe(100);
    expect(steps).toBeLessThan(80);
  });

  it("does not depend on the frame rate", () => {
    let a = 0;
    for (let i = 0; i < 10; i += 1) a = stepToward(a, 100, 10, 70, 0).value;
    const b = stepToward(0, 100, 100, 70, 0).value;
    expect(a).toBeCloseTo(b, 5);
  });

  it("a zero time step does not move", () => {
    expect(stepToward(5, 50, 0).value).toBe(5);
  });
});

describe("stats helpers", () => {
  const groups = [
    { placed: true, pieces: [0, 1, 2] },
    { placed: false, pieces: [3, 4] },
    { placed: false, pieces: [5] },
  ];
  it("counts placed and connected pieces", () => {
    expect(placedCount(groups)).toBe(3);
    expect(connectedCount(groups)).toBe(5);
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_400)).toBe("1:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });
});
