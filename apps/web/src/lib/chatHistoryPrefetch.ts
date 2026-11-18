import type { QueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { loadRoomHistoryWithCache } from "@/lib/chatHistorySync";
import { getUserIdFromJwt } from "@/lib/jwtUser";
import { HISTORY_REQUEST_TIMEOUT_MS } from "@/lib/chatHistoryLoad";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryPolicy";

/** Скільки повідомлень тягнемо за раз: однаково для сторінки кімнати і префетчу (спільний ключ кешу). */
export { HISTORY_FIRST_PAGE as HISTORY_PAGE_SIZE } from "@/lib/chatHistorySync";

/** Скільки верхніх чатів списку підвантажуємо наперед. */
export const AUTO_PREFETCH_ROOMS = 3;

/** Історія кімнати в кеш наперед: той самий ключ і запит, що й у сторінки кімнати; свіжий кеш запит не повторює. */
export function prefetchRoomHistory(
  queryClient: QueryClient,
  roomId: string | null | undefined,
) {
  const token = getAuthToken();
  if (!token || !roomId) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: queryKeys.chat.history(roomId),
    queryFn: () =>
      loadRoomHistoryWithCache({
        token,
        roomId,
        userId: getUserIdFromJwt(token),
        timeoutMs: HISTORY_REQUEST_TIMEOUT_MS,
      }),
    staleTime: STALE.live,
  });
}

/** Економний режим або повільна мережа — фоновий префетч не запускаємо. */
export function shouldSkipBackgroundPrefetch(): boolean {
  if (typeof navigator === "undefined") return true;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData) return true;
  return connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";
}
