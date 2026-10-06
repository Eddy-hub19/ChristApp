"use client";

import { useCallback, useSyncExternalStore } from "react";

const WIDTH_KEY = "christapp:cinema:chat-width";
const COLLAPSED_KEY = "christapp:cinema:chat-collapsed";

export const CHAT_MIN_WIDTH = 320;
export const CHAT_MAX_WIDTH = 720;
/** Чат не може забрати більше цієї частки ширини вікна — плеєру завжди лишається місце. */
export const CHAT_MAX_VIEWPORT_SHARE = 0.5;

type Snapshot = { width: number | null; collapsed: boolean };

const SERVER_SNAPSHOT: Snapshot = { width: null, collapsed: false };
const listeners = new Set<() => void>();
/** Запасний варіант, якщо localStorage недоступний (приватний режим): вибір живе до перезавантаження. */
let memory: Snapshot = SERVER_SNAPSHOT;
let cached: Snapshot | null = null;

export function clampChatWidth(px: number, viewportWidth = window.innerWidth): number {
  const max = Math.max(CHAT_MIN_WIDTH, Math.min(CHAT_MAX_WIDTH, viewportWidth * CHAT_MAX_VIEWPORT_SHARE));
  return Math.round(Math.min(max, Math.max(CHAT_MIN_WIDTH, px)));
}

function read(): Snapshot {
  let width = memory.width;
  let collapsed = memory.collapsed;
  try {
    const rawWidth = window.localStorage.getItem(WIDTH_KEY);
    if (rawWidth !== null) {
      const parsed = Number(rawWidth);
      if (Number.isFinite(parsed)) width = parsed;
    }
    const rawCollapsed = window.localStorage.getItem(COLLAPSED_KEY);
    if (rawCollapsed === "1") collapsed = true;
    else if (rawCollapsed === "0") collapsed = false;
  } catch {
    /* сховище недоступне */
  }
  // useSyncExternalStore вимагає стабільного посилання, поки значення не змінилось.
  if (cached && cached.width === width && cached.collapsed === collapsed) return cached;
  cached = { width, collapsed };
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function commit(next: Partial<Snapshot>) {
  memory = { ...read(), ...next };
  try {
    if (next.width !== undefined) {
      if (next.width === null) window.localStorage.removeItem(WIDTH_KEY);
      else window.localStorage.setItem(WIDTH_KEY, String(next.width));
    }
    if (next.collapsed !== undefined) window.localStorage.setItem(COLLAPSED_KEY, next.collapsed ? "1" : "0");
  } catch {
    /* сховище недоступне */
  }
  listeners.forEach((listener) => listener());
}

/**
 * Десктопна розкладка залу: ширина чату (null — стандартна з CSS) і чи згорнутий чат.
 * Вибір памʼятається між візитами.
 */
export function useChatLayout() {
  const { width, collapsed } = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
  const setWidth = useCallback((px: number | null) => commit({ width: px === null ? null : clampChatWidth(px) }), []);
  const setCollapsed = useCallback((next: boolean) => commit({ collapsed: next }), []);
  return { width, collapsed, setWidth, setCollapsed };
}
