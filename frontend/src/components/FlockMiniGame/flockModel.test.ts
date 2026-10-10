import { describe, expect, it } from "vitest";
import { FlockModel, viewScale, type FlockCfg } from "./flockModel";
import type { DecodedState } from "./flockProtocol";

const cfg: FlockCfg = {
  pid: 1,
  arenaId: 1,
  world: 3200,
  chunk: 320,
  tickHz: 10,
  radiusK: 4.2,
  speed: { base: 330, exp: -0.18, min: 62, boost: 1.5 },
  durations: { speed: 7000 },
  magnetRadius: 340,
  view: { base: 400, perSqrtMass: 6.5, max: 1100 },
};

const base = (over: Partial<DecodedState> = {}): DecodedState => ({
  tick: 1, alive: true, total: 30, selfPid: 1, effects: [], forgetChunks: [], chunks: [], foodEvents: [],
  players: [{ pid: 1, skin: 0, bot: false, name: "me" }], cells: [{ id: 1, pid: 1, x: 500, y: 500, mass: 30, fx: 0 }],
  thorns: [], blobs: [], bonuses: [], ...over,
});

describe("FlockModel", () => {
  it("чанки їжі: знімок додає, дельти змінюють, forget прибирає лише чанк", () => {
    const m = new FlockModel(cfg);
    m.applyState(base({ chunks: [{ idx: 0, foods: [{ id: 1, x: 10, y: 10, kind: 0 }] }, { idx: 1, foods: [{ id: 2, x: 400, y: 10, kind: 1 }] }] }));
    expect(m.foods.size).toBe(2);
    m.applyState(base({ foodEvents: [{ op: 0, id: 1, x: 10, y: 10, kind: 0 }, { op: 1, id: 3, x: 50, y: 50, kind: 2 }, { op: 2, id: 2, x: 420, y: 15, kind: 1 }] }));
    expect([...m.foods.keys()].sort()).toEqual([2, 3]);
    expect(m.foods.get(2)?.x).toBe(420);
    m.applyState(base({ forgetChunks: [0] }));
    expect([...m.foods.keys()]).toEqual([2]);
  });

  it("своя клітина передбачається одразу, чужа згладжується до цілі", () => {
    const m = new FlockModel(cfg);
    m.applyState(base({ cells: [{ id: 1, pid: 1, x: 500, y: 500, mass: 30, fx: 0 }, { id: 2, pid: 9, x: 700, y: 500, mass: 30, fx: 0 }] }));
    m.applyState(base({ cells: [{ id: 1, pid: 1, x: 500, y: 500, mass: 30, fx: 0 }, { id: 2, pid: 9, x: 800, y: 500, mass: 30, fx: 0 }] }));
    m.step(0.05, { angle: 0, power: 1 });
    const own = m.cells.get(1)!;
    const other = m.cells.get(2)!;
    expect(own.x).toBeGreaterThan(500); // поїхала без очікування сервера
    expect(other.x).toBeGreaterThan(700);
    expect(other.x).toBeLessThan(800);
    for (let i = 0; i < 60; i++) m.step(0.05, { angle: 0, power: 0 });
    expect(other.x).toBeCloseTo(800, 0);
    expect(own.x).toBeCloseTo(500, 0); // сервер підтягнув назад
  });

  it("сила 0 - клітина стоїть; прискорення збільшує швидкість", () => {
    const a = new FlockModel(cfg);
    a.applyState(base());
    a.step(0.1, { angle: 0, power: 0 });
    expect(a.cells.get(1)!.x).toBeCloseTo(500, 3);
    const b = new FlockModel(cfg);
    b.applyState(base({ effects: [{ kind: 0, remainingMs: 5000 }] }));
    expect(b.hasEffect("speed")).toBe(true);
    expect(b.speedOf(30, true)).toBeCloseTo(b.speedOf(30, false) * 1.5, 5);
  });

  it("з'їдена клітина зникає з анімацією до більшого сусіда", () => {
    const m = new FlockModel(cfg);
    m.applyState(base({ cells: [{ id: 1, pid: 1, x: 500, y: 500, mass: 30, fx: 0 }, { id: 2, pid: 9, x: 520, y: 500, mass: 20, fx: 0 }] }));
    m.applyState(base({ cells: [{ id: 1, pid: 1, x: 500, y: 500, mass: 50, fx: 0 }] }));
    expect(m.cells.has(2)).toBe(false);
    expect(m.dying).toHaveLength(1);
    for (let i = 0; i < 20; i++) m.step(0.05, { angle: 0, power: 0 });
    expect(m.dying).toHaveLength(0);
  });

  it("маса росте плавно, камера тримається за власними клітинами, радіус обзору росте з масою", () => {
    const m = new FlockModel(cfg);
    m.applyState(base());
    m.step(0.016, { angle: 0, power: 0 });
    const r0 = m.camR;
    m.applyState(base({ cells: [{ id: 1, pid: 1, x: 500, y: 500, mass: 900, fx: 0 }] }));
    m.step(0.016, { angle: 0, power: 0 });
    const c = m.cells.get(1)!;
    expect(c.mass).toBeGreaterThan(30);
    expect(c.mass).toBeLessThan(900);
    for (let i = 0; i < 200; i++) m.step(0.05, { angle: 0, power: 0 });
    expect(m.camR).toBeGreaterThan(r0);
    expect(m.camX).toBeCloseTo(500, 0);
  });

  it("масштаб залежить від площі екрана, а видима область менша за надіслану для будь-якої форми", () => {
    for (const [w, h] of [[390, 844], [1280, 800], [800, 800]]) {
      const R = 500;
      const a = w / h;
      const s = viewScale(w, h, R);
      expect(w / s / 2).toBeLessThan(R * Math.sqrt(a) * 1.15);
      expect(h / s / 2).toBeLessThan((R / Math.sqrt(a)) * 1.15);
    }
    // вузький телефон: персонаж більший, ніж у старій квадратній схемі
    expect(viewScale(390, 844, 500)).toBeGreaterThan(390 / (2 * 500 * 1.15));
  });
});
