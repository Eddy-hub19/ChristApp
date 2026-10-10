import { AsyncLimiter } from './async-limiter';

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
