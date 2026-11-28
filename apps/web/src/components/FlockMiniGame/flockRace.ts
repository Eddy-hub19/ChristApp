/**
 * Спільні типи й дрібні формули HUD гоночних режимів («Лабіринт», далі «Печерний забіг»). Лише дані для відмальовки:
 * мережі тут нема, склейка з сервером наповнює ці структури.
 */
export type RacePhase = "lobby" | "countdown" | "racing" | "results" | "spectating";

/** Чому нагороди нема (код від сервера; мапиться на підпис у `flock.race.noReward.*`). */
export type RaceNoRewardReason = "notWinner" | "onlyBots" | "minHumans" | "dailyLimit" | "afk" | "none";

export interface RaceHudData {
  phase: RacePhase;
  /** Скільки мс лишилось до кінця поточної фази (набір, відлік, раунд, підсумки). */
  leftMs: number;
  /** Моє місце (1..total) серед тих, хто ще біжить/фінішував; 0 - невідомо. */
  place: number;
  total: number;
  cpDone: number;
  cpTotal: number;
  /** Ривок: скільки мс лишилось до перезарядки й повна тривалість перезарядки (0 - готовий). */
  dashLeftMs: number;
  dashCdMs: number;
  /** Разова підказка: "go" на старті, "checkpoint" при проходженні факела. */
  hint: "go" | "checkpoint" | null;
}

export interface RaceToast {
  id: number;
  kind: "eatenBy" | "ate";
  name: string;
}

export interface RaceResultRow {
  pid: number;
  name: string;
  bot: boolean;
  me: boolean;
  /** 1.. для тих, хто фінішував; 0 - не фінішував. */
  place: number;
  /** Час фінішу, мс (null - не фінішував). */
  timeMs: number | null;
  ate: number;
  eaten: number;
}

export interface RaceResults {
  rows: RaceResultRow[];
  /** Рубіни переможцю в цьому раунді для МЕНЕ (0 - нема) і причина відсутності. */
  rewardRubies: number;
  noRewardReason: RaceNoRewardReason;
}

/** «1:23» для таймера. */
export function raceClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** «12.3» - секунди з десятими для підсумків. */
export function raceTime(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

/** Частка перезарядки, що вже минула (0..1); 1 - готовий. */
export function dashReady(left: number, cd: number): number {
  if (cd <= 0 || left <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - left / cd));
}
