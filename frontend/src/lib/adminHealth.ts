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

/**
 * Доля бюджета CPU инстанса, %. `cpuPercent` меряется от одного ядра (100 = 1000 мс CPU/с), а Render душит процесс
 * по квоте (0.5 vCPU = 500 мс/с), поэтому «светофор» смотрит на долю квоты, а не ядра.
 */
export function cpuBudgetShare(status: AdminServerStatus): number {
  const budgetMs = status.cpuBudgetMs && status.cpuBudgetMs > 0 ? status.cpuBudgetMs : 1000;
  return Math.round(((status.latest?.cpuPercent ?? 0) * 10 / budgetMs) * 1000) / 10;
}

/** Оценивает состояние сервера по снимку `/admin/server`. */
export function evaluateServerHealth(status: AdminServerStatus): ServerHealth {
  const t = HEALTH_THRESHOLDS;
  const cpu = levelByThreshold(cpuBudgetShare(status), t.cpuWarn);
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

/** Світлофор для частки бюджету CPU, яку займає арена "Отара": до 75% - комфортно, 75-100% - на межі, далі - не вкладається. */
export function evaluateArenaBudget(percent: number): HealthLevel {
  return levelByThreshold(percent, 75, 100);
}
