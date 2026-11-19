import { useSyncExternalStore } from "react";

/**
 * Как на ПК открывается переписка (новый дизайн): "split" - список слева и окно чата справа, как в Telegram;
 * "single" - список на весь экран, чат открывается отдельным экраном. Хранится в localStorage этого браузера.
 */
export type ChatLayoutPref = "split" | "single";
export const CHAT_LAYOUT_STORAGE_KEY = "christapp:chatLayout";
export const DEFAULT_CHAT_LAYOUT: ChatLayoutPref = "split";

const listeners = new Set<() => void>();

export function getChatLayoutPref(): ChatLayoutPref {
  try {
    return window.localStorage.getItem(CHAT_LAYOUT_STORAGE_KEY) === "single" ? "single" : DEFAULT_CHAT_LAYOUT;
  } catch {
    return DEFAULT_CHAT_LAYOUT;
  }
}

export function setChatLayoutPref(next: ChatLayoutPref) {
  try {
    window.localStorage.setItem(CHAT_LAYOUT_STORAGE_KEY, next);
  } catch {}
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CHAT_LAYOUT_STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChatLayoutPref(): ChatLayoutPref {
  return useSyncExternalStore(subscribe, getChatLayoutPref, () => DEFAULT_CHAT_LAYOUT);
}
