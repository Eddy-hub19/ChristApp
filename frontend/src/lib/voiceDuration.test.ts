import { describe, expect, it } from "vitest";
import { sanitizeVoiceDuration, voiceDurationFromTimer } from "./voiceDuration";

describe("sanitizeVoiceDuration", () => {
  it("rounds a number", () => expect(sanitizeVoiceDuration(7.2)).toBe(7));
  it("accepts a numeric string", () => expect(sanitizeVoiceDuration("7.6")).toBe(8));
  it("skips NaN to the fallback", () => expect(sanitizeVoiceDuration(NaN, 5)).toBe(5));
  it("skips Infinity to the fallback", () => expect(sanitizeVoiceDuration(Infinity, 5)).toBe(5));
  it("skips negative values", () => expect(sanitizeVoiceDuration(-1, 4)).toBe(4));
  it("returns undefined when missing", () => {
    expect(sanitizeVoiceDuration(undefined)).toBeUndefined();
    expect(sanitizeVoiceDuration(NaN, Infinity)).toBeUndefined();
  });
});

describe("voiceDurationFromTimer", () => {
  it("uses the recorded time in seconds", () => expect(voiceDurationFromTimer(7200)).toBe(7));
  it("falls back to the timer when the recording time is broken", () => {
    expect(voiceDurationFromTimer(NaN, 6)).toBe(6);
    expect(voiceDurationFromTimer(undefined, 6)).toBe(6);
  });
});
