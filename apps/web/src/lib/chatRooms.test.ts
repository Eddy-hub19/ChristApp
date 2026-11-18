import { describe, expect, it } from "vitest";
import {
  GLOBAL_ROOM_ID,
  createShareTargetsFromRooms,
  filterShareTargets,
} from "./chatRooms";

const me = "11111111-1111-1111-1111-111111111111";
const bob = "22222222-2222-2222-2222-222222222222";
const eve = "33333333-3333-3333-3333-333333333333";
const users = [
  { id: bob, username: "bob" },
  { id: eve, username: "eve", nickname: "Єва" },
];
const rooms = [
  { id: "r-dm-bob", title: `dm:${me}:${bob}`, lastMessageAt: "2026-10-17T10:00:00Z" },
  { id: "r-dm-eve", title: `dm:${eve}:${me}`, lastMessageAt: "2026-10-17T12:00:00Z" },
  { id: "r-group", title: "Молитовна група", lastMessageAt: "2026-10-16T09:00:00Z" },
  { id: "r-jesus", title: `share-with-jesus:${me}` },
];

describe("createShareTargetsFromRooms", () => {
  it("orders global, groups, then direct chats by last message", () => {
    const list = createShareTargetsFromRooms({ rooms, currentUserId: me, users, includeShareWithJesus: false });
    expect(list.map((t) => [t.kind, t.title])).toEqual([
      ["global", "Общий чат для всех"],
      ["group", "Молитовна група"],
      ["direct", "Єва"],
      ["direct", "bob"],
    ]);
    expect(list[0].roomId).toBe(GLOBAL_ROOM_ID);
  });

  it("hides Share-with-Jesus only when asked to", () => {
    const withJesus = createShareTargetsFromRooms({ rooms, currentUserId: me, users });
    expect(withJesus[0].kind).toBe("jesus");
    const without = createShareTargetsFromRooms({ rooms, currentUserId: me, users, includeShareWithJesus: false });
    expect(without.some((t) => t.kind === "jesus")).toBe(false);
  });

  it("always includes the global chat, even if the server did not list it", () => {
    const list = createShareTargetsFromRooms({ rooms: [], currentUserId: me, users, includeShareWithJesus: false });
    expect(list.map((t) => t.kind)).toEqual(["global"]);
  });

  it("filters by title", () => {
    const list = createShareTargetsFromRooms({ rooms, currentUserId: me, users });
    expect(filterShareTargets(list, "мол").map((t) => t.title)).toEqual(["Молитовна група"]);
    expect(filterShareTargets(list, "  ")).toHaveLength(list.length);
  });
});
