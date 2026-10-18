import {
  FLOCK_CONFIG as C,
  FREE_SKINS,
  NUM_SKINS,
  PREMIUM_FROM,
  isPaidSkin,
  isPremiumSkin,
  skinPriceOf,
} from './flock.config';
import { decodeState, encodeState } from './protocol';

describe('скіни: ціни й діапазони', () => {
  it('0..11 безкоштовні, 12..17 платні по 20, 18..23 преміум по 60', () => {
    expect(FREE_SKINS).toBe(12);
    expect(PREMIUM_FROM).toBe(18);
    expect(NUM_SKINS).toBe(24);
    for (let id = 0; id < FREE_SKINS; id++) {
      expect(isPaidSkin(id)).toBe(false);
      expect(isPremiumSkin(id)).toBe(false);
    }
    for (let id = FREE_SKINS; id < PREMIUM_FROM; id++) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(false);
      expect(skinPriceOf(id)).toBe(C.rubies.skinPrice);
    }
    for (let id = PREMIUM_FROM; id < NUM_SKINS; id++) {
      expect(isPaidSkin(id)).toBe(true);
      expect(isPremiumSkin(id)).toBe(true);
      expect(skinPriceOf(id)).toBe(C.rubies.premiumSkinPrice);
    }
    expect(C.rubies.skinPrice).toBe(20);
    expect(C.rubies.premiumSkinPrice).toBe(60);
    expect(isPaidSkin(NUM_SKINS)).toBe(false);
  });

  it('номер скіна по мережі - u8: усі 24 (і до 255) проходять кодек без змін формату', () => {
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
