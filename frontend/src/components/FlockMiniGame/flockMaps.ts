import type { Theme } from "./flockRender";

/**
 * Палитры видов карт. Номер = `map` из welcome (сервер: FLOCK_MAPS в flock.config.ts). 0 - обычный луг.
 * Новый вид карты = запись здесь + запись на сервере; для светлой и тёмной темы цвета свои.
 */
/** Осенняя роща: кусты тоже осенние. */
export const AUTUMN_MAP_ID = 1;

export const MAP_PALETTES: Record<number, { light: Partial<Theme>; dark: Partial<Theme> }> = {
  // 1: осенняя роща (кусты купками)
  1: {
    light: { bg: "#e6d9a0", bgOut: "#b59d62", grid: "rgba(150,110,40,0.22)", tuft: "rgba(150,100,30,0.38)" },
    dark: { bg: "#3a3020", bgOut: "#241c10", grid: "rgba(220,180,110,0.10)", tuft: "rgba(220,170,100,0.18)" },
  },
  // 2: заснеженное поле (кусты кольцом вокруг центра)
  2: {
    light: { bg: "#d6e8f5", bgOut: "#9db8cf", grid: "rgba(90,140,190,0.22)", tuft: "rgba(255,255,255,0.7)" },
    dark: { bg: "#1f3144", bgOut: "#111d2a", grid: "rgba(150,200,240,0.10)", tuft: "rgba(190,225,255,0.20)" },
  },
};

const cache = new Map<string, Theme>();

/** Тема с палитрой карты. Без `map` (старый сервер) или для неизвестного вида - исходная тема; результат кэшируется (стабильная ссылка). */
export function mapTheme(base: Theme, map: number | undefined): Theme {
  const pal = map === undefined ? undefined : MAP_PALETTES[map];
  if (!pal) return base;
  const key = `${map}|${base.dark ? "d" : "l"}`;
  let t = cache.get(key);
  if (!t) {
    t = { ...base, ...(base.dark ? pal.dark : pal.light) };
    cache.set(key, t);
  }
  return t;
}
