import { describe, expect, it } from "vitest";
import type { AdminServerStatus } from "@/lib/queries/adminQueries";
import { cpuBudgetShare, evaluateArenaBudget, evaluateDbRtt, evaluateServerHealth } from "./adminHealth";

function status(over: {
  cpu?: number;
  lag?: number;
  ping?: number;
  dbOk?: boolean;
  waiting?: number;
}): AdminServerStatus {
  return {
    latest: {
      t: 0,
      cpuPercent: over.cpu ?? 5,
      rssMb: 200,
      heapUsedMb: 50,
      loopLagP50Ms: 0,
      loopLagP99Ms: over.lag ?? 1,
      loopLagMaxMs: 0,
    },
    db: {
      ok: over.dbOk ?? true,
      pingMs: over.ping ?? 10,
      pool: { total: 3, idle: 3, waiting: over.waiting ?? 0, max: 10 },
    },
  } as AdminServerStatus;
}

describe("evaluateServerHealth", () => {
  it("is ok for an idle healthy server", () => {
    expect(evaluateServerHealth(status({})).overall).toBe("ok");
  });

  it("warns on high CPU or queued pool connections", () => {
    expect(evaluateServerHealth(status({ cpu: 90 })).overall).toBe("warn");
    expect(evaluateServerHealth(status({ waiting: 2 })).pool).toBe("warn");
  });

  it("goes bad on a blocked event loop or a dead database", () => {
    expect(evaluateServerHealth(status({ lag: 800 })).loopLag).toBe("bad");
    expect(evaluateServerHealth(status({ dbOk: false })).overall).toBe("bad");
  });

  it("takes the worst level overall", () => {
    expect(evaluateServerHealth(status({ cpu: 90, ping: 2000 })).overall).toBe(
      "bad",
    );
  });

  it("copes with no samples yet", () => {
    const s = status({});
    s.latest = null;
    expect(evaluateServerHealth(s).overall).toBe("ok");
  });
});

describe("cpuBudgetShare", () => {
  it("expresses single-core % as a share of the CPU budget", () => {
    const s = status({ cpu: 40 });
    expect(cpuBudgetShare(s)).toBe(40); // без бюджета - целое ядро
    s.cpuBudgetMs = 500;
    expect(cpuBudgetShare(s)).toBe(80);
    expect(evaluateServerHealth(s).cpu).toBe("warn");
  });
});

describe("evaluateArenaBudget", () => {
  it("is ok below 75%, warn up to 100%, bad from 100%", () => {
    expect(evaluateArenaBudget(7)).toBe("ok");
    expect(evaluateArenaBudget(74)).toBe("ok");
    expect(evaluateArenaBudget(75)).toBe("warn");
    expect(evaluateArenaBudget(99)).toBe("warn");
    expect(evaluateArenaBudget(100)).toBe("bad");
  });
});

describe("evaluateDbRtt", () => {
  it("is ok within a region, warn across neighbours, bad across continents", () => {
    expect(evaluateDbRtt(3)).toBe("ok");
    expect(evaluateDbRtt(30)).toBe("warn");
    expect(evaluateDbRtt(94)).toBe("bad");
  });
});
