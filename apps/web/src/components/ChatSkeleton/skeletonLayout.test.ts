import { describe, expect, it } from "vitest";
import {
  buildSkeletonLayout,
  SKELETON_EXTRA_ITEMS,
  SKELETON_FALLBACK_ITEMS,
  SKELETON_ITEM_HEIGHT,
  skeletonCountForHeight,
} from "./skeletonLayout";

describe("buildSkeletonLayout", () => {
  it("builds exactly the requested number of items, with no upper cap", () => {
    expect(buildSkeletonLayout(3)).toHaveLength(3);
    expect(buildSkeletonLayout(40)).toHaveLength(40);
    expect(buildSkeletonLayout()).toHaveLength(SKELETON_FALLBACK_ITEMS);
  });

  it("covers the container height with a spare", () => {
    const height = 900;
    expect(skeletonCountForHeight(height) * SKELETON_ITEM_HEIGHT).toBeGreaterThanOrEqual(
      height + SKELETON_EXTRA_ITEMS * SKELETON_ITEM_HEIGHT - SKELETON_ITEM_HEIGHT,
    );
    expect(skeletonCountForHeight(0)).toBe(SKELETON_FALLBACK_ITEMS);
  });

  it("mixes sides and bubble sizes", () => {
    const items = buildSkeletonLayout();
    expect(new Set(items.map((item) => item.side)).size).toBe(2);
    const lineCounts = new Set(items.map((item) => item.lines.length));
    expect(lineCounts.has(1)).toBe(true);
    expect(Math.max(...lineCounts)).toBeGreaterThanOrEqual(3);
    for (const item of items) {
      expect(item.lines.length).toBeGreaterThanOrEqual(1);
      expect(item.lines.length).toBeLessThanOrEqual(3);
    }
  });

  it("shows an avatar only on the last incoming message of a run", () => {
    const items = buildSkeletonLayout();
    items.forEach((item, index) => {
      if (item.side === "out") {
        expect(item.showAvatar).toBe(false);
      } else {
        expect(item.showAvatar).toBe(items[index + 1]?.side !== "in");
      }
    });
  });

  it("groups consecutive messages of the same side", () => {
    const items = buildSkeletonLayout();
    items.forEach((item, index) => {
      expect(item.grouped).toBe(index > 0 && items[index - 1].side === item.side);
    });
  });
});
