import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const SAMPLES = 50;
/** Не частіше за раз на 10 с: замір послідовно робить 50 запитів до БД. */
const COOLDOWN_MS = 10_000;

export type DbLatencyResult = {
  measuredAt: string;
  samples: number;
  /** Чистий мережевий RTT до БД: `SELECT 1` на одному з'єднанні, мс. */
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarizeLatency(
  samplesMs: number[],
  measuredAt: Date,
): DbLatencyResult {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    measuredAt: measuredAt.toISOString(),
    samples: sorted.length,
    medianMs: r(percentile(sorted, 0.5)),
    p95Ms: r(percentile(sorted, 0.95)),
    minMs: r(sorted[0] ?? 0),
    maxMs: r(sorted[sorted.length - 1] ?? 0),
  };
}

/**
 * Чиста мережева затримка до БД: 50 послідовних `SELECT 1` на одному з'єднанні пулу. Іде в обхід Prisma
 * (прямий pg-клієнт), тож не потрапляє в лічильник запитів і не чекає на ORM. Результат тримається в пам'яті;
 * перший замір - через 15 с після старту, далі - за кнопкою в адмінці.
 */
@Injectable()
export class DbLatencyService implements OnModuleInit, OnModuleDestroy {
  private last: DbLatencyResult | null = null;
  private lastAt = 0;
  private running: Promise<DbLatencyResult> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.bootTimer = setTimeout(
      () => void this.measure().catch(() => {}),
      15_000,
    );
    this.bootTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }

  latest(): DbLatencyResult | null {
    return this.last;
  }

  /** Запускає замір (або віддає свіжий результат / поточний замір, якщо він уже йде). */
  async measure(): Promise<{ result: DbLatencyResult; cached: boolean }> {
    if (this.running) return { result: await this.running, cached: true };
    if (this.last && Date.now() - this.lastAt < COOLDOWN_MS) {
      return { result: this.last, cached: true };
    }
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return { result: await this.running, cached: false };
  }

  private async run(): Promise<DbLatencyResult> {
    const client = await this.prisma.pool.connect();
    try {
      await client.query('SELECT 1'); // прогрів: перший запит на з'єднанні дорожчий
      const samples: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const t = performance.now();
        await client.query('SELECT 1');
        samples.push(performance.now() - t);
      }
      this.last = summarizeLatency(samples, new Date());
      this.lastAt = Date.now();
      return this.last;
    } finally {
      client.release();
    }
  }
}
