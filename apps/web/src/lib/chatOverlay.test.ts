import { describe, expect, it } from "vitest";
import {
  addCard,
  cardFromMessage,
  editCard,
  isFading,
  OVERLAY_FADE_MS,
  OVERLAY_MAX_CARDS,
  OVERLAY_TTL_MS,
  pruneCards,
  removeCard,
} from "./chatOverlay";

const msg = (id: string, content = id) => ({
  id,
  content,
  user: { username: `user-${id}`, nickname: null },
});

describe("chatOverlay", () => {
  it("builds a card with nickname, one-line text and ttl", () => {
    const card = cardFromMessage(
      { id: "1", content: "hello\n  world", user: { username: "u", nickname: "Nick" } },
      1000,
    );
    expect(card).toMatchObject({ name: "Nick", text: "hello world", expiresAt: 1000 + OVERLAY_TTL_MS });
  });

  it("falls back to username and adds a reply label", () => {
    const card = cardFromMessage(
      { ...msg("2"), replyTo: { deleted: false, username: "Anna" } },
      0,
    );
    expect(card.name).toBe("user-2");
    expect(card.replyName).toBe("Anna");
    expect(cardFromMessage({ ...msg("3"), replyTo: { deleted: true } }, 0).replyName).toBeUndefined();
  });

  it("keeps at most 3 active cards, fading the oldest", () => {
    let cards = [] as ReturnType<typeof addCard>;
    for (let i = 1; i <= 4; i += 1) cards = addCard(cards, cardFromMessage(msg(String(i)), 0), 0);
    const active = cards.filter((card) => !isFading(card, 0));
    expect(active.map((card) => card.id)).toEqual(["2", "3", "4"]);
    expect(active).toHaveLength(OVERLAY_MAX_CARDS);
    expect(cards.find((card) => card.id === "1")?.expiresAt).toBe(OVERLAY_FADE_MS);
  });

  it("ignores a duplicate id", () => {
    const cards = addCard([], cardFromMessage(msg("1"), 0), 0);
    expect(addCard(cards, cardFromMessage(msg("1", "again"), 5), 5)).toBe(cards);
  });

  it("updates an edited card without resetting its timer", () => {
    const cards = addCard([], cardFromMessage(msg("1", "old"), 0), 0);
    const edited = editCard(cards, "1", "new text");
    expect(edited[0].text).toBe("new text");
    expect(edited[0].expiresAt).toBe(cards[0].expiresAt);
    expect(editCard(cards, "missing", "x")).toBe(cards);
  });

  it("fades a deleted card quickly", () => {
    const cards = addCard([], cardFromMessage(msg("1"), 0), 0);
    const removed = removeCard(cards, "1", 100);
    expect(removed[0].expiresAt).toBe(100 + OVERLAY_FADE_MS);
    expect(pruneCards(removed, 100 + OVERLAY_FADE_MS)).toEqual([]);
  });

  it("prunes expired cards only", () => {
    const cards = addCard([], cardFromMessage(msg("1"), 0), 0);
    expect(pruneCards(cards, OVERLAY_TTL_MS - 1)).toBe(cards);
    expect(pruneCards(cards, OVERLAY_TTL_MS)).toEqual([]);
  });
});
