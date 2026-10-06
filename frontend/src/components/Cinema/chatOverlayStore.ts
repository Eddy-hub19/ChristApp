"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "christapp:cinema:chat-overlay";
const listeners = new Set<() => void>();
/** Запасний варіант, якщо localStorage недоступний (приватний режим): вибір живе до перезавантаження. */
let memoryEnabled = true;

function read(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "off") return false;
    if (raw === "on") return true;
  } catch {
    /* сховище недоступне */
  }
  return memoryEnabled;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Оверлей повідомлень у fullscreen: увімкнено за замовчуванням, вибір памʼятається. */
export function useChatOverlayEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => true);
  const setEnabled = useCallback((next: boolean) => {
    memoryEnabled = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* сховище недоступне */
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [enabled, setEnabled];
}
