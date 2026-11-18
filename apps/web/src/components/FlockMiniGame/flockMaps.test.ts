import { describe, expect, it } from "vitest";
import { MAP_PALETTES, mapTheme } from "./flockMaps";
import { THEMES } from "./flockRender";

describe("mapTheme", () => {
  it("карта 0, неизвестная или без поля (старый сервер) - исходная тема", () => {
    expect(mapTheme(THEMES.light, 0)).toBe(THEMES.light);
    expect(mapTheme(THEMES.dark, undefined)).toBe(THEMES.dark);
    expect(mapTheme(THEMES.dark, 99)).toBe(THEMES.dark);
  });

  it("новые виды карт перекрашивают фон, сохраняя цвета имён и флаг темы", () => {
    for (const id of Object.keys(MAP_PALETTES).map(Number)) {
      for (const base of [THEMES.light, THEMES.dark]) {
        const t = mapTheme(base, id);
        expect(t.bg).not.toBe(base.bg);
        expect(t.dark).toBe(base.dark);
        expect(t.nameFill).toBe(base.nameFill);
        expect(mapTheme(base, id)).toBe(t); // кэш: стабильная ссылка
      }
    }
  });
});
