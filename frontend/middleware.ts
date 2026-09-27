import { routing } from "@/i18n/routing";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

const langs = routing.langs;
const LOCALE_COOKIE = "NEXT_LOCALE";

function pathnameWithoutLang(pathname: string): string | null {
  for (const loc of langs) {
    if (pathname === `/${loc}`) {
      return "/";
    }
    if (pathname.startsWith(`/${loc}/`)) {
      const rest = pathname.slice(`/${loc}`.length);
      return rest.length > 0 ? rest : "/";
    }
  }
  return null;
}

function localeFromPathname(pathname: string): (typeof langs)[number] | null {
  for (const loc of langs) {
    if (pathname === `/${loc}` || pathname.startsWith(`/${loc}/`)) {
      return loc;
    }
  }
  return null;
}

function isKnownLocale(value: string | undefined): value is (typeof langs)[number] {
  return !!value && (langs as readonly string[]).includes(value);
}

export default function middleware(request: NextRequest) {
  const stripped = pathnameWithoutLang(request.nextUrl.pathname);

  // «Голий» корінь локалі — саме сюди веде `start_url` PWA-manifest (завжди `/en`,
  // бо manifest статичний і не може підставити мову динамічно) і ярлик на робочому
  // столі iOS. За замовчуванням next-intl вважає прямий візит на `/en` свідомим
  // вибором і перезаписує збережену мову — тут навпаки, повертаємо користувача на
  // мову з cookie, якщо вона відрізняється, щоб застосунок завжди відкривався на
  // мові, якою реально користувались, без проміжного показу англійської.
  if (stripped === "/") {
    const currentLang = localeFromPathname(request.nextUrl.pathname);
    const cookieLang = request.cookies.get(LOCALE_COOKIE)?.value;

    if (
      currentLang &&
      isKnownLocale(cookieLang) &&
      cookieLang !== currentLang
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/${cookieLang}`;
      return NextResponse.redirect(url, 307);
    }
  }

  const response = intlMiddleware(request);

  if (response.headers.get("location")) {
    return response;
  }

  if (stripped === null) {
    return response;
  }

  return response;
}

export const config = {
  // Важно: отдельный `'/'` — иначе шаблон с группой часто не матчит корень, middleware не бежит и `/` даёт 404.
  matcher: [
    "/",
    "/(en|ru|ua)/:path*",
    "/((?!api|_next|.*\\..*|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
};
