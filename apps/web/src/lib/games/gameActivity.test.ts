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
      [a("me", "Я", "doodle"), a("u1", "Ед", "nope"), a("u2", "Neko", "doodle"), null, 5],
      "me",
    );
    expect(parsed.map((p) => p.username)).toEqual(["Neko"]);
  });
});

describe("groupGameActivities", () => {
  it("groups players of one game and splits different games", () => {
    const { lines, hiddenLines } = groupGameActivities(
      parseGameActivities([a("1", "Ед", "doodle"), a("2", "Neko", "doodle"), a("3", "Ліда", "guess")]),
    );
    expect(lines).toEqual([
      { game: "doodle", names: ["Ед", "Neko"], joinable: true, sessionId: "r:doodle" },
      { game: "guess", names: ["Ліда"], joinable: true, sessionId: "r:guess" },
    ]);
    expect(hiddenLines).toBe(0);
  });

  it("caps at two lines and counts the rest", () => {
    const { lines, hiddenLines } = groupGameActivities(
      parseGameActivities([a("1", "A", "doodle"), a("2", "B", "guess"), a("3", "C", "puzzle")]),
    );
    expect(lines).toHaveLength(2);
    expect(hiddenLines).toBe(1);
  });
});
