/**
 * Согласие на аналитику (Consent Mode v2). Хранится только локально (localStorage), на сервер не уходит.
 * `null` = пользователь ещё не выбирал: аналитика выключена, баннер показывается.
 */
export type AnalyticsConsent = "granted" | "denied";

export const ANALYTICS_CONSENT_KEY = "christapp:analyticsConsent";
const CHANGE_EVENT = "christapp:analytics-consent";

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(value: AnalyticsConsent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    /* localStorage недоступен: выбор действует до перезагрузки через событие ниже */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
}

/** Подписка на смену согласия (в этой вкладке и в соседних). Возвращает функцию отписки. */
export function subscribeAnalyticsConsent(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === ANALYTICS_CONSENT_KEY || e.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
