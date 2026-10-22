import { getHttpApiBase } from "@/lib/apiBase";
import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import type { FlockStats } from "./flockStats";

export interface FlockMe {
  rubies: number;
  ownedSkins: number[];
  selectedSkin: number;
  ownedArtifacts?: number[];
  /** Надетый артефакт (0 - ничего). */
  selectedArtifact?: number;
  /** Последняя просмотренная версия плашки «Що нового». */
  whatsNewSeen?: number;
  /** Приходить лише в тій відповіді, що нарахувала разовий бонус за перший вхід. */
  entryBonus?: number;
  statsImported: boolean;
  stats: FlockStats;
  config: { skinPrice: number; premiumSkinPrice?: number; specialSkinPrice?: number; artifactPrice?: number; freeSkins: number; premiumFrom?: number; specialFrom?: number; hiddenSkins?: number[]; totalSkins: number; top1Reward: number; top1MassThreshold: number };
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
export const buyFlockArtifact = (artifactId: number) => call<{ rubies: number; artifactId: number }>(`/artifacts/${artifactId}/buy`, { method: "POST" });
export const selectFlockArtifact = (artifact: number) => call<{ ok: true }>("/artifact", { method: "PUT", body: JSON.stringify({ artifact }) });
export const importFlockStats = (stats: FlockStats) =>
  call<{ imported: boolean; stats: FlockStats }>("/stats/import", { method: "POST", body: JSON.stringify(stats) });
export const markWhatsNewSeen = (version: number) =>
  call<{ whatsNewSeen: number }>("/whats-new", { method: "PUT", body: JSON.stringify({ version }) });
