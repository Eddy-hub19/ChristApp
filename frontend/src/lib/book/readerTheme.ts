export type ReaderTheme = "light" | "dark" | "sepia";

export const READER_THEMES: Record<ReaderTheme, { bg: string; fg: string; muted: string }> = {
  light: { bg: "#faf8f4", fg: "#23211e", muted: "#7a756c" },
  dark: { bg: "#14161a", fg: "#d9d9d6", muted: "#8b8f96" },
  sepia: { bg: "#f3e9d2", fg: "#4a3b2a", muted: "#8a7456" },
};

export const THEME_ORDER: ReaderTheme[] = ["light", "sepia", "dark"];

const THEME_KEY = "christapp:reader-theme";
const FONT_KEY = "christapp:reader-font";

export const FONT_MIN = 80;
export const FONT_MAX = 220;
export const FONT_STEP = 10;

export function readTheme(): ReaderTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "sepia") return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function writeTheme(theme: ReaderTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function readFontSize(): number {
  try {
    const value = Number(localStorage.getItem(FONT_KEY));
    if (value >= FONT_MIN && value <= FONT_MAX) return value;
  } catch {
    /* ignore */
  }
  return 110;
}

export function writeFontSize(value: number): void {
  try {
    localStorage.setItem(FONT_KEY, String(value));
  } catch {
    /* ignore */
  }
}
