import { describe, expect, it } from "vitest";
import { buildSkeletonLayout, SKELETON_MAX_ITEMS, SKELETON_MIN_ITEMS } from "./skeletonLayout";

describe("buildSkeletonLayout", () => {
  it("keeps the item count within 6..8", () => {
    expect(buildSkeletonLayout(1)).toHaveLength(SKELETON_MIN_ITEMS);
    expect(buildSkeletonLayout(99)).toHaveLength(SKELETON_MAX_ITEMS);
    expect(buildSkeletonLayout(7)).toHaveLength(7);
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
