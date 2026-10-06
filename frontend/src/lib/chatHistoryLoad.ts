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

/** Не повторюємо відповіді, які не зміняться від очікування (немає доступу / кімнати). */
export function shouldRetryHistory(failureCount: number, error: unknown): boolean {
  if (failureCount >= HISTORY_MAX_RETRIES) return false;
  if (error instanceof RoomHistoryHttpError) {
    return error.status !== 403 && error.status !== 404;
  }
  return true;
}

type HistoryErrorInput = {
  /** React Query вичерпав усі повтори. */
  queryFailed: boolean;
  queryFetching: boolean;
  /** Історія вже прийшла (сокетом або запитом). */
  historyDelivered: boolean;
  /** Є що показати (кеш IndexedDB або отримані повідомлення). */
  hasMessages: boolean;
};

/** Екран помилки — лише коли всі повтори вичерпані, сокет мовчить і показати нічого. */
export function shouldShowHistoryError(input: HistoryErrorInput): boolean {
  return (
    input.queryFailed &&
    !input.queryFetching &&
    !input.historyDelivered &&
    !input.hasMessages
  );
}

/** Плашка «збережені повідомлення»: показані лише кешовані дані, а свіжих узяти нізвідки. */
export function shouldShowCachedNotice(input: {
  hasMessages: boolean;
  historyDelivered: boolean;
  queryFailed: boolean;
  offline: boolean;
}): boolean {
  return (
    input.hasMessages &&
    !input.historyDelivered &&
    (input.queryFailed || input.offline)
  );
}

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
