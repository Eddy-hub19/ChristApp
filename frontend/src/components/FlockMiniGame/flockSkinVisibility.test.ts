import { describe, expect, it } from "vitest";
import { PREMIUM_SKIN_IDS } from "@/lib/rubies";
import { visibleSkinIds } from "./flockSkinVisibility";

describe("visibleSkinIds (скрытые скины)", () => {
  it("скрытые не показываются в лобби и магазине", () => {
    expect(visibleSkinIds([12, 13, 18, 19], [18, 19], [])).toEqual([12, 13]);
    expect(visibleSkinIds(PREMIUM_SKIN_IDS, PREMIUM_SKIN_IDS, [])).toEqual([]);
  });

  it("купленный скрытый скин остаётся виден и доступен", () => {
    expect(visibleSkinIds(PREMIUM_SKIN_IDS, PREMIUM_SKIN_IDS, [20])).toEqual([20]);
  });

  it("когда сервер откроет скины (hidden пуст) - видны все", () => {
    expect(visibleSkinIds(PREMIUM_SKIN_IDS, [], [])).toEqual(PREMIUM_SKIN_IDS);
  });

  it("пока профиль не загружен, скрытые не показываем", () => {
    expect(visibleSkinIds([17, 18], [18], null)).toEqual([17]);
  });
});
