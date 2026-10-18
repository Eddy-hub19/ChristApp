import { FLOCK_CONFIG as C } from './flock.config';
import {
  CHUNKS_PER_SIDE,
  FOOD_REACH,
  FlockWorld,
  generateThorns,
  radiusOf,
} from './flock.engine';
import { FlockManager } from './flock.manager';
import { decodeState } from './protocol';

/** mulberry32: хорошо перемешивает даже соседние seed (простой LCG даёт похожие первые значения). */
function lcg(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Карта: размер и еда', () => {
  it('мир на 25-30% больше по каждой стороне, позиции помещаются в u16 пакетов (шаг 1/16)', () => {
    const k = C.worldSize / 3200;
    expect(k).toBeGreaterThanOrEqual(1.25);
    expect(k).toBeLessThanOrEqual(1.3);
    expect(C.worldSize).toBeLessThan(65535 / 16);
    expect(CHUNKS_PER_SIDE).toBe(Math.ceil(C.worldSize / C.chunkSize));
  });

  it('еда крупнее в 1.5 раза, плотность не выше прежней (520 на 3200²)', () => {
    expect(C.foodRadius / 8.5).toBeCloseTo(1.5, 5);
    const before = 520 / 3200 ** 2;
    const after = C.maxFood / C.worldSize ** 2;
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(before * 0.75); // но поле не выглядит пустым
  });

  describe('радиус подбора еды', () => {
    function setup(foodDist: number) {
      const w = new FlockWorld(lcg(5));
      for (const m of w.foodChunks) m.clear();
      w.foodById.clear();
      w.thorns.length = 0;
      const p = w.addPlayer({ name: 'p', skin: 0 });
      p.boostUntil = 0;
      p.effects = {};
      const c = p.cells[0];
      c.x = 1000;
      c.y = 1000;
      c.mass = 60;
      const f = { id: 9001, x: 1000 + foodDist, y: 1000, kind: 0 };
      w.foodById.set(f.id, f);
      w.foodChunks[
        Math.floor(f.y / C.chunkSize) * CHUNKS_PER_SIDE +
          Math.floor(f.x / C.chunkSize)
      ].set(f.id, f);
      return { w, c, f };
    }
    const r = radiusOf(60);

    it('радиус подбора больше радиуса овечки на foodRadius × foodTouch', () => {
      expect(FOOD_REACH).toBeCloseTo(C.foodRadius * C.foodTouch, 8);
      expect(FOOD_REACH).toBeGreaterThan(0);
    });

    it('еда, которой край овечки визуально касается, съедается', () => {
      const { w, f } = setup(r + FOOD_REACH - 1);
      w.tick(0.1);
      expect(w.foodById.has(f.id)).toBe(false);
    });

    it('еда чуть дальше зоны касания не съедается', () => {
      const { w, f } = setup(r + FOOD_REACH + 2);
      w.tick(0.1);
      expect(w.foodById.has(f.id)).toBe(true);
    });

    it('еда, которую раньше надо было накрыть центром, теперь берётся с края', () => {
      const { w, f } = setup(r + 3); // раньше (dist < r) не съедалась бы
      w.tick(0.1);
      expect(w.foodById.has(f.id)).toBe(false);
    });
  });
});

describe('Карта: случайные кусты', () => {
  const T = C.thorns;
  const layouts = Array.from({ length: 300 }, (_, i) =>
    generateThorns(lcg(i + 1)),
  );

  it('количество в пределах конфига', () => {
    for (const l of layouts) {
      expect(l.length).toBeGreaterThanOrEqual(T.min);
      expect(l.length).toBeLessThanOrEqual(T.max);
    }
    const counts = new Set(layouts.map((l) => l.length));
    expect(counts.size).toBeGreaterThan(3); // количество случайное
  });

  it('кусты не пересекаются: минимальная дистанция между центрами', () => {
    for (const l of layouts)
      for (let i = 0; i < l.length; i++)
        for (let j = i + 1; j < l.length; j++)
          expect(
            Math.hypot(l[i].x - l[j].x, l[i].y - l[j].y),
          ).toBeGreaterThanOrEqual(T.minGap);
  });

  it('кусты не у краёв и не в центре (запасная точка появления)', () => {
    const mid = C.worldSize / 2;
    for (const l of layouts)
      for (const t of l) {
        expect(t.x).toBeGreaterThanOrEqual(T.edgeMargin);
        expect(t.x).toBeLessThanOrEqual(C.worldSize - T.edgeMargin);
        expect(t.y).toBeGreaterThanOrEqual(T.edgeMargin);
        expect(t.y).toBeLessThanOrEqual(C.worldSize - T.edgeMargin);
        expect(Math.hypot(t.x - mid, t.y - mid)).toBeGreaterThanOrEqual(
          T.centerClear,
        );
      }
  });

  it('размеры слегка различаются, но в разумных пределах', () => {
    const masses = layouts.flat().map((t) => t.mass);
    expect(Math.min(...masses)).toBeGreaterThanOrEqual(T.massMin);
    expect(Math.max(...masses)).toBeLessThanOrEqual(T.massMax);
    expect(new Set(masses.map((m) => Math.round(m))).size).toBeGreaterThan(5);
    // разброс радиуса не более ~±15%: «слегка»
    const r = (m: number) => radiusOf(m);
    expect(r(T.massMax) / r(T.massMin)).toBeLessThan(1.25);
  });

  it('при каждом создании арены раскладка другая, а при том же rng - та же (детерминизм)', () => {
    const a = new FlockWorld(lcg(1)).thorns.map((t) => [t.x, t.y]);
    const b = new FlockWorld(lcg(2)).thorns.map((t) => [t.x, t.y]);
    const a2 = new FlockWorld(lcg(1)).thorns.map((t) => [t.x, t.y]);
    expect(a).not.toEqual(b);
    expect(a).toEqual(a2);
    // а с настоящим Math.random две арены подряд тоже различаются
    const m1 = new FlockWorld(Math.random).thorns.map((t) => [t.x, t.y]);
    const m2 = new FlockWorld(Math.random).thorns.map((t) => [t.x, t.y]);
    expect(m1).not.toEqual(m2);
  });

  it('игроки и боты появляются не на кустах', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = new FlockWorld(lcg(seed));
      for (let i = 0; i < 12; i++) {
        const p = w.addPlayer({ name: 'x', skin: 0, bot: i % 2 === 0 });
        const c = p.cells[0];
        for (const t of w.thorns)
          expect(Math.hypot(c.x - t.x, c.y - t.y)).toBeGreaterThan(
            radiusOf(t.mass) + radiusOf(c.mass),
          );
      }
    }
  });
});

describe('Кусты передаются один раз', () => {
  function setup() {
    const sent: { key: string; event: string; payload: any }[] = [];
    const mgr = new FlockManager(
      (key, event, payload) => sent.push({ key, event, payload }),
      lcg(3),
      () => 1_000_000,
    );
    return { mgr, sent };
  }

  it('при входе в ответе есть все кусты арены; в пакетах стана их нет', () => {
    const { mgr, sent } = setup();
    const res = mgr.join('c1', 'u1', 'Аня', 1);
    const arena = mgr._arena(1)!;
    expect(res.thorns).toHaveLength(arena.world.thorns.length);
    expect(res.thorns![0]).toMatchObject({
      id: expect.any(Number),
      x: expect.any(Number),
      mass: expect.any(Number),
    });
    for (let i = 0; i < 5; i++) arena.step();
    for (const m of sent.filter((s) => s.event === 's'))
      expect(decodeState(m.payload).thorns).toEqual([]);
    mgr.dispose();
  });

  it('старому клиенту (без v2) кусты идут в стане, пока видны', () => {
    const { mgr, sent } = setup();
    mgr.join('old', 'u1', 'Старый', 1, { legacyThorns: true });
    const arena = mgr._arena(1)!;
    // ставим овечку рядом с кустом
    const t = arena.world.thorns[0];
    const p = [...arena.world.players.values()].find((x) => !x.bot)!;
    p.cells[0].x = t.x;
    p.cells[0].y = t.y + 50;
    for (let i = 0; i < 3; i++) arena.step();
    const last = sent.filter((s) => s.event === 's').at(-1)!;
    expect(decodeState(last.payload).thorns.some((x) => x.id === t.id)).toBe(
      true,
    );
    mgr.dispose();
  });
});
