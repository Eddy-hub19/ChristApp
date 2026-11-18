import type { QueryClient } from "@tanstack/react-query";
import { STALE } from "@/lib/queryPolicy";
import { queryKeys } from "@/lib/queryKeys";
import { getAuthToken } from "@/lib/auth";
import {
  fetchPushStatus,
  getLocalPushEndpoint,
  fetchUnreadSummaryOrThrow,
  type PushServerStatus,
  type UnreadSummaryResponse,
} from "@/lib/push";

export function pushUnreadSummaryQueryKey(userId: string | undefined) {
  return queryKeys.push.unreadSummary(userId);
}

export function fetchUnreadSummaryForQuery(): Promise<UnreadSummaryResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Нет токена авторизации");
  }
  return fetchUnreadSummaryOrThrow(token);
}

export function pushStatusQueryKey(userId: string | undefined) {
  return queryKeys.push.status(userId);
}

export async function fetchPushStatusForQuery(): Promise<PushServerStatus | null> {
  const token = getAuthToken();
  if (!token) return null;
  // Статус із погляду ЦЬОГО пристрою: чи зареєстрована на сервері саме його підписка.
  return fetchPushStatus(token, await getLocalPushEndpoint());
}

export function unreadSummaryQueryOptions(userId: string | undefined) {
  return {
    queryKey: pushUnreadSummaryQueryKey(userId),
    queryFn: fetchUnreadSummaryForQuery,
    enabled: Boolean(userId),
    staleTime: STALE.counter,
  };
}

/** Мінімальна пауза між запитами зведення: серія подій (focus + visibility + online + newMessage…) збирається в один запит. */
export const UNREAD_REFRESH_MIN_INTERVAL_MS = 3000;

const unreadRefreshState = new WeakMap<
  QueryClient,
  { last: number; timer: ReturnType<typeof setTimeout> | null }
>();

/**
 * Оновлює зведення непрочитаного не частіше разу на `UNREAD_REFRESH_MIN_INTERVAL_MS`: перший виклик — одразу,
 * решта в межах вікна — один відкладений запит наприкінці.
 */
export function requestUnreadSummaryRefresh(
  queryClient: QueryClient,
  userId: string | undefined,
  now: () => number = Date.now,
) {
  let state = unreadRefreshState.get(queryClient);
  if (!state) {
    state = { last: -Infinity, timer: null };
    unreadRefreshState.set(queryClient, state);
  }
  const run = () => {
    const s = unreadRefreshState.get(queryClient);
    if (!s) return;
    s.last = now();
    s.timer = null;
    // Запит, що вже летить, не скасовуємо й не дублюємо (cancelRefetch: false).
    void queryClient.refetchQueries(
      { queryKey: pushUnreadSummaryQueryKey(userId), type: "active" },
      { cancelRefetch: false },
    );
  };
  const wait = UNREAD_REFRESH_MIN_INTERVAL_MS - (now() - state.last);
  if (wait <= 0) {
    run();
  } else if (!state.timer) {
    state.timer = setTimeout(run, wait);
  }
}
