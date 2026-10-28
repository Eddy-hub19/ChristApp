import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken, setAuthToken } from "@/lib/auth";
import { getHttpApiBase } from "@/lib/apiBase";
import {
  setAuthenticatedUser,
  type AuthSessionPayload,
} from "@/lib/authSession";
import { parseAuthError, type AuthErrorInfo } from "@/lib/authErrors";

const AUTH_PROXY_URL = "/api/auth";

export class AuthApiError extends Error {
  info: AuthErrorInfo;
  status: number;
  constructor(status: number, info: AuthErrorInfo) {
    super(info.message ?? `HTTP ${status}`);
    this.name = "AuthApiError";
    this.status = status;
    this.info = info;
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  throw new AuthApiError(res.status, parseAuthError(await res.text()));
}

/** Кнопка Google показується лише коли GOOGLE_CLIENT_ID/SECRET задані і на фронті, і на бекенді. */
export async function fetchGoogleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_PROXY_URL}/google/config`, {
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { enabled?: boolean };
    return data.enabled === true;
  } catch {
    return false;
  }
}

/** Повна навігація (не popup): popup у Safari/PWA на iPhone блокується. */
export function startGoogleRedirect(mode: "login" | "link", lang: string) {
  const params = new URLSearchParams({ mode, lang });
  window.location.assign(`${AUTH_PROXY_URL}/google/start?${params}`);
}

export async function checkUsernameAvailable(
  username: string,
  signal?: AbortSignal,
): Promise<{ available: boolean; reason?: "format" | "taken" }> {
  const res = await fetch(
    `${AUTH_PROXY_URL}/auth/username-available?username=${encodeURIComponent(username)}`,
    { signal, cache: "no-store" },
  );
  await throwIfNotOk(res);
  return res.json();
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type AuthMethods = {
  hasPassword: boolean;
  google: { email: string } | null;
  googleEnabled: boolean;
};

export async function fetchAuthMethods(): Promise<AuthMethods> {
  const res = await apiFetch(`${getHttpApiBase()}/auth/methods`, {
    headers: authHeaders(),
  });
  await throwIfNotOk(res);
  return res.json();
}

export async function unlinkGoogle(): Promise<void> {
  const res = await apiFetch(`${getHttpApiBase()}/auth/google`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await throwIfNotOk(res);
}

export async function setAccountPassword(password: string): Promise<void> {
  const res = await apiFetch(`${getHttpApiBase()}/auth/password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ password }),
  });
  await throwIfNotOk(res);
}

/** Перший вхід через Google: вибір @username (і, за бажанням, імені). Повертає свіжий токен з новим username. */
export async function chooseNickname(input: {
  username: string;
  nickname?: string;
}): Promise<AuthSessionPayload> {
  const res = await apiFetch(`${getHttpApiBase()}/auth/nickname`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  await throwIfNotOk(res);
  const payload = (await res.json()) as AuthSessionPayload;
  setAuthToken(payload.access_token);
  if (payload.user) setAuthenticatedUser(payload.user);
  return payload;
}
