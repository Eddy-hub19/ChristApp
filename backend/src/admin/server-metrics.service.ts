import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

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

  onModuleInit() {
    this.loopDelay.enable();
    // Відлік CPU — від старту моніторингу, а не від запуску процесу (інакше перший зразок показує вантаж бутстрапу).
    this.lastCpu = process.cpuUsage();
    this.lastAt = Date.now();
    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.loopDelay.disable();
  }

  private sample() {
    const now = Date.now();
    const cpu = process.cpuUsage(this.lastCpu);
    const mem = process.memoryUsage();
    const sample: MetricSample = {
      t: now,
      cpuPercent: computeCpuPercent(cpu.user, cpu.system, now - this.lastAt),
      rssMb: toMb(mem.rss),
      heapUsedMb: toMb(mem.heapUsed),
      loopLagP50Ms: toLagMs(this.loopDelay.percentile(50)),
      loopLagP99Ms: toLagMs(this.loopDelay.percentile(99)),
      loopLagMaxMs: toLagMs(this.loopDelay.max),
    };
    this.lastCpu = process.cpuUsage();
    this.lastAt = now;
    this.loopDelay.reset();
    this.history.push(sample);
    if (this.history.length > HISTORY_LENGTH) this.history.shift();
  }

  snapshot() {
    const mem = process.memoryUsage();
    return {
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
