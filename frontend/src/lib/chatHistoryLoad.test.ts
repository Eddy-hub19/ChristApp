import { describe, expect, it } from "vitest";
import { RoomHistoryHttpError } from "@/lib/chatMessagesApi";
import {
  HISTORY_MAX_RETRIES,
  createHistoryRefetchGate,
  isColdStartHistoryError,
  isTerminalHistoryError,
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

describe("terminal vs cold-start history errors", () => {
  it("treats 401/403/404 as terminal and never as a cold start", () => {
    for (const status of [401, 403, 404]) {
      const error = new RoomHistoryHttpError(status);
      expect(isTerminalHistoryError(error)).toBe(true);
      expect(isColdStartHistoryError(error)).toBe(false);
    }
  });

  it("treats network errors and 502/503/504 as cold start", () => {
    expect(isColdStartHistoryError(new Error("Network Error"))).toBe(true);
    for (const status of [502, 503, 504]) {
      expect(isColdStartHistoryError(new RoomHistoryHttpError(status))).toBe(true);
      expect(isTerminalHistoryError(new RoomHistoryHttpError(status))).toBe(false);
    }
    expect(isColdStartHistoryError(new RoomHistoryHttpError(500))).toBe(false);
    expect(isColdStartHistoryError(null)).toBe(false);
  });
});

describe("createHistoryRefetchGate", () => {
  it("lets one call through per interval", () => {
    let t = 1000;
    const gate = createHistoryRefetchGate(5000, () => t);
    expect(gate()).toBe(true);
    t += 4999;
    expect(gate()).toBe(false);
    t += 1;
    expect(gate()).toBe(true);
  });
});
