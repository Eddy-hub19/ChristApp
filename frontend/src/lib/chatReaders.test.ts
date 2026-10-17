import { describe, expect, it } from "vitest";
import { formatReadAt, sortReadersByTime, type ReadAtLabels } from "./chatReaders";

const labels: ReadAtLabels = {
  today: (t) => `сьогодні о ${t}`,
  yesterday: (t) => `вчора о ${t}`,
  other: (d, t) => `${d} о ${t}`,
};
const now = new Date(2026, 9, 17, 14, 0);

describe("formatReadAt", () => {
  it("today / yesterday / older", () => {
    expect(formatReadAt(new Date(2026, 9, 17, 13, 5), now, "ua", labels)).toBe("сьогодні о 13:05");
    expect(formatReadAt(new Date(2026, 9, 16, 22, 10), now, "ua", labels)).toBe("вчора о 22:10");
    expect(formatReadAt(new Date(2026, 9, 12, 9, 30), now, "ua", labels)).toMatch(/^12 .+ о 09:30$/);
  });
  it("adds the year for another year", () => {
    expect(formatReadAt(new Date(2025, 11, 31, 9, 30), now, "en", labels)).toContain("2025");
  });
});

describe("sortReadersByTime", () => {
  it("orders by read time without mutating input", () => {
    const input = [
      { id: "b", readAt: "2026-10-17T12:00:00Z" },
      { id: "a", readAt: "2026-10-17T10:00:00Z" },
    ];
    expect(sortReadersByTime(input).map((r) => r.id)).toEqual(["a", "b"]);
    expect(input[0].id).toBe("b");
  });
});
