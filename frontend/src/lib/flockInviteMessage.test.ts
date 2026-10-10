import { describe, expect, it } from "vitest";
import { buildFlockInviteMessage, flockInvitePath, parseFlockInvite } from "./flockInviteMessage";
import { chatMessagePreview } from "./chatMessagePreview";
import { normalizeNotificationBody } from "./notifications";

describe("flock invite message", () => {
  it("builds and parses a payload with an arena", () => {
    const raw = buildFlockInviteMessage(7);
    expect(raw).toBe("[[flock-invite:7]]");
    expect(parseFlockInvite(raw)).toEqual({ arenaId: 7 });
    expect(parseFlockInvite(`  ${raw}\n`)).toEqual({ arenaId: 7 });
  });

  it("arena 0 / missing means 'any arena'", () => {
    expect(parseFlockInvite(buildFlockInviteMessage(null))).toEqual({ arenaId: null });
  });

  it("does not treat ordinary text as an invite, nor accept garbage", () => {
    expect(parseFlockInvite("привіт")).toBeNull();
    expect(parseFlockInvite("[[flock-invite:abc]]")).toBeNull();
    expect(parseFlockInvite("[[flock-invite:3]] ще текст")).toBeNull();
    expect(parseFlockInvite("x [[flock-invite:3]]")).toBeNull();
    expect(parseFlockInvite(null)).toBeNull();
  });

  it("path to the game", () => {
    expect(flockInvitePath(3)).toBe("/games/flock?arena=3");
    expect(flockInvitePath(null)).toBe("/games/flock");
  });

  it("raw prefix never reaches chat-list previews or notifications", () => {
    const raw = buildFlockInviteMessage(4);
    expect(chatMessagePreview({ content: raw })).toBe("🐑 Запрошення в Отару");
    expect(chatMessagePreview({ content: raw }, ((k: string) => (k === "previewFlockInvite" ? "Invite" : k)))).toBe("Invite");
    expect(normalizeNotificationBody(raw)).not.toContain("[[");
  });
});
