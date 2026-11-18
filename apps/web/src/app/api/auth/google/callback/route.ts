/**
 * Повернення від Google: перевіряємо state з куки, віддаємо code бекенду (він сам міняє його на ID-токен і
 * перевіряє підпис/aud/nonce), переставляємо refresh-cookie на домен фронта (як звичайний /api/auth проксі)
 * і ведемо користувача назад у застосунок. Access-токен в URL не потрапляє: сесію підхоплює /auth/refresh по cookie.
 */
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  BACKEND,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  REFRESH_COOKIE,
  clientIpOf,
  normalizeLang,
  redirectTo,
  redirectUriFor,
} from "../_shared";

export const dynamic = "force-dynamic";

type OAuthCookie = {
  state: string;
  nonce: string;
  mode: "login" | "link";
  lang: string;
};

const BACKEND_CODES: Record<string, string> = {
  GOOGLE_EMAIL_EXISTS: "email_exists",
  GOOGLE_AUTH_FAILED: "failed",
  GOOGLE_NOT_CONFIGURED: "not_configured",
  GOOGLE_ALREADY_LINKED: "already_linked",
  GOOGLE_ALREADY_CONNECTED: "already_connected",
  RATE_LIMITED: "rate_limited",
};

function readOAuthCookie(req: NextRequest): OAuthCookie | null {
  const raw = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed?.state === "string" &&
      typeof parsed?.nonce === "string" &&
      (parsed.mode === "login" || parsed.mode === "link")
    ) {
      return { ...parsed, lang: normalizeLang(parsed.lang) };
    }
  } catch {
    // нижче повернемо null
  }
  return null;
}

function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function finish(res: NextResponse): NextResponse {
  res.cookies.set({
    name: OAUTH_COOKIE,
    value: "",
    path: OAUTH_COOKIE_PATH,
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const saved = readOAuthCookie(req);
  const lang = saved?.lang ?? "en";
  const mode = saved?.mode ?? "login";
  const failBase = mode === "link" ? `/${lang}/profile` : `/${lang}`;
  const fail = (code: string, extra?: Record<string, string>) =>
    finish(redirectTo(req, failBase, { googleError: code, ...extra }));

  const params = req.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";

  if (!saved || !state || !sameSecret(state, saved.state)) {
    return fail("failed");
  }
  if (params.get("error")) {
    return fail(
      params.get("error") === "access_denied" ? "cancelled" : "failed",
    );
  }
  if (!code) return fail("failed");

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const ip = clientIpOf(req);
  if (ip) headers["x-client-ip"] = ip;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (saved.mode === "link" && refresh) {
    headers.cookie = `${REFRESH_COOKIE}=${refresh}`;
  }

  let backendResp: Response;
  try {
    backendResp = await fetch(`${BACKEND}/auth/google`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        code,
        redirectUri: redirectUriFor(req),
        nonce: saved.nonce,
        mode: saved.mode,
      }),
    });
  } catch {
    return fail("unavailable");
  }

  if (!backendResp.ok) {
    let body: { code?: string; retryAfterMinutes?: number } = {};
    try {
      body = await backendResp.json();
    } catch {
      // тіло не JSON — лишаємо загальну помилку
    }
    const mapped =
      (body.code && BACKEND_CODES[body.code]) ||
      (backendResp.status === 503 ? "unavailable" : "failed");
    return fail(
      mapped,
      body.retryAfterMinutes
        ? { minutes: String(body.retryAfterMinutes) }
        : undefined,
    );
  }

  if (saved.mode === "link") {
    return finish(redirectTo(req, `/${lang}/profile`, { google: "linked" }));
  }

  const res = finish(redirectTo(req, `/${lang}`));
  const setCookie = backendResp.headers.get("set-cookie") ?? "";
  const token = setCookie.match(/refreshToken=([^;]+)/)?.[1];
  const maxAge = setCookie.match(/[Mm]ax-[Aa]ge=(\d+)/)?.[1];
  if (!token) return fail("failed");
  res.cookies.set({
    name: REFRESH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: maxAge ? parseInt(maxAge, 10) : 7 * 24 * 60 * 60,
  });
  return res;
}
