import { isDefaultFontPrefs, normalizeFontPrefs } from "@/lib/chatFonts";

/** Приклади з налаштувань (можна зберегти в профілі). */
export const SUGGESTED_THEME_FOREGROUND = "#FFFFFF";
export const SUGGESTED_THEME_BACKGROUND = "#2E2D2D";

export const THEME_FONT_KEYS = ["inter", "achiko", "bodoni-moda"] as const;
export type ThemeFontKey = (typeof THEME_FONT_KEYS)[number];

export function normalizeThemeFontKey(
  value: string | null | undefined,
): ThemeFontKey {
  const v = value?.trim();
  if (!v) return "inter";
  if (THEME_FONT_KEYS.includes(v as ThemeFontKey)) {
    return v as ThemeFontKey;
  }
  return "inter";
}

export type UserAppearanceFields = {
  themeForegroundHex?: string | null;
  themeBackgroundHex?: string | null;
  themeFontKey?: string | null;
  /** Личные шрифты (lib/chatFonts.ts): атрибуты на <html>, значения - styles/chatFonts.scss. */
  fontPrefs?: unknown;
};

/** Ключ localStorage: блокирующий скрипт в layout читает его и ставит атрибуты на <html> до первого paint. */
export const FONT_PREFS_STORAGE_KEY = "christapp:fontPrefs";

/** Личные шрифты и размер текста -> атрибуты на <html> (null - всё как в приложении по умолчанию). */
export function applyFontPrefsToDocument(raw: unknown): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const p = normalizeFontPrefs(raw);
  const set = (name: string, value: string | null) => {
    if (value) root.setAttribute(name, value);
    else root.removeAttribute(name);
  };
  set("data-ui-font", p.ui === "as-is" ? null : p.ui);
  set("data-msg-font", p.msg === "as-is" ? null : p.msg);
  set("data-text-size", p.size === "md" ? null : p.size);
  try {
    if (isDefaultFontPrefs(p)) window.localStorage.removeItem(FONT_PREFS_STORAGE_KEY);
    else window.localStorage.setItem(FONT_PREFS_STORAGE_KEY, JSON.stringify({ ui: p.ui, msg: p.msg, size: p.size }));
  } catch {
    /* приватный режим */
  }
}

/** Останній стан для повторного застосування при зміні light/dark (див. ThemeToggle). */
let cachedAppearanceUser: UserAppearanceFields | null | undefined;

function normalizeHex(input: string | null | undefined): string | undefined {
  if (input == null || typeof input !== "string") {
    return undefined;
  }
  const t = input.trim();
  if (!t) {
    return undefined;
  }
  const withHash = t.startsWith("#") ? t : `#${t}`;
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash : undefined;
}

/** Повторно застосувати зовнішній вигляд після зміни `data-theme` (inline --foreground не має ламати світлу палітру). */
export function reapplyUserAppearanceForCurrentTheme(): void {
  if (typeof document === "undefined" || cachedAppearanceUser === undefined) {
    return;
  }
  applyUserAppearanceToDocument(cachedAppearanceUser);
}

/** Застосувати кастомні кольори/шрифт поверх data-theme (light/dark). */
export function applyUserAppearanceToDocument(
  user: UserAppearanceFields | null | undefined,
): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  cachedAppearanceUser = user ?? null;
  applyFontPrefsToDocument(user?.fontPrefs);

  if (!user) {
    root.style.removeProperty("--foreground");
    root.style.removeProperty("--book-title-color");
    root.style.removeProperty("--background");
    document.body.style.removeProperty("font-family");
    return;
  }

  const theme = root.getAttribute("data-theme") ?? "dark";
  const isLight = theme === "light";

  const fg = normalizeHex(user.themeForegroundHex ?? undefined);
  const bg = normalizeHex(user.themeBackgroundHex ?? undefined);

  // Кастомні hex з профілю розраховані на темний фон (часто білий текст). У світлій темі inline-змінні
  // перебивають палітру з globals.scss — прибираємо їх, щоб працювали --foreground / --surface із [data-theme="light"].
  if (isLight) {
    root.style.removeProperty("--foreground");
    root.style.removeProperty("--book-title-color");
    root.style.removeProperty("--background");
  } else if (fg) {
    root.style.setProperty("--foreground", fg);
    root.style.setProperty("--book-title-color", fg);
  } else {
    root.style.removeProperty("--foreground");
    root.style.removeProperty("--book-title-color");
  }

  if (!isLight) {
    if (bg) {
      root.style.setProperty("--background", bg);
    } else {
      root.style.removeProperty("--background");
    }
  }

  const fontKey = normalizeThemeFontKey(user.themeFontKey);
  // выбранный в «Налаштування -> Шрифт» шрифт интерфейса важнее старого ключа шрифта профиля
  if (root.hasAttribute("data-ui-font")) {
    document.body.style.removeProperty("font-family");
  } else if (fontKey === "achiko") {
    document.body.style.fontFamily =
      '"Achiko", "Inter", ui-sans-serif, system-ui, sans-serif';
  } else if (fontKey === "bodoni-moda") {
    document.body.style.fontFamily =
      'var(--font-bodoni-moda), "Bodoni Moda", ui-serif, Georgia, serif';
  } else {
    document.body.style.removeProperty("font-family");
  }
}
