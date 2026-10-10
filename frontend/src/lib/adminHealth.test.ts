import { describe, expect, it } from "vitest";
import type { AdminServerStatus } from "@/lib/queries/adminQueries";
import { evaluateServerHealth } from "./adminHealth";

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
