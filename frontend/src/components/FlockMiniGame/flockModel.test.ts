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
  pauseMs: 20000,
  resumeToken: "0123456789abcdef0123456789abcdef",
  resumed: false,
  resumeFailed: false,
};

const base = (over: Partial<DecodedState> = {}): DecodedState => ({
  tick: 1, alive: true, total: 30, selfPid: 1, effects: [], forgetChunks: [], chunks: [], foodEvents: [],
  players: [{ pid: 1, skin: 0, bot: false, name: "me" }], cells: [{ id: 1, pid: 1, x: 500, y: 500, mass: 30, fx: 0 }],
  thorns: [], blobs: [], bonuses: [], paused: [], ...over,
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

  it("своя клітина передбачається одразу, чужа інтерполюється між знімками з затримкою", () => {
    const m = new FlockModel(cfg);
    const cellsAt = (x: number) => [
      { id: 1, pid: 1, x: 500, y: 500, mass: 30, fx: 0 },
      { id: 2, pid: 9, x, y: 500, mass: 30, fx: 0 },
    ];
    m.applyState(base({ tick: 1000, cells: cellsAt(700) }), 1000);
    m.applyState(base({ tick: 1100, cells: cellsAt(800) }), 1100);
    expect(m.interpDelay).toBeCloseTo(150, 0); // 100 мс між знімками * 1.25 + 25
    // 1230 мс: малюємо момент 1230-150 = 1080 => 80% шляху між знімками
    m.step(0.05, { angle: 0, power: 1 }, 1230);
    expect(m.cells.get(2)!.x).toBeCloseTo(780, 0);
    expect(m.cells.get(1)!.x).toBeGreaterThan(500); // своя поїхала без очікування сервера
  });

  it("свою клітину сервер лише м'яко підтягує до свого знімка; без вводу вона стоїть на серверній позиції", () => {
    const m = new FlockModel(cfg);
    m.applyState(base({ tick: 1000 }), 1000);
    m.step(0.05, { angle: 0, power: 1 }, 1050);
    m.step(0.05, { angle: 0, power: 1 }, 1100);
    for (let i = 0; i < 80; i++) m.step(0.05, { angle: 0, power: 0 }, 1100 + (i + 1) * 50);
    expect(Math.abs(m.cells.get(1)!.x - 500)).toBeLessThan(7); // м'яка мертва зона 6 од.
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

  it("гравці в паузі: таймер рахується від локального часу, зникає, коли пауза скінчилась", () => {
    const m = new FlockModel(cfg);
    m.applyState(base({ paused: [{ pid: 9, remainingMs: 12_000 }] }));
    const now = Date.now();
    expect(m.pauseLeftMs(9, now)).toBeGreaterThan(11_900);
    expect(m.pauseLeftMs(9, now + 5_000)).toBeLessThan(7_100);
    expect(m.pauseLeftMs(9, now + 60_000)).toBe(0);
    expect(m.pauseLeftMs(1, now)).toBe(0);
    m.applyState(base({ paused: [] })); // повернувся - плашка зникає
    expect(m.pauseLeftMs(9, now)).toBe(0);
  });

  describe("плавність при джитері мережі (інтерполяція за часом сервера)", () => {
    /** Сервер: чужа клітина їде 0.1 од/мс (100 од/с), знімок кожні 100 мс; пакети приходять із розкидом. */
    function simulate(jitterMs: number, stallAt?: [number, number]) {
      const m = new FlockModel(cfg);
      let seed = 3;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const packets: { srv: number; recv: number }[] = [];
      let lastRecv = 0;
      for (let srv = 1000; srv <= 9000; srv += 100) {
        let recv = srv + 40 + rnd() * jitterMs;
        if (stallAt && srv >= stallAt[0] && srv < stallAt[1]) recv = stallAt[1] + 40 + (srv - stallAt[0]) * 0.02; // пакети застрягли й прийшли пачкою
        recv = Math.max(recv, lastRecv + 1); // TCP зберігає порядок
        lastRecv = recv;
        packets.push({ srv, recv });
      }
      const xs: number[] = [];
      let pi = 0;
      for (let t = 0; t <= 9400; t += 16.667) {
        while (pi < packets.length && packets[pi].recv <= t) {
          const p = packets[pi++];
          m.applyState(
            base({
              tick: p.srv,
              cells: [
                { id: 1, pid: 1, x: 500, y: 500, mass: 30, fx: 0 },
                { id: 2, pid: 9, x: 700 + (p.srv - 1000) * 0.1, y: 500, mass: 30, fx: 0 },
              ],
            }),
            p.recv,
          );
        }
        m.step(0.016667, { angle: 0, power: 0 }, t);
        if (t > 2500 && t < 8800 && m.cells.has(2)) xs.push(m.cells.get(2)!.x);
      }
      const steps = xs.slice(1).map((x, i) => x - xs[i]);
      const sorted = [...steps].sort((a, b) => a - b);
      return { med: sorted[sorted.length >> 1], min: sorted[0], max: sorted[sorted.length - 1], steps, m };
    }

    it("без джитера рух рівний: кроки кадрів майже однакові", () => {
      const r = simulate(0);
      expect(r.med).toBeCloseTo(1.667, 1);
      expect(r.max).toBeLessThan(r.med * 1.15);
      expect(r.min).toBeGreaterThan(r.med * 0.85);
    });

    it("джитер до 60 мс не дає ні завмирань, ні ривків (буфер ~150 мс це ховає)", () => {
      const r = simulate(60);
      expect(r.min).toBeGreaterThan(r.med * 0.6);
      expect(r.max).toBeLessThan(r.med * 1.6);
      for (const st of r.steps) expect(st).toBeGreaterThanOrEqual(0); // ніколи не повзе назад
    });

    it("затримка інтерполяції підлаштовується під частоту сервера (запобіжник 10 -> 6 Гц)", () => {
      const m = new FlockModel(cfg);
      for (let i = 0; i < 40; i++) m.applyState(base({ tick: 1000 + i * 100 }), 1000 + i * 100);
      const at10 = m.interpDelay;
      for (let i = 0; i < 60; i++) m.applyState(base({ tick: 5000 + i * 167 }), 5000 + i * 167);
      expect(m.interpDelay).toBeGreaterThan(at10 + 40); // ~167 мс між знімками => ~233 мс буфера
      expect(m.interpDelay).toBeLessThanOrEqual(260);
    });

    it("якщо пакети зникли на ~0.5 с: коротка екстраполяція, потім утримання - без втечі за екран", () => {
      const r = simulate(0, [4000, 4500]);
      // після пачки пакетів час малювання наздоганяє плавно (до +35% швидкості), без стрибка на сотні мс
      expect(r.max).toBeLessThan(r.med * 1.8);
      expect(r.steps.filter((x) => x === 0).length).toBeLessThan(40); // завмирання лише на час самої затримки
    });
  });
});
