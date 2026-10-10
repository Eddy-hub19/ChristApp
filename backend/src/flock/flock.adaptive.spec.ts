import { AdaptiveRate } from './flock.adaptive';

describe('AdaptiveRate (запобіжник частоти під слабкий CPU)', () => {
  const make = () => new AdaptiveRate(10, [8, 6], 25, 8);

  it('поки таймер не запізнюється - базова частота', () => {
    const r = make();
    for (let i = 0; i < 200; i++) r.update(1, i * 100);
    expect(r.hz).toBe(10);
  });

  it('стабільне запізнення знижує частоту ступінчасто: 10 -> 8 -> 6, але не нижче', () => {
    const r = make();
    let t = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      t += 100;
      seen.add(r.update(80, t));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([6, 8, 10]);
    expect(r.hz).toBe(6);
  });

  it('одиничний стрибок (GC, чат) не знижує частоту', () => {
    const r = make();
    let t = 0;
    for (let i = 0; i < 100; i++) {
      t += 100;
      r.update(i === 50 ? 150 : 1, t);
    }
    expect(r.hz).toBe(10);
  });

  it('після спокою частота повертається, але не раніше 8 с (без гойдалки)', () => {
    const r = make();
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t += 100;
      r.update(80, t);
    }
    expect(r.hz).toBeLessThan(10);
    const low = r.hz;
    for (let i = 0; i < 40; i++) {
      t += 100;
      r.update(0, t);
    }
    expect(r.hz).toBe(low); // ще не минуло 8 с спокою
    for (let i = 0; i < 400; i++) {
      t += 100;
      r.update(0, t);
    }
    expect(r.hz).toBe(10);
  });

  it('фолбеки вищі за базову частоту ігноруються', () => {
    expect(new AdaptiveRate(6, [8, 6, 4], 25, 8).hz).toBe(6);
  });
});
