import { describe, expect, it } from "vitest";
import { pickTranslationShortName } from "./bibleTranslationForLang";
import {
  ALLOWED_BIBLE_TRANSLATIONS,
  filterAllowedTranslations,
  resolveTranslationForLang,
} from "./bibleTranslations";

const t = (short_name: string, language: string) => ({ short_name, full_name: short_name, language, updated: 0 });

describe("pickTranslationShortName", () => {
  const list = [
    t("JNT", "russian"),
    t("RV1960", "Spanish"),
    t("UBIO", "Ukrainian"),
    t("NKJV", "English"),
    t("NRT", "russian"),
  ];
  it("за замовчуванням — з дозволеного списку, а не перший у відповіді API", () => {
    expect(pickTranslationShortName(list, "ru")).toBe("NRT");
    expect(pickTranslationShortName(list, "ua")).toBe("UBIO");
    expect(pickTranslationShortName(list, "en")).toBe("NKJV");
  });
  it("порожній список API — код із конфігу", () => {
    expect(pickTranslationShortName([], "ua")).toBe("UBIO");
  });
});

describe("allowed translations", () => {
  it("прибирає JNT та іспанські, лишає по ≤3 на мову", () => {
    const filtered = filterAllowedTranslations([t("JNT", "r"), t("RV1960", "s"), t("NASB", "e"), t("NRT", "r")]);
    expect(filtered.map((x) => x.short_name)).toEqual(["NRT", "NASB"]);
    expect(filtered.map((x) => x.short_name)).not.toContain("JNT");
    for (const codes of Object.values(ALLOWED_BIBLE_TRANSLATIONS)) expect(codes.length).toBeLessThanOrEqual(3);
  });
  it("збережений переклад, якого немає в списку, замінюється на дефолт мови", () => {
    expect(resolveTranslationForLang("JNT", "ru")).toBe("NRT");
    expect(resolveTranslationForLang("RV1960", "en")).toBe("NKJV");
    expect(resolveTranslationForLang("RBS2", "ru")).toBe("RBS2");
    expect(resolveTranslationForLang(null, "ua")).toBe("UBIO");
  });
});
