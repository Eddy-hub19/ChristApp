import { RoomHistoryHttpError } from "@/lib/chatMessagesApi";

/** Повторів достатньо, щоб пережити холодний старт бекенду (30–60 с): 1+2+4+8+15·4 = 75 с. */
export const HISTORY_MAX_RETRIES = 8;
const HISTORY_RETRY_BASE_MS = 1000;
const HISTORY_RETRY_MAX_MS = 15_000;
/** Окремий запит не висить довше за це: інакше повтор не спрацює на «сплячому» сервері. */
export const HISTORY_REQUEST_TIMEOUT_MS = 20_000;

export function historyRetryDelay(attemptIndex: number): number {
  return Math.min(HISTORY_RETRY_BASE_MS * 2 ** attemptIndex, HISTORY_RETRY_MAX_MS);
}

/**
 * Мережеві помилки, таймаути й 5xx повторюємо з наростаючою паузою. 401/403/404 не лікуються очікуванням:
 * один повтор (після оновлення токена), далі — лише події reconnect сокета / повернення в застосунок.
 */
export function shouldRetryHistory(failureCount: number, error: unknown): boolean {
  if (isTerminalHistoryError(error)) return failureCount < 1;
  return failureCount < HISTORY_MAX_RETRIES;
}

/** Через стільки без жодного повідомлення під скелетоном з'являється тихий рядок «оновити». */
export const HISTORY_STALLED_AFTER_MS = 60_000;

/** Мінімальна пауза між перезапитами історії, викликаними connect / visibility / online. */
export const HISTORY_REFETCH_MIN_INTERVAL_MS = 5000;

/** Статус відповіді, який не зміниться від очікування (401/403/404): ні повторів, ні health-опитування. */
export function isTerminalHistoryError(error: unknown): boolean {
  return (
    error instanceof RoomHistoryHttpError &&
    [401, 403, 404].includes(error.status)
  );
}

/**
 * «Бекенд прокидається» — лише мережеві помилки, таймаути та 502/503/504.
 * Будь-яка інша відповідь сервера (зокрема 4xx) означає, що він живий.
 */
export function isColdStartHistoryError(error: unknown): boolean {
  if (error instanceof RoomHistoryHttpError) {
    return [502, 503, 504].includes(error.status);
  }
  return error != null;
}

/** Пропускає не більше одного виклику за `minIntervalMs`; решту подій ігнорує. */
export function createHistoryRefetchGate(
  minIntervalMs = HISTORY_REFETCH_MIN_INTERVAL_MS,
  now: () => number = Date.now,
) {
  let last = -Infinity;
  return (): boolean => {
    const t = now();
    if (t - last < minIntervalMs) return false;
    last = t;
    return true;
  };
}
