import { getHttpApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryPolicy";

export type AdminMember = {
  id: string;
  email: string;
  username: string;
  nickname: string | null;
  createdAt: string;
  isActive: boolean;
  lastSeenAt: string | null;
  avatarUrl: string | null;
};

/** Помилка адмін-запиту з HTTP-статусом (для політики повторів і тексту в UI). */
export class AdminHttpError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message || `admin request failed: ${status}`);
  }
}

export const adminMembersQueryKey = () => queryKeys.admin.members();

export async function fetchAdminMembers(): Promise<AdminMember[]> {
  const token = getAuthToken();
  if (!token) throw new AdminHttpError(401, "no token");
  const res = await apiFetch(`${getHttpApiBase()}/admin/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new AdminHttpError(res.status, await res.text().catch(() => ""));
  }
  const data = (await res.json()) as AdminMember[];
  return Array.isArray(data) ? data : [];
}

export async function deleteAdminMember(memberId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new AdminHttpError(401, "no token");
  const res = await apiFetch(`${getHttpApiBase()}/admin/members/${memberId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new AdminHttpError(res.status);
}

export function adminMembersQueryOptions(enabled: boolean) {
  return {
    queryKey: adminMembersQueryKey(),
    queryFn: fetchAdminMembers,
    enabled,
    staleTime: STALE.counter * 3,
  };
}

export type AdminMetricSample = {
  t: number;
  cpuPercent: number;
  rssMb: number;
  heapUsedMb: number;
  loopLagP50Ms: number;
  loopLagP99Ms: number;
  loopLagMaxMs: number;
  /** Найбільша черга на з'єднання з пулом БД за інтервал (відсутня у старих версіях бекенду). */
  dbPoolWaitingMax?: number;
  /** Запитів до БД за секунду (середнє за інтервал). */
  dbQueriesPerSec?: number;
};

/** Чистий RTT до БД: 50 x `SELECT 1` на одному з'єднанні, мс. */
export type AdminDbLatency = {
  measuredAt: string;
  samples: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

export async function runAdminDbLatency(): Promise<AdminDbLatency> {
  const token = getAuthToken();
  if (!token) throw new AdminHttpError(401, "no token");
  const res = await apiFetch(`${getHttpApiBase()}/admin/db-latency`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new AdminHttpError(res.status, await res.text().catch(() => ""));
  }
  return ((await res.json()) as { result: AdminDbLatency }).result;
}

export type AdminDbQueries = {
  windowSec: number;
  total: number;
  perSec: number;
  /** Запитів/с по 5-секундних стовпчиках, від старого до нового. */
  series: number[];
  top: { label: string; count: number; perSec: number; avgMs: number }[];
};

/** Ответ `GET /admin/server` — состояние процесса, хоста, БД и realtime. */
export type AdminServerStatus = {
  generatedAt: string;
  /** Бюджет CPU інстанса, мс CPU/с (відсутній у старих версіях бекенду). */
  cpuBudgetMs?: number;
  process: {
    pid: number;
    nodeVersion: string;
    uptimeSec: number;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
  host: {
    cpuCount: number;
    loadAvg: number[];
    totalMemMb: number;
    freeMemMb: number;
  };
  latest: AdminMetricSample | null;
  history: AdminMetricSample[];
  db: {
    ok: boolean;
    pingMs: number;
    pool: { total: number; idle: number; waiting: number; max: number };
    /** Відсутнє у старих версіях бекенду. */
    queries?: AdminDbQueries;
    location?: {
      database: { host: string; vendor: string; region: string | null; pooled: boolean | null } | null;
      /** Регіон сервера з RENDER_REGION (Render не віддає його у змінних середовища). */
      server: { renderRegion: string | null; awsRegion: string | null };
    };
    latency?: AdminDbLatency | null;
  };
  realtime: { connectedSockets: number; onlineUsers: number; activeRooms: number };
  users: { total: number; active: number };
};

export const ADMIN_SERVER_REFRESH_MS = 5000;

export async function fetchAdminServerStatus(): Promise<AdminServerStatus> {
  const token = getAuthToken();
  if (!token) throw new AdminHttpError(401, "no token");
  const res = await apiFetch(`${getHttpApiBase()}/admin/server`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new AdminHttpError(res.status, await res.text().catch(() => ""));
  }
  return (await res.json()) as AdminServerStatus;
}

/** Живые метрики: без кеша, опрос раз в 5 с только пока вкладка «Процессы» открыта и видна. */
export function adminServerQueryOptions(enabled: boolean) {
  return {
    queryKey: queryKeys.admin.server(),
    queryFn: fetchAdminServerStatus,
    enabled,
    staleTime: 0,
    gcTime: 30_000,
    refetchInterval: ADMIN_SERVER_REFRESH_MS,
    refetchIntervalInBackground: false,
    placeholderData: (prev: AdminServerStatus | undefined) => prev,
  };
}

/** Замір швидкості CPU сервера відносно еталонного M2 (`POST /admin/cpu-benchmark`). */
export type AdminCpuBenchmark = {
  measuredAt: string;
  medianMs: number;
  runsMs: number[];
  refMs: number;
  /** У скільки разів ядро сервера повільніше за M2 (1 = як M2). */
  slowdown: number;
  /** Бюджет CPU сервера, мс CPU/с (RENDER_CPU_BUDGET_MS; 500 = 0.5 vCPU). */
  budgetMs: number;
  /** Скільки % бюджету CPU з'їсть арена "Отара" з N гравців. */
  arena: { players: number; cpuMsPerSec: number; budgetPercent: number }[];
};

async function adminCpuBenchmarkRequest<T>(method: "GET" | "POST"): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new AdminHttpError(401, "no token");
  const res = await apiFetch(`${getHttpApiBase()}/admin/cpu-benchmark`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new AdminHttpError(res.status, await res.text().catch(() => ""));
  }
  return (await res.json()) as T;
}

export async function fetchAdminCpuBenchmark(): Promise<AdminCpuBenchmark | null> {
  return (await adminCpuBenchmarkRequest<{ result: AdminCpuBenchmark | null }>("GET")).result;
}

export async function runAdminCpuBenchmark(): Promise<AdminCpuBenchmark> {
  return (await adminCpuBenchmarkRequest<{ result: AdminCpuBenchmark }>("POST")).result;
}

/** Останній результат живе на сервері до його перезапуску: тут його лише читаємо, без опитування. */
export function adminCpuBenchmarkQueryOptions(enabled: boolean) {
  return {
    queryKey: queryKeys.admin.cpuBenchmark(),
    queryFn: fetchAdminCpuBenchmark,
    enabled,
    staleTime: 30_000,
    gcTime: 60_000,
  };
}
