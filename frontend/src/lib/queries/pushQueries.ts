import { getAuthToken } from "@/lib/auth";
import {
  fetchPushStatus,
  getLocalPushEndpoint,
  fetchUnreadSummaryOrThrow,
  type PushServerStatus,
  type UnreadSummaryResponse,
} from "@/lib/push";

export function pushUnreadSummaryQueryKey(userId: string | undefined) {
  return ["push", "unread-summary", userId ?? "anonymous"] as const;
}

export function fetchUnreadSummaryForQuery(): Promise<UnreadSummaryResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Нет токена авторизации");
  }
  return fetchUnreadSummaryOrThrow(token);
}

export function pushStatusQueryKey(userId: string | undefined) {
  return ["push", "status", userId ?? "anonymous"] as const;
}

export async function fetchPushStatusForQuery(): Promise<PushServerStatus | null> {
  const token = getAuthToken();
  if (!token) return null;
  // Статус із погляду ЦЬОГО пристрою: чи зареєстрована на сервері саме його підписка.
  return fetchPushStatus(token, await getLocalPushEndpoint());
}
