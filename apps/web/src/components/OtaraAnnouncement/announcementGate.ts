import { useSyncExternalStore } from "react";
import { getAuthToken } from "@/lib/auth";
import { latestAnnouncement } from "./otaraAnnouncementData";

/**
 * Очередь окон при входе: не больше одного окна за запуск, объявление «Отари» приоритетнее общей плашки «Що нового».
 * pending - объявление ещё решает (общая плашка ждёт), show - объявление открыто, shown - уже показано в этом запуске,
 * none - объявления нет (общая плашка может показаться).
 */
export type AnnouncementGate = "pending" | "show" | "shown" | "none";

export const ANNOUNCEMENT_SEEN_KEY = "christapp:otaraAnnouncement:seen";

export function localAnnouncementSeen(): number {
  try {
    const v = Number(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY));
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** Нужно ли вообще решать про объявление (залогинен и локально версия ещё не помечена). */
export function announcementMayApply(): boolean {
  if (typeof window === "undefined") return false;
  const a = latestAnnouncement();
  return Boolean(a) && Boolean(getAuthToken()) && localAnnouncementSeen() < (a?.version ?? 0);
}

let state: AnnouncementGate = typeof window !== "undefined" && announcementMayApply() ? "pending" : "none";
const listeners = new Set<() => void>();

export function setAnnouncementGate(next: AnnouncementGate) {
  if (state === next) return;
  state = next;
  for (const l of listeners) l();
}

export const getAnnouncementGate = () => state;

export function useAnnouncementGate(): AnnouncementGate {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => "none" as AnnouncementGate,
  );
}
