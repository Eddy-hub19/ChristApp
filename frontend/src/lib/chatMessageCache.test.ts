import { describe, expect, it } from "vitest";
import { CACHED_MESSAGES_LIMIT, trimForCache } from "./chatMessageCache";

describe("trimForCache", () => {
  it("keeps the newest messages up to the limit", () => {
    const all = Array.from({ length: 120 }, (_, i) => i);
    const trimmed = trimForCache(all);
    expect(trimmed).toHaveLength(CACHED_MESSAGES_LIMIT);
    expect(trimmed[trimmed.length - 1]).toBe(119);
    expect(trimmed[0]).toBe(120 - CACHED_MESSAGES_LIMIT);
  });

  it("does not touch short lists", () => {
    const short = [1, 2, 3];
    expect(trimForCache(short)).toBe(short);
  });
});
