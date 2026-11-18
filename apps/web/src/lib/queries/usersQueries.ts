import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryPolicy";
import { getHttpApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";

const API_URL = getHttpApiBase();

export function usersDirectoryQueryKey() {
  return queryKeys.user.directory();
}

export class UsersDirectoryHttpError extends Error {
  constructor(readonly status: number) {
    super(`GET /users failed: ${status}`);
  }
}

/** Довідник користувачів. Помилка не підміняється порожнім списком: RQ повторює запит і лишає попередні дані. */
export async function fetchUsersDirectory(): Promise<
  Array<Record<string, unknown> & { id: string }>
> {
  const token = getAuthToken();
  if (!token) {
    return [];
  }

  const res = await apiFetch(`${API_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 25_000,
  });

  if (!res.ok) {
    throw new UsersDirectoryHttpError(res.status);
  }

  const data: unknown = await res.json();
  return Array.isArray(data)
    ? (data as Array<Record<string, unknown> & { id: string }>)
    : [];
}

export function usersDirectoryQueryOptions() {
  return {
    queryKey: usersDirectoryQueryKey(),
    queryFn: fetchUsersDirectory,
    staleTime: STALE.slow,
  };
}
