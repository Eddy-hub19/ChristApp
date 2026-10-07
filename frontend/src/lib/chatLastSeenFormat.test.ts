import { describe, expect, it } from "vitest";
import { formatLastSeenRelative } from "./chatLastSeenFormat";

const labels = {
  justNow: () => "just now",
  minutes: (n: number) => `${n}m`,
  hours: (n: number) => `${n}h`,
  days: (n: number) => `${n}d`,
};
const now = Date.parse("2026-01-01T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("formatLastSeenRelative", () => {
  it("shows «just now» for anything under a minute", () => {
    expect(formatLastSeenRelative(ago(0), now, labels)).toBe("just now");
    expect(formatLastSeenRelative(ago(2_000), now, labels)).toBe("just now");
    expect(formatLastSeenRelative(ago(59_000), now, labels)).toBe("just now");
  });

  it("then minutes, hours, days", () => {
    expect(formatLastSeenRelative(ago(60_000), now, labels)).toBe("1m");
    expect(formatLastSeenRelative(ago(59 * 60_000), now, labels)).toBe("59m");
    expect(formatLastSeenRelative(ago(3 * 3_600_000), now, labels)).toBe("3h");
    expect(formatLastSeenRelative(ago(2 * 86_400_000), now, labels)).toBe("2d");
  });

  it("a timestamp slightly in the future (clock skew) is still «just now»", () => {
    expect(formatLastSeenRelative(ago(-3_000), now, labels)).toBe("just now");
  });
});
