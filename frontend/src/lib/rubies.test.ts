import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import ua from "../../messages/ua.json";
import { FREE_SKINS, isPaidSkin, isPremiumSkin, isSpecialSkin, PAID_SKIN_IDS, PREMIUM_FROM, PREMIUM_SKIN_IDS, SPECIAL_FROM, SPECIAL_SKIN_IDS, TOTAL_SKINS } from "./rubies";
import { SKINS } from "@/components/FlockMiniGame/flockSkins";

const fmt = (msg: string, locale: string, values: Record<string, unknown>) =>
  String(new IntlMessageFormat(msg, locale).format(values as never));

describe("рубіни: множина (ICU plural)", () => {
  const cases: [string, string, typeof ua, Record<number, string>][] = [
    ["ua", "uk", ua, { 1: "1 рубін", 2: "2 рубіни", 5: "5 рубінів", 11: "11 рубінів", 21: "21 рубін", 22: "22 рубіни", 0: "0 рубінів" }],
    ["ru", "ru", ru, { 1: "1 рубин", 2: "2 рубина", 5: "5 рубинов", 11: "11 рубинов", 21: "21 рубин", 24: "24 рубина", 0: "0 рубинов" }],
    ["en", "en", en, { 1: "1 ruby", 2: "2 rubies", 5: "5 rubies", 0: "0 rubies" }],
  ];
  for (const [name, locale, msgs, expected] of cases) {
    it(`${name}: rubies.count`, () => {
      for (const [n, text] of Object.entries(expected)) {
        expect(fmt(msgs.flock.rubies.count, locale, { count: Number(n) })).toBe(text);
      }
    });
  }

  it("повідомлення про нагороду й нестачу використовують ту саму множину", () => {
    expect(fmt(ua.flock.rubies.reward, "uk", { count: 10 })).toBe("Ти перший! +10 рубінів");
    expect(fmt(ru.flock.rubies.reward, "ru", { count: 10 })).toBe("Ты первый! +10 рубинов");
    expect(fmt(en.flock.rubies.reward, "en", { count: 10 })).toBe("You're first! +10 rubies");
    expect(fmt(ua.flock.rubies.missing, "uk", { count: 3 })).toBe("Не вистачає: 3 рубіни");
    expect(fmt(ru.flock.rubies.missing, "ru", { count: 3 })).toBe("Не хватает: 3 рубина");
    expect(fmt(en.flock.rubies.missing, "en", { count: 1 })).toBe("Missing: 1 ruby");
    expect(fmt(ua.flock.rubies.confirmText, "uk", { name: "Золота овечка", price: 20 })).toBe("Купити «Золота овечка» за 20 рубінів?");
  });
});

describe("скіни: платні 12..17, преміум 18..23 і особливі 24..33", () => {
  it("клієнтські константи збігаються з набором скінів", () => {
    expect(SKINS).toHaveLength(TOTAL_SKINS);
    expect(PAID_SKIN_IDS).toEqual([12, 13, 14, 15, 16, 17]);
    expect(isPaidSkin(FREE_SKINS - 1)).toBe(false);
    expect(isPaidSkin(FREE_SKINS)).toBe(true);
    expect(isPaidSkin(TOTAL_SKINS)).toBe(false);
  });

  it("у кожного платного скіна є назва в усіх трьох мовах", () => {
    for (const id of PAID_SKIN_IDS) {
      for (const m of [ua, ru, en]) {
        expect((m.flock.skins as Record<string, string>)[String(id)]).toBeTruthy();
      }
    }
  });

  it("преміум 18..23: окремий діапазон, у кожного є назва в трьох мовах і анімація", () => {
    expect(PREMIUM_FROM).toBe(18);
    expect(PREMIUM_SKIN_IDS).toEqual([18, 19, 20, 21, 22, 23]);
    expect(isPremiumSkin(17)).toBe(false);
    expect(isPremiumSkin(18)).toBe(true);
    expect(isPremiumSkin(SPECIAL_FROM)).toBe(false);
    for (const id of PREMIUM_SKIN_IDS) {
      expect(isPaidSkin(id)).toBe(true);
      expect(SKINS[id].anim?.frames).toBeGreaterThanOrEqual(2);
      expect(SKINS[id].anim?.frames).toBeLessThanOrEqual(6);
      for (const m of [ua, ru, en]) {
        expect((m.flock.skins as Record<string, string>)[String(id)]).toBeTruthy();
      }
    }
    for (const m of [ua, ru, en]) expect(m.flock.premium).toBeTruthy();
  });

  it("особливі 24..33: номери в межах u8 без зміни протоколу, видимі (не в прихованих), статичні, назви в трьох мовах", () => {
    expect(SPECIAL_FROM).toBe(24);
    expect(TOTAL_SKINS).toBe(34);
    expect(TOTAL_SKINS).toBeLessThanOrEqual(256);
    expect(SPECIAL_SKIN_IDS).toEqual([24, 25, 26, 27, 28, 29, 30, 31, 32, 33]);
    expect(isSpecialSkin(23)).toBe(false);
    expect(isSpecialSkin(24)).toBe(true);
    expect(isSpecialSkin(TOTAL_SKINS)).toBe(false);
    const decos = new Set<string | undefined>();
    for (const id of SPECIAL_SKIN_IDS) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(false);
      expect(SKINS[id].anim).toBeUndefined();
      decos.add(SKINS[id].deco);
      for (const m of [ua, ru, en]) {
        expect((m.flock.skins as Record<string, string>)[String(id)]).toBeTruthy();
      }
    }
    expect(decos.size).toBe(10);
    for (const m of [ua, ru, en]) expect(m.flock.special).toBeTruthy();
  });

  it("«Купити за 40»: ціна особливого береться з параметрів", () => {
    expect(fmt(ua.flock.rubies.buy, "uk", { price: 40 })).toBe("Купити за 40");
    expect(fmt(en.flock.rubies.buy, "en", { price: 40 })).toContain("40");
    expect(fmt(ua.flock.rubies.missing, "uk", { count: 40 })).toBe("Не вистачає: 40 рубінів");
  });

  it("«Купити за 60» і «Не вистачає: N»: підписи беруть ціну з параметрів", () => {
    expect(fmt(ua.flock.rubies.buy, "uk", { price: 60 })).toBe("Купити за 60");
    expect(fmt(en.flock.rubies.buy, "en", { price: 60 })).toContain("60");
    expect(fmt(ua.flock.rubies.missing, "uk", { count: 60 })).toBe("Не вистачає: 60 рубінів");
    expect(fmt(ua.flock.rubies.missing, "uk", { count: 1 })).toBe("Не вистачає: 1 рубін");
  });
});
