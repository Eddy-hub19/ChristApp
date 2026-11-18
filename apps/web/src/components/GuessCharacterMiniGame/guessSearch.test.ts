import { describe, expect, it } from "vitest";
import { filterCharacters, normalizeName } from "./guessSearch";

const chars = [
  { id: "mary", difficulty: 1 as const, name: { ua: "Марія, мати Ісуса", ru: "Мария, мать Иисуса", en: "Mary, mother of Jesus" } },
  { id: "miriam", difficulty: 2 as const, name: { ua: "Мар’ям", ru: "Мариам", en: "Miriam" } },
  { id: "elijah", difficulty: 1 as const, name: { ua: "Ілля", ru: "Илия", en: "Elijah" } },
];

describe("filterCharacters", () => {
  it("returns everybody for an empty query, sorted by the current language", () => {
    expect(filterCharacters(chars, "  ", "en").map((c) => c.id)).toEqual(["elijah", "mary", "miriam"]);
  });

  it("finds a character by a name in any language, ignoring case and apostrophes", () => {
    expect(filterCharacters(chars, "МАРЯМ", "ua").map((c) => c.id)).toEqual(["miriam"]);
    expect(filterCharacters(chars, "mirIAM", "ru").map((c) => c.id)).toEqual(["miriam"]);
    expect(filterCharacters(chars, "илия", "en").map((c) => c.id)).toEqual(["elijah"]);
  });

  it("returns nothing when no name matches", () => {
    expect(filterCharacters(chars, "zzz", "en")).toEqual([]);
  });
});

describe("normalizeName", () => {
  it("treats ё/е and ї/і as equal", () => {
    expect(normalizeName("Ёлка")).toBe(normalizeName("елка"));
    expect(normalizeName("Їжак")).toBe(normalizeName("ІЖАК"));
  });
});
