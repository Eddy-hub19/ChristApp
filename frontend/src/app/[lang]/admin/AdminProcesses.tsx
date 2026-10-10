"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AdminHttpError,
  adminServerQueryOptions,
  type AdminMetricSample,
} from "@/lib/queries/adminQueries";
import { evaluateServerHealth, type HealthLevel } from "@/lib/adminHealth";
import styles from "./admin.module.scss";

function formatUptime(totalSec: number): string {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м ${totalSec % 60}с`;
}

/** Мини-график по истории зразков (inline SVG, без библиотек). */
function Sparkline({
  samples,
  pick,
}: {
  samples: AdminMetricSample[];
  pick: (s: AdminMetricSample) => number;
}) {
  if (samples.length < 2) return <div className={styles.sparkEmpty} />;
  const values = samples.map(pick);
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 28;
  const points = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * w).toFixed(2)},${(h - (v / max) * (h - 2) - 1).toFixed(2)}`,
    )
    .join(" ");
  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Dot({ level }: { level: HealthLevel }) {
  return (
    <span className={`${styles.dot} ${styles[`dot_${level}`]}`} aria-hidden />
  );
}

function Stat({
  label,
  value,
  sub,
  level,
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  level?: HealthLevel;
  spark?: React.ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>
        {level ? <Dot level={level} /> : null}
        {label}
      </div>
      <div className={styles.statValue}>{value}</div>
      {sub ? <div className={styles.statSub}>{sub}</div> : null}
      {spark}
    </div>
  );
}

export default function AdminProcesses({ active }: { active: boolean }) {
  const t = useTranslations("admin");
  const query = useQuery(adminServerQueryOptions(active));
  const data = query.data;

  if (!data) {
    if (query.error) {
      const e = query.error;
      return (
        <p className={styles.error}>
          {e instanceof AdminHttpError
            ? t("procLoadFailed", { status: e.status })
            : t("procLoadFailedGeneric")}
        </p>
      );
    }
    return <p className={styles.meta}>{t("procLoading")}</p>;
  }

  const health = evaluateServerHealth(data);
  const latest = data.latest;
  const history = data.history;
  const memUsedPct = Math.round(
    ((data.host.totalMemMb - data.host.freeMemMb) / data.host.totalMemMb) * 100,
  );

  return (
    <div className={styles.procRoot}>
      <div className={styles.healthBar}>
        <Dot level={health.overall} />
        <strong>
          {health.overall === "ok"
            ? t("procHealthOk")
            : health.overall === "warn"
              ? t("procHealthWarn")
              : t("procHealthBad")}
        </strong>
        <span className={styles.meta}>
          {t("procUptime")}: {formatUptime(data.process.uptimeSec)}
        </span>
      </div>
      <p className={styles.meta}>
        {t("procUpdated", {
          time: new Date(data.generatedAt).toLocaleTimeString(),
        })}
        {query.error ? ` · ${t("procLoadFailedGeneric")}` : ""}
      </p>

      <section className={styles.procSection}>
        <h2 className={styles.procHeading}>{t("procSecProcess")}</h2>
        <div className={styles.statGrid}>
          <Stat
            label={t("procCpu")}
            level={health.cpu}
            value={latest ? `${latest.cpuPercent}%` : "—"}
            sub={latest ? undefined : t("procNoSamples")}
            spark={<Sparkline samples={history} pick={(s) => s.cpuPercent} />}
          />
          <Stat
            label={t("procLoopLag")}
            level={health.loopLag}
            value={latest ? `${latest.loopLagP99Ms} мс` : "—"}
            sub={
              latest
                ? t("procLoopLagMax", { ms: latest.loopLagMaxMs })
                : undefined
            }
            spark={<Sparkline samples={history} pick={(s) => s.loopLagP99Ms} />}
          />
          <Stat
            label={t("procRss")}
            value={`${data.process.rssMb} МБ`}
            spark={<Sparkline samples={history} pick={(s) => s.rssMb} />}
          />
          <Stat
            label={t("procHeap")}
            value={`${data.process.heapUsedMb} / ${data.process.heapTotalMb} МБ`}
            spark={<Sparkline samples={history} pick={(s) => s.heapUsedMb} />}
          />
        </div>
        <p className={styles.metaSmall}>{t("procHistoryHint")}</p>
      </section>

      <section className={styles.procSection}>
        <h2 className={styles.procHeading}>{t("procSecDb")}</h2>
        <div className={styles.statGrid}>
          <Stat
            label={t("procDbPing")}
            level={health.db}
            value={data.db.ok ? `${data.db.pingMs} мс` : t("procDbDown")}
          />
          <Stat
            label={t("procPool")}
            level={health.pool}
            value={t("procPoolValue", {
              total: data.db.pool.total,
              max: data.db.pool.max,
              idle: data.db.pool.idle,
            })}
            sub={
              data.db.pool.waiting > 0
                ? t("procPoolWaiting", { count: data.db.pool.waiting })
                : undefined
            }
          />
        </div>
      </section>

      <section className={styles.procSection}>
        <h2 className={styles.procHeading}>{t("procSecRealtime")}</h2>
        <div className={styles.statGrid}>
          <Stat
            label={t("procSockets")}
            value={String(data.realtime.connectedSockets)}
          />
          <Stat
            label={t("procOnline")}
            value={String(data.realtime.onlineUsers)}
          />
          <Stat
            label={t("procRooms")}
            value={String(data.realtime.activeRooms)}
          />
          <Stat
            label={t("procUsers")}
            value={t("procUsersValue", {
              active: data.users.active,
              total: data.users.total,
            })}
          />
        </div>
      </section>

      <section className={styles.procSection}>
        <h2 className={styles.procHeading}>{t("procSecHost")}</h2>
        <div className={styles.statGrid}>
          <Stat
            label={t("procLoad")}
            value={data.host.loadAvg.join(" · ")}
            sub={`${data.host.cpuCount} CPU`}
          />
          <Stat
            label={t("procFreeMem")}
            value={`${data.host.freeMemMb} / ${data.host.totalMemMb} МБ`}
            sub={`${memUsedPct}%`}
          />
          <Stat
            label={t("procNode")}
            value={data.process.nodeVersion}
            sub={`${t("procPid")} ${data.process.pid}`}
          />
        </div>
      </section>
    </div>
  );
}
