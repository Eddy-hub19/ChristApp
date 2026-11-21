import { FLOCK_CONFIG } from './flock.config';
import { generateCandy, inCurrent, inRiverBand, onCookie } from './flock.candy';

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('Цукеркова країна: шоколадна ріка', () => {
  const W = FLOCK_CONFIG.worldSize;
  const R = FLOCK_CONFIG.candy.river;

  it('русло не накриває центр світу, зони карамелі не лежать у руслі', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const l = generateCandy(seeded(seed), W, FLOCK_CONFIG.candy);
      const rv = l.river!;
      expect(rv.y1 - rv.y0).toBe(R.width);
      expect(inRiverBand(rv, W / 2)).toBe(false);
      for (const z of [...l.puddles, ...l.sticky]) expect(z.y + z.r < rv.y0 || z.y - z.r > rv.y1).toBe(true);
    }
  });

  it('є брід: ланцюжок печенек (кола перекриваються або майже торкаються) з берега на берег', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rv = generateCandy(seeded(seed), W, FLOCK_CONFIG.candy).river!;
      for (const c of rv.cookies) {
        expect(c.y).toBeGreaterThan(rv.y0);
        expect(c.y).toBeLessThan(rv.y1);
        expect(c.x).toBeGreaterThan(0);
        expect(c.x).toBeLessThan(W);
      }
      const near = (a: (typeof rv.cookies)[number], b: (typeof rv.cookies)[number]) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 20;
      const seen = new Set(rv.cookies.filter((c) => c.y - c.r <= rv.y0 + 30));
      const queue = [...seen];
      while (queue.length) {
        const c = queue.pop()!;
        for (const o of rv.cookies) if (!seen.has(o) && near(c, o)) (seen.add(o), queue.push(o));
      }
      expect([...seen].some((c) => c.y + c.r >= rv.y1 - 30)).toBe(true);
    }
  });

  it('течія діє в руслі й не діє на печеньці та поза руслом', () => {
    const rv = generateCandy(seeded(7), W, FLOCK_CONFIG.candy).river!;
    const c = rv.cookies[0];
    expect(onCookie(rv, c.x, c.y)).toBe(true);
    expect(inCurrent(rv, c.x, c.y)).toBe(false);
    expect(inCurrent(rv, 5, rv.y0 - 1)).toBe(false);
    // точка в руслі подалі від усіх печенек
    let found = false;
    for (let x = 100; x < W && !found; x += 50) {
      const y = (rv.y0 + rv.y1) / 2;
      if (!onCookie(rv, x, y)) {
        expect(inCurrent(rv, x, y)).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

import { FlockWorld } from './flock.engine';

describe('Цукеркова країна: цукерковий дощ', () => {
  const R = FLOCK_CONFIG.candy.rain;
  const newWorld = () => {
    const w = new FlockWorld(seeded(5), 8);
    for (const m of w.foodChunks) m.clear();
    w.foodById.clear();
    return w;
  };
  const human = (w: FlockWorld, x: number, y: number) => {
    const p = w.addPlayer({ name: 'h', skin: 0 });
    p.power = 0;
    p.cells[0].x = x;
    p.cells[0].y = y;
    p.cells[0].mergeAt = 0;
    p.spawnedAt = -1e9;
    return p;
  };

  it('до першого дощу нічого нема; зорепаду на цій карті нема', () => {
    const w = newWorld();
    human(w, 1000, 1000);
    for (let i = 0; i < 100; i++) w.tick(0.05);
    expect(w.rainCandies.length).toBe(0);
    expect(w.stars.length).toBe(0);
  });

  it('після intervalMs з\'являються цукерки з попередженням warnMs, а удар відкидає овечку від центра', () => {
    const w = newWorld();
    const p = human(w, 1000, 1000);
    w.now = R.intervalMs;
    w.tick(0.05);
    expect(w.candyRainEvents.length).toBeGreaterThanOrEqual(R.countMin);
    expect(w.candyRainEvents.length).toBeLessThanOrEqual(R.countMax);
    for (const e of w.candyRainEvents) expect(e[3]).toBeGreaterThanOrEqual(R.warnMs);
    // ставимо овечку поруч із першою цукеркою
    const k = w.rainCandies[0];
    const c = p.cells[0];
    c.x = Math.min(3000, k.x + 100);
    c.y = k.y;
    c.vx = c.vy = 0;
    w.now = k.landAt;
    w.tick(0.001);
    expect(w.rainCandies.find((q) => q.id === k.id)).toBeUndefined();
    expect(c.vx).toBeGreaterThan(100);
  });

  it('наступний дощ - не раніше ніж через intervalMs', () => {
    const w = newWorld();
    human(w, 1000, 1000);
    w.now = R.intervalMs;
    w.tick(0.05);
    w.now += 1000;
    w.rainCandies.length = 0;
    w.tick(0.05);
    expect(w.candyRainEvents.length).toBe(0);
  });
});
