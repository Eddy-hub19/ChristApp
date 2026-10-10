import { percentile, summarizeLatency } from './db-latency.service';

describe('summarizeLatency', () => {
  it('reports median, p95, min and max of the samples', () => {
    const samples = Array.from({ length: 50 }, (_, i) => 90 + i); // 90..139
    const r = summarizeLatency(samples, new Date('2026-10-11T00:00:00Z'));
    expect(r.samples).toBe(50);
    expect(r.medianMs).toBe(114);
    expect(r.p95Ms).toBe(137);
    expect(r.minMs).toBe(90);
    expect(r.maxMs).toBe(139);
    expect(r.measuredAt).toBe('2026-10-11T00:00:00.000Z');
  });

  it('is safe on an empty list', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(summarizeLatency([], new Date()).p95Ms).toBe(0);
  });
});
