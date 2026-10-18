import { describe, expect, it } from "vitest";
import { BIBLE_BOOKS, canonicalBooks, isOldTestamentBook } from "./bibleBooks";

describe("canonicalBooks", () => {
  const raw = [
    ...BIBLE_BOOKS.map((b) => ({ id: b.id, chapters: b.id === "PSA" ? 151 : b.id === "DAN" ? 14 : 5 })),
    { id: "B67", chapters: 2 },
    { id: "B68", chapters: 14 },
  ];
  it("рівно 66 книг: 39 ВЗ + 27 НЗ, без девтероканонічних", () => {
    const out = canonicalBooks(raw);
    expect(out).toHaveLength(66);
    expect(out.filter((b) => isOldTestamentBook(b.id))).toHaveLength(39);
    expect(out.filter((b) => !isOldTestamentBook(b.id))).toHaveLength(27);
    expect(out.some((b) => b.id.startsWith("B"))).toBe(false);
  });
  it("обрізає зайві глави (Пс 151, Дан 14)", () => {
    const out = canonicalBooks(raw);
    expect(out.find((b) => b.id === "PSA")?.chapters).toBe(150);
    expect(out.find((b) => b.id === "DAN")?.chapters).toBe(12);
  });
});
