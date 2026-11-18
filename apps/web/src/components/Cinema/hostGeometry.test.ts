import { describe, expect, it } from "vitest";
import { hostStyleRect, nextHostOffset, NO_OFFSET, roundRect, sameRect } from "./hostGeometry";

const slot = { left: 12, top: 98.4, width: 351, height: 197.4 };

describe("hostGeometry", () => {
  it("covers the slot exactly when there is no offset", () => {
    expect(hostStyleRect(slot, NO_OFFSET)).toEqual(slot);
  });

  it("keeps the offset when the host already sits on the slot", () => {
    const offset = { dx: 0, dy: 0 };
    expect(nextHostOffset(offset, slot, { ...slot, top: slot.top + 0.3 })).toBe(offset);
  });

  it("compensates a visualViewport.offsetTop shift of fixed coordinates", () => {
    // iOS: fixed-елемент зсунуто на 60px відносно клієнтських координат слота.
    const shiftedActual = { ...slot, top: slot.top + 60 };
    const offset = nextHostOffset(NO_OFFSET, slot, shiftedActual);
    expect(offset).toEqual({ dx: 0, dy: -60 });
    expect(hostStyleRect(slot, offset).top).toBeCloseTo(slot.top - 60, 5);
  });

  it("compensates a horizontal offsetLeft shift and accumulates corrections", () => {
    const first = nextHostOffset(NO_OFFSET, slot, { ...slot, left: slot.left - 8 });
    expect(first).toEqual({ dx: 8, dy: 0 });
    // Після застосування 8px хост усе ще на 2px лівіше → дозбираємо.
    const second = nextHostOffset(first, slot, { ...slot, left: slot.left - 2 });
    expect(second).toEqual({ dx: 10, dy: 0 });
  });

  it("rounds and compares rects", () => {
    expect(roundRect({ left: 1.04, top: 2.26, width: 3.333, height: 4 })).toEqual({
      left: 1,
      top: 2.3,
      width: 3.3,
      height: 4,
    });
    expect(sameRect(slot, { ...slot })).toBe(true);
    expect(sameRect(slot, { ...slot, height: 140 })).toBe(false);
    expect(sameRect(null, slot)).toBe(false);
  });
});
