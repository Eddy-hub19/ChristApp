import { latestAppVersion } from "@/components/AppWhatsNew/appWhatsNewData";

/** Последняя версия списка обновлений, которую пользователь уже открыл (точка на значке гаснет). */
const OPENED_KEY = "christapp:appUpdates:opened";
export const UPDATES_OPENED_EVENT = "christapp:appUpdates:opened";

export function getOpenedUpdatesVersion(): number {
  try {
    const v = Number(localStorage.getItem(OPENED_KEY));
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function markUpdatesOpened() {
  try {
    localStorage.setItem(OPENED_KEY, String(latestAppVersion()));
  } catch {
    /* приватный режим */
  }
  window.dispatchEvent(new Event(UPDATES_OPENED_EVENT));
}
