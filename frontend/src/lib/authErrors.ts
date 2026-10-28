/**
 * Помилки авторизації з бекенду приходять як `{ code, message, retryAfterMinutes? }`.
 * Текст `message` російською: екрани показують переклад за `code` (messages/*.json → authErrors),
 * а `message` лишається запасним варіантом.
 */
export type AuthErrorInfo = {
  code?: string;
  message?: string;
  retryAfterMinutes?: number;
};

export function parseAuthError(responseText: string): AuthErrorInfo {
  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    const message = Array.isArray(parsed.message)
      ? parsed.message.filter((m) => typeof m === "string").join(". ")
      : typeof parsed.message === "string"
        ? parsed.message
        : undefined;
    return {
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      message,
      retryAfterMinutes:
        typeof parsed.retryAfterMinutes === "number"
          ? parsed.retryAfterMinutes
          : undefined,
    };
  } catch {
    return {};
  }
}

/** Коди, для яких є переклад у `authErrors`. */
const KNOWN_CODES = new Set([
  "INVALID_CREDENTIALS",
  "RATE_LIMITED",
  "USERNAME_TAKEN",
  "EMAIL_TAKEN",
  "IDENTITY_TAKEN",
  "USERNAME_ALREADY_CHOSEN",
  "PASSWORD_ALREADY_SET",
  "LAST_LOGIN_METHOD",
  "GOOGLE_NOT_CONFIGURED",
  "GOOGLE_AUTH_FAILED",
  "GOOGLE_EMAIL_EXISTS",
  "GOOGLE_ALREADY_LINKED",
  "GOOGLE_ALREADY_CONNECTED",
]);

export function isKnownAuthErrorCode(code: string | undefined): code is string {
  return Boolean(code && KNOWN_CODES.has(code));
}

/** Код з `?googleError=` (його ставить callback-маршрут) → код бекенду. */
export const GOOGLE_REDIRECT_ERRORS: Record<string, string> = {
  email_exists: "GOOGLE_EMAIL_EXISTS",
  failed: "GOOGLE_AUTH_FAILED",
  not_configured: "GOOGLE_NOT_CONFIGURED",
  rate_limited: "RATE_LIMITED",
  already_linked: "GOOGLE_ALREADY_LINKED",
  already_connected: "GOOGLE_ALREADY_CONNECTED",
  cancelled: "GOOGLE_CANCELLED",
  unavailable: "GOOGLE_UNAVAILABLE",
};
