import { Injectable } from '@nestjs/common';

/** Медіана воркоду на Apple M2 (3 запуски: 5.7-6.0 мс), мс CPU. Дзеркало backend/scripts/cpu-calibrate.js. */
export const REF_M2_MS = 5.8;
const RUNS = 9;
/** Не частіше за раз на 3 с: замір синхронний (~60 мс блокує event loop) - не даємо його заспамити. */
const COOLDOWN_MS = 3_000;

/**
 * Орієнтовна ціна арени "Отара" в мс CPU/с на еталонному M2 (docs/flock-perf.md, прод-конфіг 10 Гц):
 * ~20.65 мс постійно + ~2.125 мс на кожного гравця (2 -> 24.9, 6 -> 33.4).
 */
export const ARENA_BASE_MS = 20.65;
export const ARENA_PER_PLAYER_MS = 2.125;
/**
 * Бюджет CPU за замовчуванням, мс CPU/с: Node однопотоковий і на сервері (2 vCPU) використовує одне ядро = 1000 мс/с.
 * Змінюється змінною `CPU_BUDGET_MS`.
 */
export const CPU_BUDGET_MS = 1000;
export const DEFAULT_CPU_BUDGET_MS = CPU_BUDGET_MS;

/** Бюджет CPU (мс/с): `CPU_BUDGET_MS`, запасне старе ім'я `RENDER_CPU_BUDGET_MS`; сміття й нуль -> CPU_BUDGET_MS (1000). */
export function resolveCpuBudgetMs(
  raw: string | undefined = process.env.CPU_BUDGET_MS ??
    process.env.RENDER_CPU_BUDGET_MS,
): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : CPU_BUDGET_MS;
}
const ESTIMATE_PLAYERS = [2, 3, 4, 6] as const;

/** Суміш арифметики, Map і Buffer (схоже на тік арени й socket.io), без залежностей. */
export function cpuWorkload(): number {
  let acc = 0;
  const m = new Map<number, number>();
  for (let i = 0; i < 400000; i++) {
    acc += Math.hypot(i % 97, i % 31) + Math.sqrt(i);
    if (i % 4 === 0) m.set(i & 4095, acc);
  }
  const b = Buffer.alloc(65536);
  for (let r = 0; r < 60; r++) {
    for (let i = 0; i < b.length; i += 7) b[i] = (acc + i) & 255;
  }
  return acc + m.size;
}

/** Час CPU (мс), який пішов на воркод. CPU-час, а не стінний: тротлінг квоти Render не роздуває результат. */
export function measureCpuMs(work: () => unknown = cpuWorkload): number {
  const before = process.cpuUsage();
  work();
  const d = process.cpuUsage(before);
  return (d.user + d.system) / 1000;
}

export type CpuBenchmarkResult = {
  /** ISO-час замірy. */
  measuredAt: string;
  /** Медіана 9 прогонів воркоду, мс CPU. */
  medianMs: number;
  runsMs: number[];
  /** Еталон M2, мс. */
  refMs: number;
  /** У скільки разів ядро цього сервера повільніше за M2 (1 = як M2). */
  slowdown: number;
  /** Бюджет CPU, мс CPU/с (CPU_BUDGET_MS). */
  budgetMs: number;
  /** Скільки відсотків бюджету CPU з'їсть арена з N гравців. */
  arena: { players: number; cpuMsPerSec: number; budgetPercent: number }[];
};

export function buildResult(
  runsMs: number[],
  measuredAt: Date,
  budgetMs: number = resolveCpuBudgetMs(),
): CpuBenchmarkResult {
  const sorted = [...runsMs].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const slowdown = medianMs / REF_M2_MS;
  const round = (n: number, k = 100) => Math.round(n * k) / k;
  return {
    measuredAt: measuredAt.toISOString(),
    medianMs: round(medianMs),
    runsMs: runsMs.map((r) => round(r)),
    refMs: REF_M2_MS,
    slowdown: round(slowdown),
    budgetMs,
    arena: ESTIMATE_PLAYERS.map((players) => {
      const cpuMsPerSec =
        (ARENA_BASE_MS + ARENA_PER_PLAYER_MS * players) * slowdown;
      return {
        players,
        cpuMsPerSec: round(cpuMsPerSec, 10),
        budgetPercent: Math.round((cpuMsPerSec / budgetMs) * 100),
      };
    }),
  };
}

/**
 * Замір швидкості ядра цього сервера відносно еталонного M2 (для рішення про maxHumansPerArena на слабкому тарифі,
 * де немає Shell). Результат тримається в памʼяті процесу - до перезапуску.
 */
@Injectable()
export class CpuBenchmarkService {
  private last: CpuBenchmarkResult | null = null;
  private lastAt = 0;

  constructor(
    private readonly measure: () => number = () => measureCpuMs(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  latest(): CpuBenchmarkResult | null {
    return this.last;
  }

  /** Запускає замір (або повертає свіжий результат, якщо минуло <3 с). */
  run(): { result: CpuBenchmarkResult; cached: boolean } {
    const now = this.now();
    if (this.last && now.getTime() - this.lastAt < COOLDOWN_MS) {
      return { result: this.last, cached: true };
    }
    // прогрів JIT: перший прогін завжди повільніший і відкидається
    this.measure();
    const runs: number[] = [];
    for (let i = 0; i < RUNS; i++) runs.push(this.measure());
    this.last = buildResult(runs, now);
    this.lastAt = now.getTime();
    return { result: this.last, cached: false };
  }
}
