/**
 * Старт Google OAuth (authorization code, повна навігація — без popup, тому працює в Safari і PWA на iPhone).
 * Кладе state + nonce в httpOnly-куку і веде на accounts.google.com.
 */
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  googleClientId,
  normalizeLang,
  redirectTo,
  redirectUriFor,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lang = normalizeLang(req.nextUrl.searchParams.get("lang"));
  const mode =
    req.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const clientId = googleClientId();

  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    return redirectTo(req, mode === "link" ? `/${lang}/profile` : `/${lang}`, {
      googleError: "not_configured",
    });
  }

  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriFor(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  }).toString();

  const res = redirectTo(req, authUrl.toString());
  res.cookies.set({
    name: OAUTH_COOKIE,
    value: Buffer.from(JSON.stringify({ state, nonce, mode, lang })).toString(
      "base64url",
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  return res;
}
