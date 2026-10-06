import { describe, expect, it } from "vitest";
import { isSystemMessage, systemMessageText, systemMessageTime, type WatchSystemData } from "./watchSystemMessage";

const t = (key: string, values?: Record<string, string>) =>
  `${key}${values ? `:${Object.values(values).join("|")}` : ""}`;
const user = { nickname: "Ед", username: "ed" };
const members = [{ id: "n", nickname: null, username: "neko" }];
const msg = (data: WatchSystemData | null) => ({
  createdAt: "2026-10-06T19:14:00.000Z",
  type: "SYSTEM" as const,
  systemData: data,
  user,
});

describe("systemMessageText", () => {
  it("builds the three basic rows", () => {
    expect(systemMessageText(t, msg({ event: "left", at: "x" }), members)).toBe("systemLeft:Ед");
    expect(systemMessageText(t, msg({ event: "joined", at: "x" }), members)).toBe("systemJoined:Ед");
    expect(systemMessageText(t, msg({ event: "back", at: "x" }), members)).toBe("systemBack:Ед");
  });

  it("host leaving names the new host or the pause", () => {
    expect(systemMessageText(t, msg({ event: "left", at: "x", wasHost: true, toUserId: "n" }), members)).toBe(
      "systemHostLeftHandover:Ед|neko",
    );
    expect(systemMessageText(t, msg({ event: "left", at: "x", wasHost: true, paused: true }), members)).toBe(
      "systemHostLeftPaused:Ед",
    );
    expect(systemMessageText(t, msg({ event: "left", at: "x", wasHost: true, toUserId: "gone" }), members)).toBe(
      "systemHostLeft:Ед",
    );
  });

  it("is empty for broken data, and the time prefers `at`", () => {
    expect(systemMessageText(t, msg(null), members)).toBe("");
    expect(systemMessageTime(msg({ event: "back", at: "2026-10-06T19:20:00.000Z" }))).toBe("2026-10-06T19:20:00.000Z");
    expect(isSystemMessage({ type: "SYSTEM" })).toBe(true);
    expect(isSystemMessage({})).toBe(false);
  });
});
