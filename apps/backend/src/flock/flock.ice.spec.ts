import { FLOCK_CONFIG } from './flock.config';
import { FlockWorld } from './flock.engine';
import { iceFallSec, iceStep } from './flock.ice';

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('Зимовий мороз: каток', () => {
  const I = FLOCK_CONFIG.ice;
  const W = FLOCK_CONFIG.worldSize;

  it('чим більша маса, тим швидше провалюється; не швидше minSec і не повільніше maxSec', () => {
    const a = iceFallSec(24, I);
    const b = iceFallSec(600, I);
    const c = iceFallSec(5000, I);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(a).toBeLessThanOrEqual(I.maxSec);
    expect(c).toBeGreaterThanOrEqual(I.minSec);
  });

  it('тріщини ростуть на льоду, спадають поза ним', () => {
    let l = 0;
    for (let i = 0; i < 20; i++) l = iceStep(l, true, 300, 0.1, I);
    expect(l).toBeGreaterThan(0);
    const after = iceStep(l, false, 300, 1, I);
    expect(after).toBeLessThan(l);
    expect(iceStep(0.99, true, 300, 5, I)).toBe(1);
  });

  const setup = (mass: number) => {
    const w = new FlockWorld(seeded(3), 2);
    for (const m of w.foodChunks) m.clear();
    w.foodById.clear();
    w.thorns.length = 0;
    const p = w.addPlayer({ name: 'h', skin: 0 });
    p.power = 0;
    p.spawnedAt = -1e9;
    p.effects = {};
    const c = p.cells[0];
    c.mergeAt = 0;
    c.mass = mass;
    c.x = W / 2;
    c.y = W / 2;
    c.vx = c.vy = 0;
    return { w, p, c };
  };

  it('на катку важка клітина провалюється швидше за легку; остання клітина - смерть (iced)', () => {
    const fall = (mass: number) => {
      const { w, p } = setup(mass);
      let t = 0;
      while (p.alive && t < 40) {
        w.tick(0.05);
        t += 0.05;
      }
      expect(p.iced).toBe(true);
      return t;
    };
    const light = fall(60);
    const heavy = fall(3000);
    expect(heavy).toBeLessThan(light);
    expect(heavy).toBeGreaterThanOrEqual(I.minSec - 0.2);
  });

  it('поза катком тріщин нема, під стартовим щитом лід не тріскається', () => {
    const { w, p, c } = setup(500);
    c.x = 100;
    c.y = 100;
    for (let i = 0; i < 100; i++) w.tick(0.05);
    expect(p.alive).toBe(true);
    expect(c.ice).toBeUndefined();
    const s = setup(500);
    s.p.spawnedAt = s.w.now;
    for (let i = 0; i < 60; i++) s.w.tick(0.05);
    expect(s.p.alive).toBe(true);
  });
});
