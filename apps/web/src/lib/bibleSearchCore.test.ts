import { describe, expect, it } from "vitest";
import {
  highlightSegments,
  isSearchable,
  matchesQuery,
  parseSearchQuery,
  stripVerseHtml,
  upstreamQuery,
} from "./bibleSearchCore";

describe("bibleSearchCore", () => {
  it("шукає за початком слова без урахування регістру, ё/е та і/и", () => {
    const q = parseSearchQuery("любов");
    expect(matchesQuery("Своєю нетлінною Любов'ю", q)).toBe(true);
    expect(matchesQuery("И от умножения зла охладеет любовь", q)).toBe(true);
    expect(matchesQuery("Бог есть любовь", parseSearchQuery("ЛЮБОВ"))).toBe(true);
    expect(matchesQuery("Он взял её", parseSearchQuery("ее"))).toBe(true);
    expect(matchesQuery("Не бійся", parseSearchQuery("не бийся"))).toBe(true);
    expect(matchesQuery("полюбовь", q)).toBe(false);
  });

  it("усі слова запиту мають бути присутні (порядок довільний)", () => {
    const q = parseSearchQuery("бійся не");
    expect(matchesQuery("Не бійся, Авраме", q)).toBe(true);
    expect(matchesQuery("Бійся Бога", q)).toBe(false);
  });

  it("фраза в лапках — підряд", () => {
    const q = parseSearchQuery('"не бійся"');
    expect(q.phrase).toBe("не бийся");
    expect(matchesQuery("Не бійся, Авраме", q)).toBe(true);
    expect(matchesQuery("Бійся і не падай", q)).toBe(false);
  });

  it("підсвічує знайдене в оригінальному тексті", () => {
    const segs = highlightSegments("Бог есть Любовь и Ёлка", parseSearchQuery("любов"));
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["Любов"]);
    expect(segs.map((s) => s.text).join("")).toBe("Бог есть Любовь и Ёлка");
    const ye = highlightSegments("Ёлка", parseSearchQuery("елка"));
    expect(ye[0]).toEqual({ text: "Ёлка", hit: true });
  });

  it("мінімальна довжина й запит до API", () => {
    expect(isSearchable("бо")).toBe(false);
    expect(isSearchable("бог")).toBe(true);
    expect(upstreamQuery(parseSearchQuery("не бійся"))).toBe("бійся");
    expect(upstreamQuery(parseSearchQuery('"не бійся"'))).toBe("не бійся");
  });

  it("прибирає HTML з тексту вірша", () => {
    expect(stripVerseHtml("whom you <mark>love</mark>, &amp; <i>son</i>")).toBe("whom you love, & son");
  });
});
