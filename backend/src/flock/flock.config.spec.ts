import {
  FLOCK_CONFIG as C,
  FREE_SKINS,
  FREE_SKIN_IDS,
  BOSS_SKIN,
  isSelectableSkin,
  EXTRA_PAID_FROM,
  NUM_SKINS,
  PREMIUM_FROM,
  SPECIAL_FROM,
  isHiddenSkin,
  isSpecialSkin,
  isPaidSkin,
  isPremiumSkin,
  skinPriceOf,
} from './flock.config';
import { decodeState, encodeState } from './protocol';

describe('скіни: ціни й діапазони', () => {
  it('безкоштовні - явний список FREE_SKIN_IDS, 12..17 платні по 20, 18..23 преміум по 60', () => {
    expect(FREE_SKINS).toBe(12);
    expect(PREMIUM_FROM).toBe(18);
    expect(SPECIAL_FROM).toBe(24);
    expect(NUM_SKINS).toBe(47);
    for (let id = 41; id < NUM_SKINS; id++) {
      expect(isPremiumSkin(id)).toBe(true);
      expect(isPaidSkin(id)).toBe(true);
      expect(skinPriceOf(id)).toBe(C.rubies.premiumSkinPrice);
    }
    expect([...FREE_SKIN_IDS].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 37, 38, 39, 40,
    ]);
    for (const id of FREE_SKIN_IDS) {
      expect(isPaidSkin(id)).toBe(false);
      expect(isPremiumSkin(id)).toBe(false);
    }
    for (let id = FREE_SKINS; id < PREMIUM_FROM; id++) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(false);
      expect(skinPriceOf(id)).toBe(C.rubies.skinPrice);
    }
    for (let id = PREMIUM_FROM; id < SPECIAL_FROM; id++) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(true);
      expect(isSpecialSkin(id)).toBe(false);
      expect(skinPriceOf(id)).toBe(C.rubies.premiumSkinPrice);
    }
    for (let id = SPECIAL_FROM; id < EXTRA_PAID_FROM; id++) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(false);
      expect(isSpecialSkin(id)).toBe(true);
      expect(skinPriceOf(id)).toBe(C.rubies.specialSkinPrice);
    }
    for (let id = EXTRA_PAID_FROM; id < BOSS_SKIN; id++) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(false);
      expect(isSpecialSkin(id)).toBe(false);
      expect(isHiddenSkin(id)).toBe(false);
      expect(skinPriceOf(id)).toBe(C.rubies.skinPrice);
    }
    // «Вожак» зарезервований: не продається і не обирається
    expect(isPaidSkin(BOSS_SKIN)).toBe(false);
    expect(isSelectableSkin(BOSS_SKIN)).toBe(false);
    expect(C.rubies.specialSkinPrice).toBe(40);
    expect(C.rubies.skinPrice).toBe(20);
    expect(C.rubies.premiumSkinPrice).toBe(60);
    expect(isPaidSkin(NUM_SKINS)).toBe(false);
  });

  it('зняті з продажу скіни: дзвіночок, вовк в шкурі, Давид, полярний вовк, кришталева, грибок, лава, робот, суші', () => {
    const hidden = Array.from({ length: NUM_SKINS }, (_, i) => i).filter(isHiddenSkin);
    expect(hidden).toEqual([13, 16, 22, 23, 24, 26, 27, 30, 31]);
  });

  it('номер скіна по мережі - u8: усі 36 (і до 255) проходять кодек без змін формату', () => {
    const ids = Array.from({ length: NUM_SKINS }, (_, i) => i).concat(255);
    const buf = encodeState({
      tick: 1,
      alive: true,
      total: 10,
      selfPid: 0,
      effects: [],
      forgetChunks: [],
      chunks: [],
      foodEvents: [],
      players: ids.map((skin, pid) => ({ pid, skin, bot: false, name: 'x' })),
      cells: [],
      thorns: [],
      blobs: [],
      bonuses: [],
      paused: [],
    });
    expect(decodeState(buf).players.map((p) => p.skin)).toEqual(ids);
  });
});
