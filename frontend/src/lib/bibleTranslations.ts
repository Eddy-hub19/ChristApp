/**
 * Дозволені переклади Біблії — єдине місце, яке треба міняти, щоб додати/прибрати переклад.
 * Перший у списку мови — переклад за замовчуванням для цієї мови інтерфейсу.
 *
 * Критерії: повний Старий і Новий Завіт (66 книг, 1189 глав, без девтероканонічних книг —
 * інакше вони потрапили б у список Нового Завіту) і найпоширеніші переклади.
 * Не підходять: JNT (лише Новий Завіт), SYNOD (77 книг), іспанські (вимкнено).
 */
export type BibleAppLang = "ua" | "ru" | "en";

export const ALLOWED_BIBLE_TRANSLATIONS: Record<BibleAppLang, readonly string[]> = {
  ua: ["UBIO", "UKRK", "CUV23"], // Огієнко 1962, Куліш 1903, УБТ 2020-23
  ru: ["NRT", "RBS2", "BTI"], // НРП, Современный перевод 2015, Кулаков 2015
  en: ["NKJV", "ESV", "NASB"],
};

const ALL_ALLOWED = new Set<string>(Object.values(ALLOWED_BIBLE_TRANSLATIONS).flat());

export function isAppLang(lang: string): lang is BibleAppLang {
  return lang === "ua" || lang === "ru" || lang === "en";
}

export function defaultTranslationForLang(lang: string): string {
  return ALLOWED_BIBLE_TRANSLATIONS[isAppLang(lang) ? lang : "ru"][0];
}

export function isAllowedTranslation(shortName: string): boolean {
  return ALL_ALLOWED.has(shortName);
}

/** Залишає в списку API лише дозволені переклади (порядок — як у конфігу). */
export function filterAllowedTranslations<T extends { short_name: string }>(
  translations: T[],
): T[] {
  const order = [...ALL_ALLOWED];
  return translations
    .filter((t) => ALL_ALLOWED.has(t.short_name))
    .sort((a, b) => order.indexOf(a.short_name) - order.indexOf(b.short_name));
}

/** Збережений вибір дійсний, лише якщо він у списку; інакше — переклад за замовчуванням для мови. */
export function resolveTranslationForLang(saved: string | null | undefined, lang: string): string {
  return saved && isAllowedTranslation(saved) ? saved : defaultTranslationForLang(lang);
}

const storageKey = (lang: string) => `bibleTranslation:${lang}`;

export function readSavedTranslation(lang: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(lang));
  } catch {
    return null;
  }
}

export function saveTranslation(lang: string, shortName: string) {
  try {
    window.localStorage.setItem(storageKey(lang), shortName);
  } catch {
    // приватний режим — просто не запамʼятовуємо
  }
}
