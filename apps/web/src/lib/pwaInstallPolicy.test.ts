import { describe, expect, it } from "vitest";
import {
  EMPTY_PWA_STATE,
  PWA_MIN_SESSION_MS,
  PWA_STATE_KEY,
  canShowInstallPrompt,
  dismissPauseMs,
  isInstallPromptBlockedPath,
  readPwaState,
  recordDismiss,
  recordInstalled,
  type PwaGateContext,
} from "./pwaInstallPolicy";

const HOUR = 3_600_000;
const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};
const base: PwaGateContext = {
  now: 1_000_000_000_000,
  sessionMs: PWA_MIN_SESSION_MS + 1,
  pathname: "/chat",
  standalone: false,
  fullscreen: false,
  modalOpen: false,
  visible: true,
  state: EMPTY_PWA_STATE,
};

describe("dismiss pause", () => {
  it("24h for the first two dismissals, 7 days from the third in a row", () => {
    expect(dismissPauseMs(1)).toBe(24 * HOUR);
    expect(dismissPauseMs(2)).toBe(24 * HOUR);
    expect(dismissPauseMs(3)).toBe(7 * 24 * HOUR);
    expect(dismissPauseMs(9)).toBe(7 * 24 * HOUR);
  });

  it("hidden at +23h, shown at +25h; after the 3rd dismissal still hidden at +25h", () => {
    const s = memory();
    const t0 = base.now;
    const st1 = recordDismiss(t0, s);
    expect(canShowInstallPrompt({ ...base, now: t0 + 23 * HOUR, state: st1 })).toBe(false);
    expect(canShowInstallPrompt({ ...base, now: t0 + 25 * HOUR, state: st1 })).toBe(true);
    recordDismiss(t0 + 25 * HOUR, s);
    const st3 = recordDismiss(t0 + 50 * HOUR, s);
    expect(st3.dismissCount).toBe(3);
    expect(canShowInstallPrompt({ ...base, now: t0 + 75 * HOUR, state: st3 })).toBe(false);
    expect(canShowInstallPrompt({ ...base, now: t0 + 50 * HOUR + 7 * 24 * HOUR + 1, state: st3 })).toBe(true);
  });
});

describe("never / not now", () => {
  it("never in standalone or after install", () => {
    expect(canShowInstallPrompt({ ...base, standalone: true })).toBe(false);
    const s = memory();
    expect(canShowInstallPrompt({ ...base, state: recordInstalled(s) })).toBe(false);
    expect(readPwaState(s).installed).toBe(true);
  });

  it("not during the first 30 seconds", () => {
    expect(canShowInstallPrompt({ ...base, sessionMs: 29_999 })).toBe(false);
    expect(canShowInstallPrompt({ ...base, sessionMs: 30_000 })).toBe(true);
  });

  it("not in games, cinema hall, fullscreen, over modals or in background", () => {
    for (const pathname of ["/games", "/games/flock", "/app/catch", "/cinema/abc", "/cinema/join/xyz", "/offline"]) {
      expect(isInstallPromptBlockedPath(pathname)).toBe(true);
      expect(canShowInstallPrompt({ ...base, pathname })).toBe(false);
    }
    for (const pathname of ["/chat", "/cinema", "/bible", "/profile", "/chat/global"]) {
      expect(isInstallPromptBlockedPath(pathname)).toBe(false);
    }
    expect(canShowInstallPrompt({ ...base, fullscreen: true })).toBe(false);
    expect(canShowInstallPrompt({ ...base, modalOpen: true })).toBe(false);
    expect(canShowInstallPrompt({ ...base, visible: false })).toBe(false);
  });
});

describe("storage", () => {
  it("survives broken data and honors the legacy iOS dismissal", () => {
    const s = memory();
    s.setItem(PWA_STATE_KEY, "{oops");
    expect(readPwaState(s)).toEqual(EMPTY_PWA_STATE);
    const legacy = memory();
    legacy.setItem("christapp_pwa_ios_hint_v1", JSON.stringify({ at: 123 }));
    expect(readPwaState(legacy)).toEqual({ dismissedAt: 123, dismissCount: 1, installed: false });
    expect(readPwaState(null)).toEqual(EMPTY_PWA_STATE);
  });
});
