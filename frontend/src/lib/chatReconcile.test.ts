import { describe, expect, it } from "vitest";
import { reconcileMessages } from "./chatReconcile";

type M = { id: string; createdAt: string; content: string; reactions?: string[] };
const msg = (id: string, minute: number, content = id, reactions?: string[]): M => ({
  id,
  createdAt: `2026-01-01T10:${String(minute).padStart(2, "0")}:00.000Z`,
  content,
  reactions,
});

describe("reconcileMessages", () => {
  it("returns the same array when nothing changed", () => {
    const prev = [msg("a", 1), msg("b", 2)];
    const fresh = [msg("a", 1), msg("b", 2)];
    expect(reconcileMessages(prev, fresh)).toBe(prev);
  });

  it("keeps object identity of unchanged messages", () => {
    const prev = [msg("a", 1), msg("b", 2)];
    const result = reconcileMessages(prev, [msg("a", 1), msg("b", 2), msg("c", 3)]);
    expect(result[0]).toBe(prev[0]);
    expect(result[1]).toBe(prev[1]);
    expect(result.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("removes messages deleted on the server", () => {
    const prev = [msg("a", 1), msg("gone", 2), msg("c", 3)];
    const result = reconcileMessages(prev, [msg("a", 1), msg("c", 3)]);
    expect(result.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("updates edited messages and reactions", () => {
    const prev = [msg("a", 1, "old"), msg("b", 2, "b", [])];
    const edited = msg("a", 1, "new");
    const reacted = msg("b", 2, "b", ["👍"]);
    const result = reconcileMessages(prev, [edited, reacted]);
    expect(result[0].content).toBe("new");
    expect(result[1].reactions).toEqual(["👍"]);
  });

  it("keeps live messages newer than the fetched window", () => {
    const prev = [msg("a", 1), msg("live", 9)];
    const result = reconcileMessages(prev, [msg("a", 1), msg("b", 2)]);
    expect(result.map((m) => m.id)).toEqual(["a", "b", "live"]);
  });

  it("drops everything when the server window is empty", () => {
    expect(reconcileMessages([msg("a", 1)], [])).toEqual([]);
  });

  it("keeps unsent local messages even when the fetched window is newer", () => {
    const local = { ...msg("tmp-c1", 1), clientMessageId: "c1", deliveryStatus: "failed" as const };
    const result = reconcileMessages([msg("a", 1), local], [msg("a", 1), msg("peer", 5)]);
    expect(result.map((m) => m.id)).toEqual(["a", "peer", "tmp-c1"]);
  });

  it("drops the local bubble once history contains its clientMessageId", () => {
    const local = { ...msg("tmp-c1", 1), clientMessageId: "c1", deliveryStatus: "sending" as const };
    const delivered = { ...msg("srv", 1), clientMessageId: "c1" };
    const result = reconcileMessages([msg("a", 1), local], [msg("a", 1), delivered]);
    expect(result.map((m) => m.id)).toEqual(["a", "srv"]);
  });
});
