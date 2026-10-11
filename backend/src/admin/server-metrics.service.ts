import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveCpuBudgetMs } from './cpu-benchmark.service';

const SAMPLE_INTERVAL_MS = 5_000;
/** Період опитування гістограми: Node включає його в кожне значення, тож віднімаємо, щоб порожній цикл давав ~0. */
const LOOP_RESOLUTION_MS = 10;
/** 60 × 5 с = 5 хвилин історії для міні-графіків. */
const HISTORY_LENGTH = 60;

export type MetricSample = {
  /** Unix ms. */
  t: number;
  /** Завантаження одного ядра процесом Node, %. */
  cpuPercent: number;
  rssMb: number;
  heapUsedMb: number;
  /** Затримка event loop за інтервал, мс. */
  loopLagP50Ms: number;
  loopLagP99Ms: number;
  loopLagMaxMs: number;
  /** Найбільша черга на з'єднання з пулом БД за інтервал (0 = пул ні разу не був вичерпаний). */
  dbPoolWaitingMax: number;
  /** Запитів до БД за секунду (середнє за інтервал). */
  dbQueriesPerSec: number;
};

/** CPU-навантаження процесу за інтервал (у % одного ядра) за приростом `process.cpuUsage()`. */
export function computeCpuPercent(
  deltaUserMicros: number,
  deltaSystemMicros: number,
  elapsedMs: number,
): number {
  if (elapsedMs <= 0) return 0;
  const percent =
    ((deltaUserMicros + deltaSystemMicros) / (elapsedMs * 1000)) * 100;
  return Math.round(Math.max(0, percent) * 10) / 10;
}

const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const toLagMs = (nanos: number) =>
  Number.isFinite(nanos)
    ? Math.round(Math.max(0, nanos / 1e6 - LOOP_RESOLUTION_MS) * 10) / 10
    : 0;

/**
 * Фоновий збір метрик процесу (CPU, пам'ять, затримка event loop): раз на 5 с знімає зразок у кільцевий буфер,
 * щоб адмінка бачила не лише «зараз», а й останні 5 хвилин. Таймер unref'нутий — не тримає процес живим.
 */
@Injectable()
export class ServerMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly loopDelay = monitorEventLoopDelay({
    resolution: LOOP_RESOLUTION_MS,
  });
  private readonly history: MetricSample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCpu = process.cpuUsage();
  private lastAt = Date.now();
  private poolTimer: ReturnType<typeof setInterval> | null = null;
  private poolWaitingMax = 0;
  private lastQueryTotal = 0;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  onModuleInit() {
    this.loopDelay.enable();
    // Відлік CPU — від старту моніторингу, а не від запуску процесу (інакше перший зразок показує вантаж бутстрапу).
    this.lastCpu = process.cpuUsage();
    this.lastAt = Date.now();
    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
    // Черга пулу миготить за долі секунди: раз на 5 с її можна не побачити, тож стежимо щосекунди й беремо максимум.
    this.lastQueryTotal = this.prisma?.queryStats.totalRecorded() ?? 0;
    this.poolTimer = setInterval(() => {
      this.poolWaitingMax = Math.max(
        this.poolWaitingMax,
        this.prisma?.pool.waitingCount ?? 0,
      );
    }, 1_000);
    this.poolTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.poolTimer) clearInterval(this.poolTimer);
    this.poolTimer = null;
    this.loopDelay.disable();
  }

  private sample() {
    const now = Date.now();
    const cpu = process.cpuUsage(this.lastCpu);
    const mem = process.memoryUsage();
    const queryTotal = this.prisma?.queryStats.totalRecorded() ?? 0;
    const elapsedSec = Math.max(0.001, (now - this.lastAt) / 1000);
    const sample: MetricSample = {
      t: now,
      cpuPercent: computeCpuPercent(cpu.user, cpu.system, now - this.lastAt),
      rssMb: toMb(mem.rss),
      heapUsedMb: toMb(mem.heapUsed),
      loopLagP50Ms: toLagMs(this.loopDelay.percentile(50)),
      loopLagP99Ms: toLagMs(this.loopDelay.percentile(99)),
      loopLagMaxMs: toLagMs(this.loopDelay.max),
      dbPoolWaitingMax: Math.max(
        this.poolWaitingMax,
        this.prisma?.pool.waitingCount ?? 0,
      ),
      dbQueriesPerSec:
        Math.round(((queryTotal - this.lastQueryTotal) / elapsedSec) * 10) / 10,
    };
    this.poolWaitingMax = 0;
    this.lastQueryTotal = queryTotal;
    this.lastCpu = process.cpuUsage();
    this.lastAt = now;
    this.loopDelay.reset();
    this.history.push(sample);
    if (this.history.length > HISTORY_LENGTH) this.history.shift();
  }

  snapshot() {
    const mem = process.memoryUsage();
    return {
      /** Бюджет CPU інстанса, мс CPU/с (RENDER_CPU_BUDGET_MS): cpuPercent 100 = 1000 мс/с. */
      cpuBudgetMs: resolveCpuBudgetMs(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        uptimeSec: Math.round(process.uptime()),
        rssMb: toMb(mem.rss),
        heapUsedMb: toMb(mem.heapUsed),
        heapTotalMb: toMb(mem.heapTotal),
        externalMb: toMb(mem.external),
      },
      host: {
        cpuCount: os.cpus().length,
        loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
        totalMemMb: toMb(os.totalmem()),
        freeMemMb: toMb(os.freemem()),
      },
      latest: this.history[this.history.length - 1] ?? null,
      history: [...this.history],
    };
  }
}
