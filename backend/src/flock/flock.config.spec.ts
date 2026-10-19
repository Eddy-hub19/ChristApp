import {
  FLOCK_CONFIG as C,
  FREE_SKINS,
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
  it('0..11 безкоштовні, 12..17 платні по 20, 18..23 преміум по 60', () => {
    expect(FREE_SKINS).toBe(12);
    expect(PREMIUM_FROM).toBe(18);
    expect(SPECIAL_FROM).toBe(24);
    expect(NUM_SKINS).toBe(32);
    for (let id = 0; id < FREE_SKINS; id++) {
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
    for (let id = SPECIAL_FROM; id < NUM_SKINS; id++) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(false);
      expect(isSpecialSkin(id)).toBe(true);
      expect(isHiddenSkin(id)).toBe([26, 30].includes(id)); // сховані лише грибок і робот
      expect(skinPriceOf(id)).toBe(C.rubies.specialSkinPrice);
    }
    expect(C.rubies.specialSkinPrice).toBe(40);
    expect(C.rubies.skinPrice).toBe(20);
    expect(C.rubies.premiumSkinPrice).toBe(60);
    expect(isPaidSkin(NUM_SKINS)).toBe(false);
  });

  it('номер скіна по мережі - u8: усі 32 (і до 255) проходять кодек без змін формату', () => {
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
