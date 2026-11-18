import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  addRawVoiceListen,
  appendRawMessage,
  appendToCachedHistory,
  patchRawMessage,
  removeRawMessage,
  writeHistoryCache,
} from "./chatHistoryCache";
import { queryKeys } from "./queryKeys";
import type { RawHistoryMessage } from "./chatHistoryCache";

const m = (id: string | number, extra: Record<string, unknown> = {}): RawHistoryMessage => ({
  id,
  content: `c${id}`,
  ...extra,
});

describe("chatHistoryCache", () => {
  it("appendRawMessage не дублює повідомлення (id як рядок і число) і не мутує вхід", () => {
    const list = [m(1), m("2")];
    expect(appendRawMessage(list, m("1"))).toBe(list);
    expect(appendRawMessage(list, m(2))).toBe(list);
    const next = appendRawMessage(list, m(3));
    expect(next).toHaveLength(3);
    expect(list).toHaveLength(2);
    expect(appendRawMessage(list, {})).toBe(list);
  });

  it("patchRawMessage міняє лише потрібне, без змін повертає той самий масив", () => {
    const list = [m(1), m(2)];
    const next = patchRawMessage(list, 2, { content: "нове", isEdited: true });
    expect(next[1]).toMatchObject({ content: "нове", isEdited: true });
    expect(next[0]).toBe(list[0]);
    expect(patchRawMessage(list, 99, { content: "x" })).toBe(list);
  });

  it("removeRawMessage прибирає повідомлення й позначає цитати видаленими", () => {
    const list = [m(1), m(2, { replyTo: { id: 1 } }), m(3, { replyTo: { id: 2 } })];
    const next = removeRawMessage(list, 1);
    expect(next.map((x) => x.id)).toEqual([2, 3]);
    expect(next[0].replyTo?.deleted).toBe(true);
    expect(next[1].replyTo?.deleted).toBeUndefined();
    expect(removeRawMessage(list, 42)).toBe(list);
  });

  it("addRawVoiceListen додає слухача один раз", () => {
    const list = [m(1)];
    const once = addRawVoiceListen(list, 1, "u1");
    expect(once[0].voiceListens).toEqual([{ userId: "u1" }]);
    expect(addRawVoiceListen(once, 1, "u1")).toBe(once);
  });

  it("appendToCachedHistory дописує лише в закешовану й невідкриту кімнату", () => {
    const qc = new QueryClient();
    appendToCachedHistory(qc, "r1", m(1));
    expect(qc.getQueryData(queryKeys.chat.history("r1"))).toBeUndefined();

    writeHistoryCache(qc, "r1", [m(1)]);
    appendToCachedHistory(qc, "r1", m(2));
    expect(qc.getQueryData(queryKeys.chat.history("r1"))).toHaveLength(2);

    // відкрита кімната (є спостерігач) — сторінка веде історію сама
    const query = qc.getQueryCache().find({ queryKey: queryKeys.chat.history("r1") })!;
    query.addObserver({ onQueryUpdate() {}, getCurrentQuery: () => query } as never);
    appendToCachedHistory(qc, "r1", m(3));
    expect(qc.getQueryData(queryKeys.chat.history("r1"))).toHaveLength(2);
  });
});
