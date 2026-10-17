import { describe, expect, it } from "vitest";
import { buildGameInviteMessage, isPairGame, parseGameInvite } from "./gameInviteMessage";

describe("game invite message", () => {
  it("round-trips pair games", () => {
    for (const game of ["snake", "doodle", "guess", "puzzle"] as const) {
      expect(parseGameInvite(buildGameInviteMessage(game))).toEqual({ game });
    }
  });
  it("rejects unknown/solo games and plain text", () => {
    expect(parseGameInvite("[[game-invite:filword]]")).toBeNull();
    expect(parseGameInvite("[[game-invite:nope]]")).toBeNull();
    expect(parseGameInvite("hi [[game-invite:snake]]")).toBeNull();
    expect(parseGameInvite(null)).toBeNull();
    expect(isPairGame("flock")).toBe(false);
  });
});
