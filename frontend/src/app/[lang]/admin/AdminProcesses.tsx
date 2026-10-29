"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AdminHttpError,
  adminCpuBenchmarkQueryOptions,
  adminServerQueryOptions,
  runAdminCpuBenchmark,
  runAdminDbLatency,
} from "@/lib/queries/adminQueries";
import { queryKeys } from "@/lib/queryKeys";
import { cpuBudgetShare, evaluateArenaBudget, evaluateDbRtt, evaluateServerHealth, type HealthLevel } from "@/lib/adminHealth";
import type { AdminFlockArena, AdminFlockDecision, AdminFlockMaps, AdminFlockSay } from "@/lib/queries/adminQueries";
import { setAdminFlockMute, setAdminFlockNextMap } from "@/lib/queries/adminQueries";
import styles from "./admin.module.scss";

function formatUptime(totalSec: number): string {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м ${totalSec % 60}с`;
}

/** Мини-график по ряду значений (inline SVG, без библиотек). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className={styles.sparkEmpty} />;
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

const flockLevelDot: Record<AdminFlockDecision["level"], HealthLevel> = { low: "ok", normal: "ok", high: "bad" };

/** Арены «Отари»: сколько людей и ботов, нагрузка арены и решения регулятора (кого убрали/вернули и почему). */
const MAP_KEYS = ["meadow", "grove", "frost", "volcano"] as const;

/** Карта «Отари»: текущая карта арен, когда она сменится для новых игроков, и принудительный выбор карты следующей арены (сервер проверяет права). */
function FlockMapControl({ arenas, maps }: { arenas: AdminFlockArena[]; maps?: AdminFlockMaps }) {
  const t = useTranslations("admin.flockMap");
  const tf = useTranslations("flock.mapNames");
  const queryClient = useQueryClient();
  const set = useMutation({
    mutationFn: (body: { mapId?: number | null; retire?: boolean }) => setAdminFlockNextMap(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.server() }),
  });
  const name = (id: number | undefined) => tf(MAP_KEYS[id ?? 0] ?? MAP_KEYS[0]);
  const normal = arenas.filter((a) => a.mode !== "circle");
  const next = maps?.nextMap ?? null;
  const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={styles.procSection}>
      <h3 className={styles.procSubheading}>{t("title")}</h3>
      {normal.length === 0 ? <p className={styles.metaSmall}>{t("noArena")}</p> : null}
      {normal.map((a) => (
        <p key={a.id} className={styles.metaSmall}>
          #{a.id}: {t("current", { map: name(a.mapId) })} ·{" "}
          {a.mapChangesAt === 0 || a.mapChangesAt === undefined || a.mapChangesAt === null
            ? t("changed")
            : t("changes", { time: timeOf(a.mapChangesAt) })}
        </p>
      ))}
      <p className={styles.metaSmall}>{next === null ? t("nextNone") : t("nextSet", { map: name(next) })}</p>
      <div className={styles.pills} role="group" aria-label={t("next")}>
        {MAP_KEYS.map((k, id) => (
          <button
            key={k}
            type="button"
            aria-pressed={next === id}
            className={`${styles.filterPill} ${next === id ? styles.filterPillActive : ""}`}
            disabled={set.isPending}
            onClick={() => set.mutate({ mapId: id })}
          >
            {name(id)}
          </button>
        ))}
        <button type="button" className={styles.pill} disabled={set.isPending || next === null} onClick={() => set.mutate({ mapId: null })}>
          {t("clear")}
        </button>
        <button type="button" className={styles.btnGhost} disabled={set.isPending || normal.length === 0} onClick={() => set.mutate({ retire: true })}>
          {t("switchNow")}
        </button>
      </div>
      <p className={styles.metaSmall}>{t("hint")}</p>
    </div>
  );
}

function FlockSection({ arenas, says, maps }: { arenas: AdminFlockArena[]; says: AdminFlockSay[]; maps?: AdminFlockMaps }) {
  const t = useTranslations("admin");
  const ms = (v: number) => t("procFlockMs", { value: v.toFixed(1) });
  return (
    <section className={styles.procSection}>
      <h2 className={styles.procHeading}>{t("procSecFlock")}</h2>
      <FlockMapControl arenas={arenas} maps={maps} />
      {arenas.length === 0 ? <p className={styles.metaSmall}>{t("procFlockNone")}</p> : null}
      {arenas.map((a) => (
        <div key={a.id}>
          <h3 className={styles.procSubheading}>{t("procFlockArena", { id: a.id })}</h3>
          <div className={styles.statGrid}>
            <Stat label={t("procFlockPlayers")} value={String(a.humans)} />
            <Stat
              label={t("procFlockBots")}
              value={t("procFlockBotsValue", { active: a.botsActive, target: a.botsTarget })}
              sub={a.botsRetiring > 0 ? t("procFlockLeaving", { count: a.botsRetiring }) : undefined}
            />
            <Stat
              label={t("procFlockCap")}
              value={a.botsLoadCap === null ? t("procFlockNoCap") : String(a.botsLoadCap)}
              level={a.botsLoadCap === null ? "ok" : "warn"}
            />
            <Stat label={t("procFlockHz")} value={`${a.hz}`} level={a.hz >= 10 ? "ok" : "warn"} />
            {a.load ? (
              <>
                <Stat label={t("procFlockLate")} value={ms(a.load.lateMs)} />
                <Stat label={t("procFlockLoop")} value={ms(a.load.loopP99Ms)} />
                <Stat label={t("procFlockCpu")} value={`${a.load.cpuPct.toFixed(1)}%`} />
              </>
            ) : null}
          </div>
          <h3 className={styles.procSubheading}>{t("procFlockDecisions")}</h3>
          {a.decisions.length === 0 ? (
            <p className={styles.metaSmall}>{t("procFlockNoDecisions")}</p>
          ) : (
            <ul className={styles.metaSmall}>
              {[...a.decisions].reverse().map((d) => (
                <li key={d.at}>
                  <Dot level={flockLevelDot[d.level]} />{" "}
                  {new Date(d.at).toLocaleTimeString()} · {t(`procFlockLevel_${d.level}`)} · {t(`procFlockAct_${d.action}`)}
                  {d.reasons.length > 0 ? ` (${d.reasons.map((r) => t(`procFlockReason_${r}`)).join(", ")})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <FlockSays says={says} />
    </section>
  );
}

/** Останні 100 своїх текстів гравців «Отари» з пам'яті сервера (БД не пишемо; після перезапуску порожньо) і кнопка «Заглушити». */
function FlockSays({ says }: { says: AdminFlockSay[] }) {
  const t = useTranslations("admin");
  const [busy, setBusy] = useState<string | null>(null);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const mute = async (userId: string) => {
    setBusy(userId);
    try {
      await setAdminFlockMute(userId, 15);
      setMuted((s) => new Set(s).add(userId));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <h3 className={styles.procSubheading}>{t("procFlockSays")}</h3>
      {says.length === 0 ? (
        <p className={styles.metaSmall}>{t("procFlockSaysNone")}</p>
      ) : (
        <ul className={styles.metaSmall}>
          {says.map((s, i) => (
            <li key={`${s.at}-${i}`}>
              {new Date(s.at).toLocaleTimeString()} · <strong>{s.name}</strong>: {s.text}{" "}
              {s.mutedUntil || muted.has(s.userId) ? (
                <em>{t("procFlockSayMuted")}</em>
              ) : (
                <button type="button" disabled={busy === s.userId} onClick={() => void mute(s.userId)}>
                  {t("procFlockSayMute")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
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

/** Замір швидкості ядра сервера відносно M2: кнопка, коефіцієнт, оцінка навантаження арени "Отара". */
function CpuBenchmark({ active }: { active: boolean }) {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const latest = useQuery(adminCpuBenchmarkQueryOptions(active));
  const run = useMutation({
    mutationFn: runAdminCpuBenchmark,
    onSuccess: (result) => queryClient.setQueryData(queryKeys.admin.cpuBenchmark(), result),
  });
  const result = run.data ?? latest.data ?? null;

  return (
    <section className={styles.procSection}>
      <h2 className={styles.procHeading}>{t("procSecBench")}</h2>
      <div className={styles.benchRow}>
        <button type="button" className={styles.benchBtn} onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? t("procBenchRunning") : t("procBenchButton")}
        </button>
        {result ? (
          <span className={styles.meta}>
            {t("procBenchAt", { time: new Date(result.measuredAt).toLocaleTimeString() })}
          </span>
        ) : null}
      </div>
      {run.error ? (
        <p className={styles.error}>
          {run.error instanceof AdminHttpError
            ? t("procLoadFailed", { status: run.error.status })
            : t("procLoadFailedGeneric")}
        </p>
      ) : null}
      {result ? (
        <>
          <div className={styles.statGrid}>
            <Stat
              label={t("procBenchFactor")}
              level={evaluateArenaBudget(Math.max(...result.arena.map((a) => a.budgetPercent)))}
              value={`×${result.slowdown}`}
              sub={t("procBenchDetail", { ms: result.medianMs, ref: result.refMs })}
            />
            {result.arena.map((a) => (
              <Stat
                key={a.players}
                label={t("procBenchArena", { count: a.players })}
                level={evaluateArenaBudget(a.budgetPercent)}
                value={`${a.budgetPercent}%`}
                sub={t("procBenchArenaSub", { ms: a.cpuMsPerSec })}
              />
            ))}
          </div>
          <p className={styles.metaSmall}>{t("procBenchHint", { vcpu: Math.round((result.budgetMs / 1000) * 100) / 100, ms: result.budgetMs })}</p>
        </>
      ) : (
        <p className={styles.metaSmall}>{latest.isLoading ? t("procLoading") : t("procBenchNone")}</p>
      )}
    </section>
  );
}

export default function AdminProcesses({ active }: { active: boolean }) {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const query = useQuery(adminServerQueryOptions(active));
  const latencyRun = useMutation({
    mutationFn: runAdminDbLatency,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.server() }),
  });
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
  const queries = data.db.queries;
  const latency = data.db.latency ?? null;
  const dbLoc = data.db.location?.database ?? null;
  const serverLoc = data.db.location?.server ?? null;
  const regionMismatch = Boolean(dbLoc?.region && serverLoc?.awsRegion && dbLoc.region !== serverLoc.awsRegion);
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
            sub={latest ? t("procCpuBudget", { percent: cpuBudgetShare(data), ms: data.cpuBudgetMs ?? 1000 }) : t("procNoSamples")}
            spark={<Sparkline values={history.map((s) => s.cpuPercent)} />}
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
            spark={<Sparkline values={history.map((s) => s.loopLagP99Ms)} />}
          />
          <Stat
            label={t("procRss")}
            value={`${data.process.rssMb} МБ`}
            spark={<Sparkline values={history.map((s) => s.rssMb)} />}
          />
          <Stat
            label={t("procHeap")}
            value={`${data.process.heapUsedMb} / ${data.process.heapTotalMb} МБ`}
            spark={<Sparkline values={history.map((s) => s.heapUsedMb)} />}
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
            label={t("procDbQueries")}
            value={queries ? `${queries.perSec}/с` : "—"}
            sub={queries ? t("procDbQueriesSub", { total: queries.total }) : undefined}
            spark={queries ? <Sparkline values={queries.series} /> : undefined}
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
        <div className={styles.statGrid}>
          <Stat
            label={t("procDbRegion")}
            level={regionMismatch ? "warn" : undefined}
            value={dbLoc?.region ?? "—"}
            sub={
              dbLoc
                ? `${dbLoc.vendor}${dbLoc.pooled === null ? "" : dbLoc.pooled ? ` · ${t("procDbPooled")}` : ` · ${t("procDbDirect")}`}`
                : undefined
            }
          />
          <Stat
            label={t("procServerRegion")}
            level={regionMismatch ? "warn" : undefined}
            value={serverLoc?.renderRegion ?? t("procServerRegionUnknown")}
            sub={
              regionMismatch
                ? t("procRegionMismatch")
                : serverLoc?.renderRegion
                  ? serverLoc.awsRegion ?? undefined
                  : t("procServerRegionHint")
            }
          />
          <Stat
            label={t("procDbRtt")}
            level={latency ? evaluateDbRtt(latency.medianMs) : undefined}
            value={latency ? `${latency.medianMs} мс` : "—"}
            sub={
              latency
                ? t("procDbRttSub", { p95: latency.p95Ms, n: latency.samples })
                : t("procDbRttNone")
            }
          />
        </div>
        <div className={styles.benchRow}>
          <button
            type="button"
            className={styles.benchBtn}
            onClick={() => latencyRun.mutate()}
            disabled={latencyRun.isPending}
          >
            {latencyRun.isPending ? t("procBenchRunning") : t("procDbRttButton")}
          </button>
          {latency ? (
            <span className={styles.meta}>
              {t("procBenchAt", { time: new Date(latency.measuredAt).toLocaleTimeString() })}
            </span>
          ) : null}
        </div>
        {queries && queries.top.length > 0 ? (
          <>
            <h3 className={styles.procSubheading}>{t("procDbTop")}</h3>
            <ol className={styles.topList}>
              {queries.top.map((q) => (
                <li key={q.label} className={styles.topRow}>
                  <span className={styles.topLabel}>{q.label}</span>
                  <span className={styles.topValue}>
                    {t("procDbTopValue", { count: q.count, perSec: q.perSec, ms: q.avgMs })}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        <p className={styles.metaSmall}>{t("procHistoryHint")}</p>
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

      <FlockSection arenas={data.flock?.arenas ?? []} says={data.flock?.says ?? []} maps={data.flock?.maps} />

      <CpuBenchmark active={active} />

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
