/**
 * Личные шрифты: «Шрифт інтерфейсу» (всё приложение), «Шрифт повідомлень» (текст в пузырях) и размер текста.
 * Профиль хранит `{ v: 1, ui, msg, size }`. Новый шрифт = запись в CHAT_FONTS (подпись/пример в переводах не нужны:
 * название - это сам шрифт), подключение в styles/fonts.ts (next/font, subset latin + cyrillic) и id в backend/src/config/chat-prefs.ts.
 *
 * "as-is" - «Як зараз» (как в приложении сейчас), "system" - системный шрифт. Остальные - Google Fonts с лицензией OFL
 * и кириллицей (проверено: є, і, ї, ґ есть в subset cyrillic каждого файла).
 */
export const CHAT_FONTS = [
  { id: "as-is", label: null, css: null },
  { id: "system", label: null, css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: "nunito", label: "Nunito", css: "var(--font-nunito)", fallback: "sans-serif" },
  { id: "rubik", label: "Rubik", css: "var(--font-rubik)", fallback: "sans-serif" },
  { id: "comfortaa", label: "Comfortaa", css: "var(--font-comfortaa)", fallback: "sans-serif" },
  { id: "montserrat-alternates", label: "Montserrat Alternates", css: "var(--font-montserrat-alternates)", fallback: "sans-serif" },
  { id: "exo-2", label: "Exo 2", css: "var(--font-exo-2)", fallback: "sans-serif" },
  { id: "russo-one", label: "Russo One", css: "var(--font-russo-one)", fallback: "sans-serif" },
  { id: "jura", label: "Jura", css: "var(--font-jura)", fallback: "sans-serif" },
  { id: "pacifico", label: "Pacifico", css: "var(--font-pacifico)", fallback: "cursive" },
  { id: "lobster", label: "Lobster", css: "var(--font-lobster)", fallback: "cursive" },
  { id: "marck-script", label: "Marck Script", css: "var(--font-marck-script)", fallback: "cursive" },
  { id: "caveat", label: "Caveat", css: "var(--font-caveat)", fallback: "cursive" },
  { id: "press-start-2p", label: "Press Start 2P", css: "var(--font-press-start-2p)", fallback: "monospace" },
  { id: "pangolin", label: "Pangolin", css: "var(--font-pangolin)", fallback: "cursive" },
] as const;

export type ChatFontId = (typeof CHAT_FONTS)[number]["id"];
export const TEXT_SIZES = ["sm", "md", "lg"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
/** Масштаб текста сообщений и поля ввода. */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { sm: 0.88, md: 1, lg: 1.15 };

export interface FontPrefs {
  v: 1;
  ui: ChatFontId;
  msg: ChatFontId;
  size: TextSize;
}
export const DEFAULT_FONT_PREFS: FontPrefs = { v: 1, ui: "as-is", msg: "as-is", size: "md" };

const IDS = CHAT_FONTS.map((f) => f.id) as readonly string[];
export const isChatFontId = (v: unknown): v is ChatFontId => typeof v === "string" && IDS.includes(v);
export const isTextSize = (v: unknown): v is TextSize => typeof v === "string" && (TEXT_SIZES as readonly string[]).includes(v);

export function normalizeFontPrefs(raw: unknown): FontPrefs {
  if (typeof raw !== "object" || raw === null) return DEFAULT_FONT_PREFS;
  const r = raw as Record<string, unknown>;
  return {
    v: 1,
    ui: isChatFontId(r.ui) ? r.ui : "as-is",
    msg: isChatFontId(r.msg) ? r.msg : "as-is",
    size: isTextSize(r.size) ? r.size : "md",
  };
}

export const isDefaultFontPrefs = (p: FontPrefs) => p.ui === "as-is" && p.msg === "as-is" && p.size === "md";

/** CSS font-family для шрифта (null - «Як зараз»: ничего не переопределяем). */
export function fontFamilyOf(id: ChatFontId): string | null {
  const f = CHAT_FONTS.find((x) => x.id === id);
  if (!f || !f.css) return null;
  return "fallback" in f ? `${f.css}, ${f.fallback}` : f.css;
}
