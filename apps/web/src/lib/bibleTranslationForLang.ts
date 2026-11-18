import type { BibleTranslationItem } from "@/lib/queries/bibleQueries";
import {
  ALLOWED_BIBLE_TRANSLATIONS,
  defaultTranslationForLang,
  isAppLang,
} from "@/lib/bibleTranslations";

const APP_LANGS = new Set(["en", "ru", "ua"]);

/** Перша сегмент-папка в шляху: /en/bible → en */
export function getAppLangFromPathname(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  return APP_LANGS.has(seg) ? seg : "ru";
}

export function getAppLangFromWindow(): string {
  if (typeof window === "undefined") {
    return "ru";
  }
  return getAppLangFromPathname(window.location.pathname);
}

/**
 * Переклад за замовчуванням для мови інтерфейсу — лише з дозволеного списку (`bibleTranslations.ts`).
 * Якщо API його не повернув, беремо перший дозволений для цієї мови з відповіді, інакше — код із конфігу.
 */
export function pickTranslationShortName(
  translations: BibleTranslationItem[],
  lang: string,
): string {
  const preferred = defaultTranslationForLang(lang);
  if (translations.length === 0) return preferred;
  if (translations.some((t) => t.short_name === preferred)) return preferred;
  const allowedForLang = isAppLang(lang) ? ALLOWED_BIBLE_TRANSLATIONS[lang] : [];
  return (
    allowedForLang.find((code) => translations.some((t) => t.short_name === code)) ??
    preferred
  );
}
