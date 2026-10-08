/**
 * Політика React Query: «рівні свіжості» за типом даних і єдина логіка повторів за статусом помилки.
 * - static: майже не змінюються (переклади Біблії, довідники) — години;
 * - slow: профілі, довідник людей, збережені вірші — хвилини;
 * - live: живі дані, які підтримує сокет (історія чату, список чатів, кімнати кінотеатру) — довго не «старіють»,
 *   свіжість дають події сокета (`setQueryData`), а не повторні запити;
 * - counter: лічильники/бейджі, які ми самі інвалідуємо подіями — коротко.
 */
export const STALE = {
  static: 6 * 60 * 60_000,
  slow: 5 * 60_000,
  live: 5 * 60_000,
  counter: 20_000,
} as const;

/** HTTP-статус із помилок різної форми (RoomHistoryHttpError, WatchApiError, axios-подібні, fetch). */
export function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  return undefined;
}

/** 4xx (крім 408/425/429) не лікуються очікуванням — 401 обробляє apiFetch (refresh), решту не повторюємо. */
export function isPermanentRequestError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === undefined) return false;
  if (status === 408 || status === 425 || status === 429) return false;
  return status >= 400 && status < 500;
}

export const DEFAULT_MAX_RETRIES = 3;

/** Мережа/таймаут/5xx — до 3 повторів; 401/403/404 та інші 4xx — без повторів. */
export function shouldRetryRequest(
  failureCount: number,
  error: unknown,
): boolean {
  if (isPermanentRequestError(error)) return false;
  return failureCount < DEFAULT_MAX_RETRIES;
}

/** 1 с, 2 с, 4 с … не довше 15 с. */
export function requestRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 15_000);
}
