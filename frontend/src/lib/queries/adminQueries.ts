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

/** Арена «Отари» для вкладки «Процеси»: люди, боты, нагрузка и последние решения регулятора ботов. */
export type AdminFlockDecision = {
  /** Unix ms. */
  at: number;
  level: "low" | "normal" | "high";
  action: "remove" | "add" | "hold";
  loadCap: number | null;
  reasons: ("late" | "loop" | "cpu")[];
  sample: { lateMs: number; loopP99Ms: number; cpuPct: number };
};
/** Свій текст гравця в «Отарі» (пам'ять сервера, не БД). */
export type AdminFlockSay = { at: number; userId: string; name: string; text: string; mutedUntil: number | null };

export type AdminFlockArena = {
  id: number;
  humans: number;
  bots: number;
  botsActive: number;
  botsRetiring: number;
  /** Штатное число ботов (по людям и жёстким лимитам). */
  botsTarget: number;
  /** Лимит по нагрузке (null - без ограничения). */
  botsLoadCap: number | null;
  hz: number;
  load: { lateMs: number; loopP99Ms: number; cpuPct: number } | null;
  decisions: AdminFlockDecision[];
  /** Номер карты арены (0 луг, 1 гай, 2 мороз, 3 вулкан), режим арены и когда она перестанет принимать новых игроков (мс; 0 - уже закрыта; null - режим без смены). */
  mapId?: number;
  mode?: "normal" | "circle";
  startedAt?: number;
  mapChangesAt?: number | null;
};

/** Карта «Отари» для админки: что назначено следующей арене (null - случайная) и как часто меняется. */
export type AdminFlockMaps = { nextMap: number | null; lastMap: number; rotateMs: number };

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
  /** Нет в старых версиях бекенда. */
  flock?: { arenas: AdminFlockArena[]; says?: AdminFlockSay[]; maps?: AdminFlockMaps };
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

export type AdminRubyTransaction = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: "ARENA_TOP1" | "SKIN_PURCHASE" | "ARTIFACT_PURCHASE" | "ADMIN_ADJUST" | "ENTRY_BONUS" | "ARENA_BOSS";
  note: string | null;
  skinId: number | null;
  artifactId?: number | null;
  actorId: string | null;
  createdAt: string;
};

export type AdminMemberFlock = {
  rubies: number;
  ownedSkins: number[];
  ownedArtifacts?: number[];
  selectedArtifact?: number;
  stats: { bestMass: number; eaten: number; topMs: number; games: number };
  transactions: AdminRubyTransaction[];
};

export const adminMemberFlockQueryKey = (memberId: string) => ["admin", "flock", memberId] as const;

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new AdminHttpError(401, "no token");
  const res = await apiFetch(`${getHttpApiBase()}/admin${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    throw new AdminHttpError(res.status, body.code ?? "");
  }
  return (await res.json()) as T;
}

export const fetchAdminMemberFlock = (memberId: string) => adminJson<AdminMemberFlock>(`/members/${memberId}/flock`);

/** Выдать артефакт «Отары» бесплатно (рубины не списываются). */
export const grantAdminMemberArtifact = (memberId: string, artifact: number) =>
  adminJson<{ artifactId: number }>(`/members/${memberId}/artifacts`, {
    method: "POST",
    body: JSON.stringify({ artifact }),
  });

/** amount > 0 нараховує, amount < 0 списує; причина обов'язкова (сервер перевіряє теж). */
export const adjustAdminMemberRubies = (memberId: string, amount: number, reason: string) =>
  adminJson<{ rubies: number }>(`/members/${memberId}/rubies`, {
    method: "POST",
    body: JSON.stringify({ amount, reason }),
  });

/** Мут свого тексту «Отари» (пам'ять сервера): mutedUntil - мс (epoch менеджера) або null. */
export const adminFlockMuteQueryKey = (memberId: string) => ["admin", "flock-mute", memberId] as const;
export const fetchAdminFlockMute = (memberId: string) => adminJson<{ mutedUntil: number | null }>(`/members/${memberId}/flock-mute`);
/** minutes = 0 знімає мут. */
export const setAdminFlockMute = (memberId: string, minutes: number) =>
  adminJson<{ mutedUntil: number | null }>(`/members/${memberId}/flock-mute`, {
    method: "POST",
    body: JSON.stringify({ minutes }),
  });

/** Усі чинні муті «Отари» одним запитом (userId -> until): фільтр «Заглушені» й значок у картці. */
export const adminFlockMutesQueryKey = () => ["admin", "flock-mutes"] as const;
export const fetchAdminFlockMutes = () => adminJson<{ mutes: Record<string, number> }>("/flock-mutes");

/** Назначить карту следующей созданной арене (mapId = null - случайная) и/или закрыть текущие арены для новых игроков. */
export const setAdminFlockNextMap = (body: { mapId?: number | null; retire?: boolean }) =>
  adminJson<AdminFlockMaps>("/flock/next-map", { method: "POST", body: JSON.stringify(body) });
