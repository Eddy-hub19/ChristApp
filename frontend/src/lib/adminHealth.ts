import type { AdminServerStatus } from "@/lib/queries/adminQueries";

export type HealthLevel = "ok" | "warn" | "bad";

/** Пороги «светофора» для вкладки «Процессы». */
export const HEALTH_THRESHOLDS = {
  cpuWarn: 80,
  loopLagWarnMs: 100,
  loopLagBadMs: 500,
  dbPingWarnMs: 300,
  dbPingBadMs: 1500,
} as const;

const worst = (a: HealthLevel, b: HealthLevel): HealthLevel =>
  a === "bad" || b === "bad"
    ? "bad"
    : a === "warn" || b === "warn"
      ? "warn"
      : "ok";

export function levelByThreshold(
  value: number,
  warn: number,
  bad?: number,
): HealthLevel {
  if (bad !== undefined && value >= bad) return "bad";
  return value >= warn ? "warn" : "ok";
}

export type ServerHealth = {
  overall: HealthLevel;
  cpu: HealthLevel;
  loopLag: HealthLevel;
  db: HealthLevel;
  pool: HealthLevel;
};

/** Оценивает состояние сервера по снимку `/admin/server`. */
export function evaluateServerHealth(status: AdminServerStatus): ServerHealth {
  const t = HEALTH_THRESHOLDS;
  const cpu = levelByThreshold(status.latest?.cpuPercent ?? 0, t.cpuWarn);
  const loopLag = levelByThreshold(
    status.latest?.loopLagP99Ms ?? 0,
    t.loopLagWarnMs,
    t.loopLagBadMs,
  );
  const db: HealthLevel = status.db.ok
    ? levelByThreshold(status.db.pingMs, t.dbPingWarnMs, t.dbPingBadMs)
    : "bad";
  const pool: HealthLevel = status.db.pool.waiting > 0 ? "warn" : "ok";
  const overall = [cpu, loopLag, db, pool].reduce(worst, "ok" as HealthLevel);
  return { overall, cpu, loopLag, db, pool };
}

/**
 * Світлофор для коефіцієнта швидкості CPU (у скільки разів ядро повільніше за M2):
 * до 2.5x арена на 2-6 гравців вкладається в безкоштовний бюджет; 2.5-4x - на межі; далі - не вкладається.
 */
export const CPU_SLOWDOWN_THRESHOLDS = { warn: 2.5, bad: 4 } as const;

export function evaluateCpuSlowdown(slowdown: number): HealthLevel {
  return levelByThreshold(slowdown, CPU_SLOWDOWN_THRESHOLDS.warn, CPU_SLOWDOWN_THRESHOLDS.bad);
}
