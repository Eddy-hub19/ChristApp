import { describe, expect, it } from "vitest";
import { RoomHistoryHttpError } from "@/lib/chatMessagesApi";
import {
  HISTORY_MAX_RETRIES,
  createHistoryRefetchGate,
  isColdStartHistoryError,
  isTerminalHistoryError,
  historyRetryDelay,
  shouldRetryHistory,
  HISTORY_STALLED_AFTER_MS,
} from "./chatHistoryLoad";

describe("history retry policy", () => {
  it("backs off exponentially and covers a ~60s cold start", () => {
    const delays = Array.from({ length: HISTORY_MAX_RETRIES }, (_, i) => historyRetryDelay(i));
    expect(delays.slice(0, 4)).toEqual([1000, 2000, 4000, 8000]);
    expect(Math.max(...delays)).toBe(15_000);
    expect(delays.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(60_000);
  });

  it("retries network errors and 5xx for the whole cold-start window", () => {
    expect(shouldRetryHistory(0, new Error("Network Error"))).toBe(true);
    expect(shouldRetryHistory(3, new RoomHistoryHttpError(503))).toBe(true);
    expect(shouldRetryHistory(3, new RoomHistoryHttpError(500))).toBe(true);
    expect(shouldRetryHistory(HISTORY_MAX_RETRIES, new Error("x"))).toBe(false);
  });

  it("gives 401/403/404 exactly one retry, so there is no endless loop", () => {
    for (const status of [401, 403, 404]) {
      expect(shouldRetryHistory(0, new RoomHistoryHttpError(status))).toBe(true);
      expect(shouldRetryHistory(1, new RoomHistoryHttpError(status))).toBe(false);
    }
  });

  it("shows the quiet hint after about a minute", () => {
    expect(HISTORY_STALLED_AFTER_MS).toBe(60_000);
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
