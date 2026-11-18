import { describe, expect, it } from "vitest";
import { suggestCharacters } from "./puzzleSearch";
import type { CatalogCharacter } from "./puzzleTypes";

const c = (id: string, ua: string, ru: string, en: string): CatalogCharacter => ({
  id,
  name: { ua, ru, en },
  imageIds: [`${id}-1`],
});
const CHARACTERS = [
  c("abraham", "Авраам", "Авраам", "Abraham"),
  c("aaron", "Аарон", "Аарон", "Aaron"),
  c("jesus", "Ісус Христос", "Иисус Христос", "Jesus Christ"),
  c("joseph", "Йосип", "Иосиф", "Joseph"),
  c("jacob", "Яків", "Иаков", "Jacob"),
];

const ids = (list: CatalogCharacter[]) => list.map((x) => x.id);

describe("suggestCharacters", () => {
  it("finds a character by name in any language", () => {
    expect(ids(suggestCharacters(CHARACTERS, "Авра", "ua"))).toEqual(["abraham"]);
    expect(ids(suggestCharacters(CHARACTERS, "abra", "ua"))).toEqual(["abraham"]);
    expect(ids(suggestCharacters(CHARACTERS, "Иосиф", "ua"))).toEqual(["joseph"]);
    expect(ids(suggestCharacters(CHARACTERS, "Иаков", "en"))).toEqual(["jacob"]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(ids(suggestCharacters(CHARACTERS, "ІСУС", "ua"))).toEqual(["jesus"]);
    expect(ids(suggestCharacters(CHARACTERS, "  jesus ", "en"))).toEqual(["jesus"]);
  });

  it("a second-word match works: «христ» finds Ісус Христос", () => {
    expect(ids(suggestCharacters(CHARACTERS, "христ", "ua"))).toEqual(["jesus"]);
  });

  it("names starting with the query come before names that merely contain it", () => {
    const list = [c("b", "Барак", "Барак", "Barak"), c("a1", "Аарон", "Аарон", "Aaron"), c("a2", "Арон", "Арон", "Aron")];
    expect(ids(suggestCharacters(list, "ар", "ua"))).toEqual(["a2", "a1", "b"]);
  });

  it("an empty query suggests nothing; no match returns an empty list", () => {
    expect(suggestCharacters(CHARACTERS, "", "ua")).toEqual([]);
    expect(suggestCharacters(CHARACTERS, "   ", "ua")).toEqual([]);
    expect(suggestCharacters(CHARACTERS, "qqqq", "ua")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(suggestCharacters(CHARACTERS, "а", "ua", 2)).toHaveLength(2);
  });
});
