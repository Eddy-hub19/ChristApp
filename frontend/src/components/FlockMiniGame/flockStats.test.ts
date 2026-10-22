import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLegacyFlockStats, loadLegacyFlockStats } from "./flockStats";

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

  it("читає стару статистику з localStorage для разового переносу", () => {
    expect(loadLegacyFlockStats("u1")).toBeNull();
    localStorage.setItem("christapp:flock:stats:u1", JSON.stringify({ bestMass: 120, eaten: 3, topMs: 7500, games: 2 }));
    expect(loadLegacyFlockStats("u1")).toEqual({ bestMass: 120, eaten: 3, topMs: 7500, games: 2 });
    expect(loadLegacyFlockStats("u2")).toBeNull();
  });

  it("після переносу ключ прибирається, повторного переносу не буде", () => {
    localStorage.setItem("christapp:flock:stats:u1", JSON.stringify({ bestMass: 5, eaten: 1, topMs: 1, games: 1 }));
    clearLegacyFlockStats("u1");
    expect(loadLegacyFlockStats("u1")).toBeNull();
  });

  it("битий JSON або порожня статистика не ламають", () => {
    localStorage.setItem("christapp:flock:stats:u1", "{oops");
    expect(loadLegacyFlockStats("u1")).toBeNull();
    localStorage.setItem("christapp:flock:stats:u1", JSON.stringify({ bestMass: 0, eaten: 0, topMs: 0, games: 0 }));
    expect(loadLegacyFlockStats("u1")).toBeNull();
  });

});
