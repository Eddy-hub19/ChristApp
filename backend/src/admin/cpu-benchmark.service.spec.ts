import {
  ARENA_BASE_MS,
  ARENA_PER_PLAYER_MS,
  buildResult,
  CpuBenchmarkService,
  cpuWorkload,
  measureCpuMs,
  REF_M2_MS,
} from './cpu-benchmark.service';

describe('buildResult', () => {
  it('takes the median and expresses it relative to the M2 reference', () => {
    const runs = [5.8, 5.8, 5.8, 5.8, 11.6, 11.6, 11.6, 11.6, 100];
    const r = buildResult(runs, new Date('2026-10-10T10:00:00Z'));
    expect(r.medianMs).toBe(11.6); // викид 100 не впливає
    expect(r.refMs).toBe(REF_M2_MS);
    expect(r.slowdown).toBe(2);
    expect(r.measuredAt).toBe('2026-10-10T10:00:00.000Z');
  });

  it('estimates arena cost as a share of the 0.1 vCPU free budget, scaled by the slowdown', () => {
    const same = buildResult(Array(9).fill(REF_M2_MS), new Date());
    const six = same.arena.find((a) => a.players === 6)!;
    expect(six.cpuMsPerSec).toBeCloseTo(
      ARENA_BASE_MS + ARENA_PER_PLAYER_MS * 6,
      1,
    );
    expect(six.budgetPercent).toBe(33); // як у docs/flock-perf.md
    const slow = buildResult(Array(9).fill(REF_M2_MS * 4), new Date());
    expect(slow.arena.find((a) => a.players === 2)!.budgetPercent).toBe(100);
    expect(slow.arena.find((a) => a.players === 6)!.budgetPercent).toBe(134);
    expect(slow.arena.map((a) => a.players)).toEqual([2, 3, 4, 6]);
  });
});

describe('CpuBenchmarkService', () => {
  it('has no result until the first run; keeps the last result in memory', () => {
    const svc = new CpuBenchmarkService(
      () => 6,
      () => new Date('2026-10-10T10:00:00Z'),
    );
    expect(svc.latest()).toBeNull();
    const { result, cached } = svc.run();
    expect(cached).toBe(false);
    expect(result.slowdown).toBeCloseTo(6 / REF_M2_MS, 2);
    expect(svc.latest()).toBe(result);
  });

  it('discards the JIT warm-up run and measures 9 runs', () => {
    const calls: number[] = [];
    const svc = new CpuBenchmarkService(
      () => {
        calls.push(1);
        return calls.length === 1 ? 500 : 6; // прогрів повільний
      },
      () => new Date(),
    );
    const { result } = svc.run();
    expect(calls).toHaveLength(10);
    expect(result.runsMs).toHaveLength(9);
    expect(Math.max(...result.runsMs)).toBe(6);
  });

  it('does not re-run within the 3 s cooldown, but does afterwards', () => {
    let t = 1_000_000;
    let measured = 0;
    const svc = new CpuBenchmarkService(
      () => ++measured && 6,
      () => new Date(t),
    );
    svc.run();
    const afterFirst = measured;
    t += 1000;
    expect(svc.run().cached).toBe(true);
    expect(measured).toBe(afterFirst);
    t += 3000;
    expect(svc.run().cached).toBe(false);
    expect(measured).toBeGreaterThan(afterFirst);
  });
});

describe('measureCpuMs', () => {
  it('measures CPU time of the real workload (a few ms, finite)', () => {
    const ms = measureCpuMs(cpuWorkload);
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThan(0.5);
    expect(ms).toBeLessThan(500);
  });
});
