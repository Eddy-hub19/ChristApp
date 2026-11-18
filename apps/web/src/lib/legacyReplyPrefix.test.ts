import { describe, expect, it } from "vitest";
import { parseLegacyReplyPrefix, stripLegacyReplyPrefix } from "./legacyReplyPrefix";

const legacy = (meta: object, text: string) =>
  `[[reply:${encodeURIComponent(JSON.stringify(meta))}]]${text}`;

describe("stripLegacyReplyPrefix", () => {
  it("leaves plain text untouched", () => {
    expect(stripLegacyReplyPrefix("Привіт, світе")).toBe("Привіт, світе");
  });

  it("strips the legacy reply prefix", () => {
    expect(stripLegacyReplyPrefix(legacy({ id: "m1", username: "bob", content: "давнє" }, "Так!"))).toBe("Так!");
  });

  it("strips nested prefixes (reply to a reply)", () => {
    const inner = legacy({ id: "a", username: "x", content: "c" }, "перша");
    expect(stripLegacyReplyPrefix(legacy({ id: "b", username: "y", content: "z" }, inner))).toBe("перша");
  });

  it("does not leak raw service text for a truncated prefix", () => {
    const raw = legacy({ id: "m1", username: "bob", content: "x".repeat(400) }, "текст");
    expect(stripLegacyReplyPrefix(raw.slice(0, 300))).toBe("");
  });

  it("handles empty and nullish input", () => {
    expect(stripLegacyReplyPrefix("")).toBe("");
    expect(stripLegacyReplyPrefix(null)).toBe("");
    expect(stripLegacyReplyPrefix(undefined)).toBe("");
  });

  it("keeps a sticker payload that follows the prefix", () => {
    const sticker = "[[sticker:cat]]/stickers/cat.png";
    expect(stripLegacyReplyPrefix(legacy({ id: "m", username: "u", content: "" }, sticker))).toBe(sticker);
  });
});

describe("parseLegacyReplyPrefix", () => {
  it("decodes the outer quote meta", () => {
    expect(parseLegacyReplyPrefix(legacy({ id: "m1", username: "bob", content: "давнє" }, "Так!"))).toEqual({
      text: "Так!",
      meta: { id: "m1", username: "bob", content: "давнє" },
    });
  });

  it("returns meta=null for broken JSON but still strips the prefix", () => {
    expect(parseLegacyReplyPrefix("[[reply:%E0%A4%A]]Текст")).toEqual({ text: "Текст", meta: null });
  });
});
