import { describe, expect, it } from "vitest";
import { RoomHistoryHttpError } from "@/lib/chatMessagesApi";
import {
  HISTORY_MAX_RETRIES,
  historyRetryDelay,
  shouldRetryHistory,
  shouldShowCachedNotice,
  shouldShowHistoryError,
} from "./chatHistoryLoad";

describe("history retry policy", () => {
  it("backs off exponentially and covers a ~60s cold start", () => {
    const delays = Array.from({ length: HISTORY_MAX_RETRIES }, (_, i) => historyRetryDelay(i));
    expect(delays.slice(0, 4)).toEqual([1000, 2000, 4000, 8000]);
    expect(Math.max(...delays)).toBe(15_000);
    expect(delays.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(60_000);
  });

  it("retries network and 5xx errors but not 403/404", () => {
    expect(shouldRetryHistory(0, new Error("Network Error"))).toBe(true);
    expect(shouldRetryHistory(3, new RoomHistoryHttpError(503))).toBe(true);
    expect(shouldRetryHistory(0, new RoomHistoryHttpError(403))).toBe(false);
    expect(shouldRetryHistory(0, new RoomHistoryHttpError(404))).toBe(false);
    expect(shouldRetryHistory(HISTORY_MAX_RETRIES, new Error("x"))).toBe(false);
  });
});

describe("shouldShowHistoryError", () => {
  const base = { queryFailed: true, queryFetching: false, historyDelivered: false, hasMessages: false };
  it("shows only when retries are exhausted, socket is silent and nothing is cached", () => {
    expect(shouldShowHistoryError(base)).toBe(true);
    expect(shouldShowHistoryError({ ...base, queryFailed: false })).toBe(false);
    expect(shouldShowHistoryError({ ...base, queryFetching: true })).toBe(false);
    expect(shouldShowHistoryError({ ...base, historyDelivered: true })).toBe(false);
    expect(shouldShowHistoryError({ ...base, hasMessages: true })).toBe(false);
  });
});

describe("shouldShowCachedNotice", () => {
  const base = { hasMessages: true, historyDelivered: false, queryFailed: false, offline: false };
  it("appears for cached messages on a network problem only", () => {
    expect(shouldShowCachedNotice(base)).toBe(false);
    expect(shouldShowCachedNotice({ ...base, offline: true })).toBe(true);
    expect(shouldShowCachedNotice({ ...base, queryFailed: true })).toBe(true);
    expect(shouldShowCachedNotice({ ...base, queryFailed: true, historyDelivered: true })).toBe(false);
    expect(shouldShowCachedNotice({ ...base, queryFailed: true, hasMessages: false })).toBe(false);
  });
});
