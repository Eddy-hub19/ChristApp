import { describe, expect, it } from "vitest";
import { parseBibleReference } from "./bibleBooks";

const ref = (s: string) => parseBibleReference(s);

describe("parseBibleReference", () => {
  it("розпізнає скорочення й повні назви на ua/ru/en", () => {
    expect(ref("Ін 3:16")).toEqual({ bookId: "JHN", chapter: 3, verseFrom: 16, verseTo: undefined });
    expect(ref("Иоанна 3:16")?.bookId).toBe("JHN");
    expect(ref("John 3:16")?.bookId).toBe("JHN");
    expect(ref("john 3 16")).toBeNull();
    expect(ref("Буття 1")).toEqual({ bookId: "GEN", chapter: 1, verseFrom: undefined, verseTo: undefined });
    expect(ref("Бытие 1")?.bookId).toBe("GEN");
    expect(ref("Genesis 1")?.bookId).toBe("GEN");
  });

  it("підтримує діапазони віршів і нумеровані книги", () => {
    expect(ref("1 Кор 13:4-7")).toEqual({ bookId: "1CO", chapter: 13, verseFrom: 4, verseTo: 7 });
    expect(ref("1Кор 13:4–7")?.verseTo).toBe(7);
    expect(ref("1 Corinthians 13:4-7")?.bookId).toBe("1CO");
    expect(ref("I Cor 13")?.bookId).toBe("1CO");
    expect(ref("2 Тимофея 3:16")?.bookId).toBe("2TI");
    expect(ref("1 Івана 4:8")?.bookId).toBe("1JN");
    expect(ref("Ін. 3.16")?.verseFrom).toBe(16);
  });

  it("згортає ё/е, і/и, апострофи й регістр", () => {
    expect(ref("ИОАННА 3:16")?.bookId).toBe("JHN");
    expect(ref("Об'явлення 21")?.bookId).toBe("REV");
    expect(ref("Объявление 21")).toBeNull();
    expect(ref("Откровение 21:4")?.bookId).toBe("REV");
    expect(ref("Псалом 23")?.bookId).toBe("PSA");
    expect(ref("Пс 22:1")?.bookId).toBe("PSA");
  });

  it("однозначний початок назви працює, неоднозначний — ні", () => {
    expect(ref("Римл 8:28")?.bookId).toBe("ROM");
    expect(ref("Кор 13")).toBeNull();
    expect(ref("Матф 5:3")?.bookId).toBe("MAT");
  });

  it("не плутає пошук за словами з посиланням", () => {
    expect(ref("любов")).toBeNull();
    expect(ref("не бійся")).toBeNull();
    expect(ref('"Ін 3:16"')).toBeNull();
    expect(ref("ін")).toBeNull();
    expect(ref("")).toBeNull();
  });

  it("одно-главні книги: «Юди 5» — вірш 5", () => {
    expect(ref("Юди 5")).toEqual({ bookId: "JUD", chapter: 1, verseFrom: 5 });
  });
});
