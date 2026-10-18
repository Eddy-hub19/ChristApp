import { describe, expect, it } from "vitest";
import { ANIM_MIN_PX, animFrame, SKINS, skinOf } from "./flockSkins";
import { animLayers, LAYER_BEHIND, LAYER_FRONT } from "./flockCreature";

describe("анімація преміум-скінів", () => {
  const premium = SKINS.slice(18);

  it("шість преміум-скінів: розмаїття (вівці, баран, вовк) і 2-6 кадрів на скін", () => {
    expect(premium).toHaveLength(6);
    const kinds = new Set(premium.map((s) => s.kind));
    expect(kinds.has("sheep") && kinds.has("ram") && kinds.has("wolf") && kinds.has("lamb")).toBe(true);
    for (const s of premium) {
      expect(s.anim).toBeDefined();
      expect(s.anim!.frames).toBeGreaterThanOrEqual(2);
      expect(s.anim!.frames).toBeLessThanOrEqual(6);
      expect(s.anim!.fps).toBeGreaterThan(0);
      // кожен анімований скін має хоча б один шар
      expect(animLayers(s) & (LAYER_BEHIND | LAYER_FRONT)).not.toBe(0);
    }
  });

  it("безкоштовні й звичайні платні скіни не анімовані", () => {
    for (const s of SKINS.slice(0, 18)) {
      expect(s.anim).toBeUndefined();
      expect(animLayers(s)).toBe(0);
    }
  });

  it("кадр циклічний, у межах кількості кадрів, безшовний за період", () => {
    for (const s of premium) {
      const { frames, fps } = s.anim!;
      const seen = new Set<number>();
      for (let t = 0; t < (frames * 2) / fps; t += 1 / (fps * 4)) {
        const f = animFrame(s, t);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(frames);
        seen.add(f);
      }
      expect(seen.size).toBe(frames);
      expect(animFrame(s, 0)).toBe(animFrame(s, frames / fps));
    }
  });

  it("без анімації: «зменшити рух», дрібний розмір, скін без анімації", () => {
    const s = skinOf(18);
    const t = 5.3;
    expect(animFrame(s, t)).toBe(Math.floor(t * s.anim!.fps) % s.anim!.frames);
    expect(animFrame(s, t, { reduceMotion: true })).toBe(0);
    expect(animFrame(s, t, { rPx: ANIM_MIN_PX - 1 })).toBe(0);
    expect(animFrame(s, t, { rPx: ANIM_MIN_PX })).toBe(Math.floor(t * s.anim!.fps) % s.anim!.frames);
    expect(animFrame(skinOf(0), t)).toBe(0);
  });
});
