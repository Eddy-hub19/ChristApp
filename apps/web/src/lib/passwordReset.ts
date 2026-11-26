import { AuthApiError } from "@/lib/googleAuth";
import { parseAuthError } from "@/lib/authErrors";

/** Одноразова ссилка від адміна: токен живе у фрагменті (#token=...), тож не потрапляє в логи серверів і Referer. */
export function readResetTokenFromHash(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw).get("token")?.trim() ?? "";
}

export function buildResetLink(origin: string, locale: string, token: string): string {
  return `${origin}/${locale}/reset-password#token=${encodeURIComponent(token)}`;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/auth/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
      cache: "no-store",
    });
  } catch {
    throw new AuthApiError(0, { code: "NETWORK" });
  }
  if (res.ok) return;
  throw new AuthApiError(res.status, parseAuthError(await res.text()));
}
