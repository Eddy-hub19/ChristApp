import { NextRequest, NextResponse } from "next/server";

export const BACKEND = (
  process.env.BACKEND_PROXY_TARGET?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:3001"
).replace(/\/+$/, "");

export const REFRESH_COOKIE = "refreshToken";
/** Кука зі state/nonce/mode/lang між стартом і поверненням від Google (10 хв, лише для цих маршрутів). */
export const OAUTH_COOKIE = "g_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";
export const LOCALES = ["en", "ru", "ua"] as const;

export function googleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
}

export function normalizeLang(lang: string | null | undefined): string {
  return LOCALES.includes(lang as (typeof LOCALES)[number])
    ? (lang as string)
    : "en";
}

/** Публічний origin фронта (за проксі Vercel): з нього будується redirect_uri. */
export function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

export function redirectUriFor(req: NextRequest): string {
  return `${publicOrigin(req)}/api/auth/google/callback`;
}

/** Реальний IP клієнта для лімітів бекенду (інакше він бачив би лише адресу Vercel). */
export function clientIpOf(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || undefined;
}

export function redirectTo(
  req: NextRequest,
  path: string,
  query?: Record<string, string>,
): NextResponse {
  const url = new URL(path, publicOrigin(req));
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
