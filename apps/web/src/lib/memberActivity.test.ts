import { describe, expect, it } from "vitest";
import { groupByActivity, laterIso, sortByActivity, type ActivitySubject } from "./memberActivity";

const now = Date.parse("2026-01-20T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const person = (name: string, isOnline: boolean, lastSeenAt?: string | null): ActivitySubject => ({
  name,
  isOnline,
  lastSeenAt,
});
const id = (s: ActivitySubject) => s;

describe("sortByActivity", () => {
  it("puts online first (alphabetical), then freshest lastSeenAt, then never-seen alphabetically", () => {
    const list = [
      person("Zed", false, null),
      person("Old", false, ago(30 * DAY)),
      person("Fresh", false, ago(HOUR)),
      person("Bob", true, ago(DAY)),
      person("Alice", true),
      person("Anna", false, undefined),
    ];
    expect(sortByActivity(list, id).map((p) => p.name)).toEqual([
      "Alice",
      "Bob",
      "Fresh",
      "Old",
      "Anna",
      "Zed",
    ]);
  });

  it("does not mutate the input and ignores unparsable dates", () => {
    const list = [person("B", false, "garbage"), person("A", false, null)];
    const copy = [...list];
    expect(sortByActivity(list, id).map((p) => p.name)).toEqual(["A", "B"]);
    expect(list).toEqual(copy);
  });
});

describe("groupByActivity", () => {
  it("splits into online / recent (7 days) / earlier and omits empty sections", () => {
    const sorted = sortByActivity(
      [
        person("A", true),
        person("B", false, ago(6 * DAY)),
        person("C", false, ago(8 * DAY)),
        person("D", false, null),
      ],
      id,
    );
    const groups = groupByActivity(sorted, id, now);
    expect(groups.map((g) => [g.section, g.items.map((p) => p.name)])).toEqual([
      ["online", ["A"]],
      ["recent", ["B"]],
      ["earlier", ["C", "D"]],
    ]);
    expect(groupByActivity([person("A", true)], id, now).map((g) => g.section)).toEqual(["online"]);
  });
});

describe("laterIso", () => {
  it("picks the later moment and tolerates empty values", () => {
    expect(laterIso(ago(DAY), ago(HOUR))).toBe(ago(HOUR));
    expect(laterIso(null, ago(HOUR))).toBe(ago(HOUR));
    expect(laterIso(undefined, undefined)).toBeNull();
  });
});
