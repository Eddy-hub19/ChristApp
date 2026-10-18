import { describe, expect, it } from "vitest";
import { pickTranslationShortName } from "./bibleTranslationForLang";

const t = (short_name: string, language: string) => ({ short_name, full_name: short_name, language, updated: 0 });

describe("pickTranslationShortName", () => {
  const list = [
    t("UBIO", "Ukrainian Українська"),
    t("NKJV", "English"),
    t("JNT", "russian русский"),
    t("NRT", "russian русский"),
  ];
  it("ru → NRT, а не перший у списку JNT (лише Новий Завіт)", () => {
    expect(pickTranslationShortName(list, "ru")).toBe("NRT");
  });
  it("ua → перший український, en → NKJV", () => {
    expect(pickTranslationShortName(list, "ua")).toBe("UBIO");
    expect(pickTranslationShortName(list, "en")).toBe("NKJV");
  });
});
