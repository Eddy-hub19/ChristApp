import { routing } from "@/i18n/routing";

/** Публічний origin сайту (для canonical, hreflang, sitemap, Open Graph). */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return appUrl ? appUrl.replace(/\/+$/, "") : "http://localhost:3000";
}

/** Публічні (без авторизації) сторінки, які живуть у `app/[lang]/(site)`. */
export const PUBLIC_PATHS = ["/welcome", "/privacy", "/terms"] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

/** hreflang: URL мови — "ua", а BCP-47 код української — "uk". */
const HREFLANG: Record<(typeof routing.langs)[number], string> = {
  en: "en",
  ru: "ru",
  ua: "uk",
};

/** `alternates` для metadata: canonical поточної мови + hreflang для всіх мов. */
export function publicAlternates(lang: string, path: PublicPath) {
  return {
    canonical: `/${lang}${path}`,
    languages: {
      ...Object.fromEntries(
        routing.langs.map((l) => [HREFLANG[l], `/${l}${path}`]),
      ),
      "x-default": `/en${path}`,
    },
  };
}

/** Значення HTTP-заголовка `Link` з hreflang-альтернативами; збігається з `<link rel="alternate">` із `publicAlternates`. */
export function publicAlternateLinkHeader(path: PublicPath): string {
  const origin = siteOrigin();
  const { languages } = publicAlternates("en", path);
  return Object.entries(languages)
    .map(([code, href]) => `<${origin}${href}>; rel="alternate"; hreflang="${code}"`)
    .join(", ");
}

/** Якщо `pathname` — публічна сторінка з локаллю (`/en/welcome`), повертає її шлях без локалі. */
export function publicPathOf(pathname: string): PublicPath | null {
  for (const l of routing.langs) {
    for (const p of PUBLIC_PATHS) {
      if (pathname === `/${l}${p}`) return p;
    }
  }
  return null;
}
