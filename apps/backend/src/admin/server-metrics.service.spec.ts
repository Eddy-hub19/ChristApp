import {
  computeCpuPercent,
  ServerMetricsService,
} from './server-metrics.service';

describe('computeCpuPercent', () => {
  it('converts cpu microseconds over an interval into % of one core', () => {
    // 2.5 с CPU за 5 с стінного часу = 50 %
    expect(computeCpuPercent(2_000_000, 500_000, 5_000)).toBe(50);
  });

  it('never returns negative or NaN for a zero/invalid interval', () => {
    expect(computeCpuPercent(1, 1, 0)).toBe(0);
    expect(computeCpuPercent(-5, 0, 1000)).toBe(0);
  });
});

describe('ServerMetricsService', () => {
  it('exposes process info and records samples on the interval', () => {
    jest.useFakeTimers();
    const service = new ServerMetricsService();
    service.onModuleInit();

    expect(service.snapshot().process.pid).toBe(process.pid);
    expect(service.snapshot().latest).toBeNull();

    jest.advanceTimersByTime(15_000);
    const snap = service.snapshot();
    service.onModuleDestroy();
    jest.useRealTimers();

    expect(snap.history.length).toBe(3);
    expect(snap.latest?.rssMb).toBeGreaterThan(0);
    expect(snap.latest?.loopLagP99Ms).toBeGreaterThanOrEqual(0);
  });
});
