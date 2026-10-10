import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFlockSession,
  isResumable,
  loadFlockSession,
  resumeRemainingMs,
  saveFlockSession,
  waitingSession,
  type StoredFlockSession,
} from "./flockSession";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const TOKEN = "0123456789abcdef0123456789abcdef";
const make = (over: Partial<StoredFlockSession> = {}): StoredFlockSession => ({
  token: TOKEN,
  arenaId: 3,
  skin: 4,
  savedAt: 1_000_000,
  pauseMs: 20_000,
  connected: false,
  ...over,
});

describe("flockSession", () => {
  let session: ReturnType<typeof memoryStorage>;
  let local: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    session = memoryStorage();
    local = memoryStorage();
    vi.stubGlobal("window", { sessionStorage: session, localStorage: local });
  });

  it("зберігає в обох сховищах і читає найсвіжіше", () => {
    saveFlockSession(make());
    expect(session.getItem("christapp:flock:session")).toBeTruthy();
    expect(local.getItem("christapp:flock:session")).toBeTruthy();
    // вкладка закрита: sessionStorage порожній, localStorage лишився
    session.clear();
    expect(loadFlockSession()?.token).toBe(TOKEN);
    // у sessionStorage свіжіше
    session.setItem("christapp:flock:session", JSON.stringify(make({ savedAt: 2_000_000 })));
    expect(loadFlockSession()?.savedAt).toBe(2_000_000);
  });

  it("clear чистить обидва; битий JSON і чужий токен ігноруються", () => {
    saveFlockSession(make());
    clearFlockSession();
    expect(loadFlockSession()).toBeNull();
    session.setItem("christapp:flock:session", "{oops");
    local.setItem("christapp:flock:session", JSON.stringify({ token: "bad", savedAt: 1 }));
    expect(loadFlockSession()).toBeNull();
  });

  it("повернення за 10 с - токен діє, через 25 с - ні", () => {
    const s = make();
    expect(isResumable(s, s.savedAt + 10_000)).toBe(true);
    expect(resumeRemainingMs(s, s.savedAt + 10_000)).toBeGreaterThan(9_000);
    expect(isResumable(s, s.savedAt + 25_000)).toBe(false);
    expect(resumeRemainingMs(null)).toBe(0);
  });

  it("банер 'овечка чекає': є, поки токен свіжий і гра не відкрита; зникає по закінченню часу", () => {
    saveFlockSession(make({ savedAt: 1_000_000 }));
    expect(waitingSession(1_000_000 + 6_000)?.remainingMs).toBeLessThanOrEqual(14_000);
    expect(waitingSession(1_000_000 + 6_000)?.remainingMs).toBeGreaterThan(13_000);
    expect(waitingSession(1_000_000 + 30_000)).toBeNull();
  });

  it("поки гра відкрита й оновлює savedAt - банера немає; якщо оновлення зупинились - є", () => {
    saveFlockSession(make({ connected: true, savedAt: 1_000_000 }));
    expect(waitingSession(1_000_000 + 1_000)).toBeNull();
    expect(waitingSession(1_000_000 + 8_000)).not.toBeNull(); // вкладку вбито - гра не оновлює
  });
});
