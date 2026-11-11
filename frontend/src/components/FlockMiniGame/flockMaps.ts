import type { Theme } from "./flockRender";

/**
 * Палитры видов карт. Номер = `map` из welcome (сервер: FLOCK_MAPS в flock.config.ts). 0 - обычный луг.
 * Новый вид карты = запись здесь + запись на сервере; для светлой и тёмной темы цвета свои.
 */
/** Осенняя роща: кусты тоже осенние. */
export const AUTUMN_MAP_ID = 1;
export const VOLCANO_MAP_ID = 3;
/** «Ніч»: темна карта зі світлом навколо гравця (радіус світла рахує сервер; тут лише палітра й впізнавання карти). */
export const NIGHT_MAP_ID = 5;
/** «Небо»: світло-блакитне небо з хмарами-платформами; палітра однакова на обидві теми застосунку. */
export { SKY_MAP_ID } from "./flockSky";
export { CASTLES_MAP_ID } from "./flockCastles";

const AUTUMN: Partial<Theme> = { bg: "#b98a52", bgOut: "#6b4624", grid: "rgba(90,50,20,0.14)", tuft: "rgba(90,50,20,0.2)" };
const SNOW: Partial<Theme> = { bg: "#e8f1fa", bgOut: "#a7bbd0", grid: "rgba(120,160,205,0.16)", tuft: "rgba(255,255,255,0.7)" };
const LAKE: Partial<Theme> = { bg: "#7fae5a", bgOut: "#3f5f34", grid: "rgba(40,90,30,0.10)", tuft: "rgba(40,100,30,0.28)" };
const NIGHT: Partial<Theme> = { bg: "#0f1a33", bgOut: "#060a18", grid: "rgba(110,150,230,0.06)", tuft: "rgba(140,180,255,0.12)" };
const SKY: Partial<Theme> = { bg: "#8ec9f6", bgOut: "#6fb2ea", grid: "rgba(255,255,255,0.12)", tuft: "rgba(255,255,255,0.3)" };
const COLISEUM_PAL: Partial<Theme> = { bg: "#e2c48a", bgOut: "#241c19", grid: "rgba(150,105,50,0.10)", tuft: "rgba(150,105,50,0.18)" };
const VOLCANO: Partial<Theme> = { bg: "#2b2124", bgOut: "#1d1415", grid: "rgba(255,120,50,0.07)", tuft: "rgba(255,150,60,0.2)" };

/** Для карт 1-3 палитра одна на обидві теми застосунку: вигляд карти не залежить від світлої/темної теми. */
export const MAP_PALETTES: Record<number, { light: Partial<Theme>; dark: Partial<Theme> }> = {
  // 1: осінній гай: тепла бура земля, опале листя (кущі купками)
  1: { light: AUTUMN, dark: AUTUMN },
  // 2: засніжене поле
  2: { light: SNOW, dark: SNOW },
  // 3: вулкан: темна земля з жаром, чорна скеля за краями
  3: { light: VOLCANO, dark: VOLCANO },
  // 5: ніч: темно-синя земля, чорно-синя скеля за краями
  5: { light: NIGHT, dark: NIGHT },
  // 6: «Небо»: небо й хмари, вигляд не залежить від теми
  6: { light: SKY, dark: SKY },
  // 7: «Арена» (колізей): пісок і темна земля за трибунами, не залежить від теми застосунку
  7: { light: COLISEUM_PAL, dark: COLISEUM_PAL },
  // 4: «Ліс і озеро» (режим «Замки»): соковита трава, одна палітра на обидві теми
  4: { light: LAKE, dark: LAKE },
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
