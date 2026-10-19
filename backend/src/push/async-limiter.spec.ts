import { AsyncLimiter, mapWithConcurrency } from './async-limiter';

describe('AsyncLimiter', () => {
  it('never runs more than `limit` tasks at once and keeps FIFO order', async () => {
    const limiter = new AsyncLimiter(2);
    let active = 0;
    let maxActive = 0;
    const started: number[] = [];

    const task = (id: number) =>
      limiter.run(async () => {
        started.push(id);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return id;
      });

    const results = await Promise.all([1, 2, 3, 4, 5].map(task));

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxActive).toBe(2);
    expect(started).toEqual([1, 2, 3, 4, 5]);
  });

  it('releases the slot when a task throws', async () => {
    const limiter = new AsyncLimiter(1);
    await expect(
      limiter.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});

describe('mapWithConcurrency', () => {
  it('keeps result order and never exceeds the limit', async () => {
    let active = 0;
    let maxActive = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, n));
      active -= 1;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
    expect(maxActive).toBe(3);
  });

  it('handles empty input and limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 8, async (n: number) => n)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 8, async (n) => n + 1)).toEqual([2, 3]);
  });

  it('yields to the event loop between batches (timers run while a long list is processed)', async () => {
    let timerRuns = 0;
    const t = setInterval(() => (timerRuns += 1), 1);
    await mapWithConcurrency(Array.from({ length: 40 }, (_, i) => i), 4, () =>
      new Promise((r) => setTimeout(r, 2)),
    );
    clearInterval(t);
    expect(timerRuns).toBeGreaterThan(5);
  });
});
