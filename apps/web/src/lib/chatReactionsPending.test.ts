import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingReactions, RESYNC_TIMEOUT_MS } from "./chatReactionsPending";

describe("PendingReactions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const rolledBack: Array<[string, string]> = [];
    const pending = new PendingReactions<string>((id, prev) => rolledBack.push([id, prev]));
    return { pending, rolledBack };
  };

  it("затримане ехо не відкочує реакцію, скільки б не чекали", () => {
    const { pending, rolledBack } = make();
    pending.track("m1", "before");
    vi.advanceTimersByTime(10 * 60_000);
    expect(rolledBack).toEqual([]);
    expect(pending.has("m1")).toBe(true);
    pending.confirm("m1");
    expect(pending.has("m1")).toBe(false);
  });

  it("явна помилка сервера відкочує одразу, до стану перед першим перемиканням", () => {
    const { pending, rolledBack } = make();
    pending.track("m1", "before");
    pending.track("m1", "intermediate");
    pending.fail("m1");
    expect(rolledBack).toEqual([["m1", "before"]]);
    pending.fail("m1");
    expect(rolledBack).toHaveLength(1);
  });

  it("після перепідключення свіжа історія знімає очікування без відкату", () => {
    const { pending, rolledBack } = make();
    pending.track("m1", "before");
    pending.onReconnect();
    vi.advanceTimersByTime(RESYNC_TIMEOUT_MS - 1);
    pending.onHistoryResynced();
    vi.advanceTimersByTime(RESYNC_TIMEOUT_MS * 2);
    expect(rolledBack).toEqual([]);
  });

  it("після перепідключення ехо підтверджує реакцію вчасно — відкату немає", () => {
    const { pending, rolledBack } = make();
    pending.track("m1", "before");
    pending.onReconnect();
    vi.advanceTimersByTime(3000);
    pending.confirm("m1");
    vi.advanceTimersByTime(RESYNC_TIMEOUT_MS * 2);
    expect(rolledBack).toEqual([]);
  });

  it("перепідключились, а сервер так нічого й не підтвердив — відкат решти", () => {
    const { pending, rolledBack } = make();
    pending.track("m1", "a");
    pending.track("m2", "b");
    pending.onReconnect();
    vi.advanceTimersByTime(RESYNC_TIMEOUT_MS);
    expect(rolledBack).toEqual([["m1", "a"], ["m2", "b"]]);
  });
});
