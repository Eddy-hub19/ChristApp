import { describe, expect, it } from "vitest";
import { bibleHref } from "./guessBible";

describe("bibleHref", () => {
  it("links to the chapter and the first verse of the passage", () => {
    expect(bibleHref({ book: 2, chapter: 3, verses: "1-12" })).toBe("/bible/2?chapter=3&verse=1");
    expect(bibleHref({ book: 6, chapter: 6, verses: "22-25" })).toBe("/bible/6?chapter=6&verse=22");
    expect(bibleHref({ book: 6, chapter: 2, verses: "14-15,21" })).toBe("/bible/6?chapter=2&verse=14");
  });

  it("omits the verse when the whole chapter is meant", () => {
    expect(bibleHref({ book: 1, chapter: 3, verses: null })).toBe("/bible/1?chapter=3");
  });
});
