import type { Theme } from "./flockRender";

/**
 * Палитры видов карт. Номер = `map` из welcome (сервер: FLOCK_MAPS в flock.config.ts). 0 - обычный луг.
 * Новый вид карты = запись здесь + запись на сервере; для светлой и тёмной темы цвета свои.
 */
/** Осенняя роща: кусты тоже осенние. */
export const AUTUMN_MAP_ID = 1;
export const VOLCANO_MAP_ID = 3;

const AUTUMN: Partial<Theme> = { bg: "#b98a52", bgOut: "#6b4624", grid: "rgba(90,50,20,0.14)", tuft: "rgba(90,50,20,0.2)" };
const SNOW: Partial<Theme> = { bg: "#e8f1fa", bgOut: "#a7bbd0", grid: "rgba(120,160,205,0.16)", tuft: "rgba(255,255,255,0.7)" };
const VOLCANO: Partial<Theme> = { bg: "#2b2124", bgOut: "#1d1415", grid: "rgba(255,120,50,0.07)", tuft: "rgba(255,150,60,0.2)" };

/** Для карт 1-3 палитра одна на обидві теми застосунку: вигляд карти не залежить від світлої/темної теми. */
export const MAP_PALETTES: Record<number, { light: Partial<Theme>; dark: Partial<Theme> }> = {
  // 1: осінній гай: тепла бура земля, опале листя (кущі купками)
  1: { light: AUTUMN, dark: AUTUMN },
  // 2: засніжене поле
  2: { light: SNOW, dark: SNOW },
  // 3: вулкан: темна земля з жаром, чорна скеля за краями
  3: { light: VOLCANO, dark: VOLCANO },
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
