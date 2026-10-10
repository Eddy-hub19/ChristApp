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
};

/** Ответ `GET /admin/server` — состояние процесса, хоста, БД и realtime. */
export type AdminServerStatus = {
  generatedAt: string;
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
