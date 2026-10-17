import { getHttpApiBase } from "@/lib/apiBase";
import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import type { FlockStats } from "./flockStats";

export interface FlockMe {
  rubies: number;
  ownedSkins: number[];
  selectedSkin: number;
  statsImported: boolean;
  stats: FlockStats;
  config: { skinPrice: number; freeSkins: number; totalSkins: number; top1Reward: number; top1MassThreshold: number };
}

/** Помилка від сервера з машинним кодом (`not_enough`, `already_owned`, ...). */
export class FlockApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code ?? `flock request failed: ${status}`);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new FlockApiError(401, null);
  const res = await apiFetch(`${getHttpApiBase()}/flock${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string } & Record<string, unknown>;
    throw new FlockApiError(res.status, typeof body.code === "string" ? body.code : null, body);
  }
  return (await res.json()) as T;
}

export const fetchFlockMe = () => call<FlockMe>("/me");
export const buyFlockSkin = (skinId: number) => call<{ rubies: number; skinId: number }>(`/skins/${skinId}/buy`, { method: "POST" });
export const selectFlockSkin = (skin: number) => call<{ ok: true }>("/skin", { method: "PUT", body: JSON.stringify({ skin }) });
export const importFlockStats = (stats: FlockStats) =>
  call<{ imported: boolean; stats: FlockStats }>("/stats/import", { method: "POST", body: JSON.stringify(stats) });
