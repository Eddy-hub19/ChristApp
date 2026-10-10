import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadControlMode, loadFlockStats, recordFlockRun, saveControlMode } from "./flockStats";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("flockStats", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("накопичує найкращий розмір, з'їдене, час у топ-1 і ігри", () => {
    expect(loadFlockStats("u1")).toEqual({ bestMass: 0, eaten: 0, topMs: 0, games: 0 });
    recordFlockRun("u1", { maxMass: 120.4, kills: 2, topMs: 5000 });
    const s = recordFlockRun("u1", { maxMass: 80, kills: 1, topMs: 2500 });
    expect(s).toEqual({ bestMass: 120, eaten: 3, topMs: 7500, games: 2 });
    expect(loadFlockStats("u2").games).toBe(0);
  });

  it("битий JSON не ламає", () => {
    localStorage.setItem("christapp:flock:stats:u1", "{oops");
    expect(loadFlockStats("u1").games).toBe(0);
  });

  it("режим керування запам'ятовується", () => {
    expect(loadControlMode()).toBe("follow");
    saveControlMode("joystick");
    expect(loadControlMode()).toBe("joystick");
  });
});
