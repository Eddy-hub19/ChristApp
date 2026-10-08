import { describe, expect, it } from "vitest";
import {
  isPermanentRequestError,
  requestRetryDelay,
  shouldRetryRequest,
} from "./queryPolicy";

describe("queryPolicy", () => {
  it("мережа та 5xx повторюються до ліміту", () => {
    expect(shouldRetryRequest(0, new Error("Network Error"))).toBe(true);
    expect(shouldRetryRequest(2, { status: 503 })).toBe(true);
    expect(shouldRetryRequest(3, { status: 503 })).toBe(false);
  });

  it("401/403/404 не повторюються, 429/408 — повторюються", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isPermanentRequestError({ status })).toBe(true);
      expect(shouldRetryRequest(0, { status })).toBe(false);
    }
    expect(shouldRetryRequest(0, { status: 429 })).toBe(true);
    expect(shouldRetryRequest(0, { response: { status: 408 } })).toBe(true);
    expect(shouldRetryRequest(0, { response: { status: 404 } })).toBe(false);
  });

  it("пауза зростає й обмежена 15 с", () => {
    expect([0, 1, 2, 3].map(requestRetryDelay)).toEqual([1000, 2000, 4000, 8000]);
    expect(requestRetryDelay(10)).toBe(15_000);
  });
});
