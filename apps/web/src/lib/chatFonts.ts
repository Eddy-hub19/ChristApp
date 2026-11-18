/**
 * Личные настройки текста. Выбор шрифтов убран: у всех шрифт приложения по умолчанию ("as-is"),
 * остался только размер текста. Профиль хранит `{ v: 1, ui, msg, size }`: `ui` и `msg` всегда "as-is"
 * (старые сохранённые значения - Nunito, Rubik, Comfortaa, Caveat, системный - читаются как шрифт по умолчанию,
 * сервер при следующем сохранении тоже заменяет их; разовая миграция БД очистила уже сохранённые).
 */
export const TEXT_SIZES = ["sm", "md", "lg"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
/** Масштаб текста сообщений и поля ввода. */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { sm: 0.88, md: 1, lg: 1.15 };

export interface FontPrefs {
  v: 1;
  ui: "as-is";
  msg: "as-is";
  size: TextSize;
}
export const DEFAULT_FONT_PREFS: FontPrefs = { v: 1, ui: "as-is", msg: "as-is", size: "md" };

export const isTextSize = (v: unknown): v is TextSize => typeof v === "string" && (TEXT_SIZES as readonly string[]).includes(v);

export function normalizeFontPrefs(raw: unknown): FontPrefs {
  if (typeof raw !== "object" || raw === null) return DEFAULT_FONT_PREFS;
  const r = raw as Record<string, unknown>;
  return { v: 1, ui: "as-is", msg: "as-is", size: isTextSize(r.size) ? r.size : "md" };
}

export const isDefaultFontPrefs = (p: FontPrefs) => p.size === "md";
