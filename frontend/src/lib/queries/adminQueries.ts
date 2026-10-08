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
