import { getHttpApiBase } from "@/lib/apiBase";
import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import type { FlockStats } from "./flockStats";

/** Числа из flock.config.ts для экрана «Про гру» (приходят в /flock/me, config.game): путь вида `bonusDurations.speed`. */
export type FlockGameConfig = { [key: string]: number | FlockGameConfig };

export interface FlockDailyBoard {
  top: { rank: number; name: string; avatarUrl: string | null; mass: number; me: boolean; /** Дні серії №1 у держателя серії (0/немає - не держатель). */ streakDays?: number }[];
  /** Лучший результат игрока за сегодня и место (null - сегодня не играл). */
  me: { rank: number; mass: number } | null;
  /** Заполнено только у текущего лидера дня: сколько дней подряд (с сегодняшним). */
  streak: { days: number; reward: number } | null;
  resetsInMs: number;
  config: { streakRewards: number[]; streakDays: number; minMass: number };
}

export interface FlockMe {
  daily?: FlockDailyBoard;
  /** Рубины за серию дней на 1-м месте, выданные сервером, пока игрока не было (приходят один раз). */
  streakAward?: number;
  /** Какой день серии дал эту награду (1..N); 0 - сумма нескольких непоказанных наград. */
  streakAwardDay?: number;
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
  /** Нагорода за колекцію преміум-скінів, нарахована цим запитом (разово). */
  premiumCollection?: number;
  /** Нагорода за колекцію вже отримана. */
  premiumCollectionClaimed?: boolean;
  statsImported: boolean;
  stats: FlockStats;
  config: { skinPrice: number; premiumSkinPrice?: number; specialSkinPrice?: number; premiumCollectionReward?: number; artifactPrice?: number; freeSkinIds?: number[]; premiumSkinIds?: number[]; specialFrom?: number; hiddenSkins?: number[]; totalSkins: number; top1Reward: number; top1MassThreshold: number; game?: FlockGameConfig };
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
export const fetchFlockDaily = () => call<FlockDailyBoard>("/daily");
export const buyFlockSkin = (skinId: number) => call<{ rubies: number; skinId: number; premiumCollection?: number }>(`/skins/${skinId}/buy`, { method: "POST" });
export const selectFlockSkin = (skin: number) => call<{ ok: true }>("/skin", { method: "PUT", body: JSON.stringify({ skin }) });
export const buyFlockArtifact = (artifactId: number) => call<{ rubies: number; artifactId: number }>(`/artifacts/${artifactId}/buy`, { method: "POST" });
export const selectFlockArtifact = (artifact: number) => call<{ ok: true }>("/artifact", { method: "PUT", body: JSON.stringify({ artifact }) });
export const importFlockStats = (stats: FlockStats) =>
  call<{ imported: boolean; stats: FlockStats }>("/stats/import", { method: "POST", body: JSON.stringify(stats) });
export const markWhatsNewSeen = (version: number) =>
  call<{ whatsNewSeen: number }>("/whats-new", { method: "PUT", body: JSON.stringify({ version }) });
