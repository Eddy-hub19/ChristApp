import { describe, expect, it } from "vitest";
import { groupGameActivities, parseGameActivities } from "@/lib/games/gameActivity";

const a = (userId: string, username: string, game: string, joinable = true) => ({
  roomId: "r",
  userId,
  username,
  game,
  joinable,
  sessionId: `r:${game}`,
});

describe("parseGameActivities", () => {
  it("drops self, unknown games and garbage", () => {
    const parsed = parseGameActivities(
      [a("me", "Я", "snake"), a("u1", "Ед", "nope"), a("u2", "Neko", "snake"), null, 5],
      "me",
    );
    expect(parsed.map((p) => p.username)).toEqual(["Neko"]);
  });
});

describe("groupGameActivities", () => {
  it("groups players of one game and splits different games", () => {
    const { lines, hiddenLines } = groupGameActivities(
      parseGameActivities([a("1", "Ед", "snake"), a("2", "Neko", "snake"), a("3", "Ліда", "doodle")]),
    );
    expect(lines).toEqual([
      { game: "snake", names: ["Ед", "Neko"], joinable: true, sessionId: "r:snake" },
      { game: "doodle", names: ["Ліда"], joinable: true, sessionId: "r:doodle" },
    ]);
    expect(hiddenLines).toBe(0);
  });

  it("caps at two lines and counts the rest", () => {
    const { lines, hiddenLines } = groupGameActivities(
      parseGameActivities([a("1", "A", "snake"), a("2", "B", "doodle"), a("3", "C", "filword", false)]),
    );
    expect(lines).toHaveLength(2);
    expect(hiddenLines).toBe(1);
  });
});
