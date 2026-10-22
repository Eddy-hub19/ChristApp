import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { canSeeAdminPanelNav } from "@/lib/adminDashboardNav";
import { usersDirectoryQueryKey } from "@/lib/queries/usersQueries";

/**
 * Стили пузырей сообщений. Новый стиль = запись здесь (id + подпись в переводах `bubbleStyles.styles.<id>`),
 * блок переменных в styles/bubbleStyles.scss и id в backend/src/config/bubble-styles.ts.
 * "default" - обычный пузырь (без атрибута data-bubble-style).
 */
export const BUBBLE_STYLE_IDS = ["default", "lamb", "dove", "lion", "vine"] as const;
export type BubbleStyleId = (typeof BUBBLE_STYLE_IDS)[number];
export const DEFAULT_BUBBLE_STYLE: BubbleStyleId = "default";

/** Стили, у которых в углу первого сообщения группы рисуется персонаж. */
export const BUBBLE_STYLES_WITH_CHARACTER: ReadonlySet<BubbleStyleId> = new Set(["lamb", "dove", "lion"]);

export function normalizeBubbleStyle(value: unknown): BubbleStyleId {
  return typeof value === "string" && (BUBBLE_STYLE_IDS as readonly string[]).includes(value)
    ? (value as BubbleStyleId)
    : DEFAULT_BUBBLE_STYLE;
}

/**
 * Тестовый режим: "admin" - раздел настроек и стили видит только админ, "all" - все.
 * Переключается одной правкой. Зеркало: backend/src/config/bubble-styles.ts (BUBBLE_STYLES_ACCESS).
 */
export const BUBBLE_STYLES_ACCESS: "admin" | "all" = "admin";

export function canUseBubbleStyles(username: string | null | undefined): boolean {
  return BUBBLE_STYLES_ACCESS === "all" || canSeeAdminPanelNav(username);
}

// ---------- хранилище: стиль по пользователю (из сообщений, справочника и сокета) + локальная настройка ----------
const SHOW_OTHERS_KEY = "christapp:bubbleStyles:showOthers";

const styleByUser = new Map<string, BubbleStyleId>();
const listeners = new Set<() => void>();
let version = 0;
let showOthers: boolean | null = null;

function emit() {
  version++;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Запомнить стиль пользователя; перерисовка только если значение изменилось. */
export function setUserBubbleStyle(userId: string | undefined | null, style: unknown): void {
  if (!userId) return;
  const next = normalizeBubbleStyle(style);
  if ((styleByUser.get(userId) ?? DEFAULT_BUBBLE_STYLE) === next && styleByUser.has(userId)) return;
  styleByUser.set(userId, next);
  emit();
}

/** Пачкой (справочник пользователей, сообщения): одно уведомление на всю пачку. */
export function ingestBubbleStyles(rows: ReadonlyArray<{ id?: string | null; bubbleStyle?: unknown }>): void {
  let changed = false;
  for (const row of rows) {
    if (!row.id || row.bubbleStyle === undefined || row.bubbleStyle === null) continue;
    const next = normalizeBubbleStyle(row.bubbleStyle);
    if (styleByUser.get(row.id) === next) continue;
    styleByUser.set(row.id, next);
    changed = true;
  }
  if (changed) emit();
}

export function getUserBubbleStyle(userId: string | undefined | null): BubbleStyleId | undefined {
  return userId ? styleByUser.get(userId) : undefined;
}

export function getShowOthersBubbleStyles(): boolean {
  if (showOthers === null) {
    showOthers = true;
    try {
      showOthers = window.localStorage.getItem(SHOW_OTHERS_KEY) !== "0";
    } catch {
      /* без хранилища - значение по умолчанию */
    }
  }
  return showOthers;
}

export function setShowOthersBubbleStyles(value: boolean): void {
  showOthers = value;
  try {
    window.localStorage.setItem(SHOW_OTHERS_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  emit();
}

/** Версия хранилища: компонент списка перерисовывается при любом изменении стилей (редко), а не на каждый пузырь. */
export function useBubbleStylesVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

export function useShowOthersBubbleStyles(): boolean {
  return useSyncExternalStore(subscribe, getShowOthersBubbleStyles, () => true);
}

/** Какой стиль рисовать у пузыря: учитывает доступ зрителя, настройку «чужие стили» и данные сообщения как запасные. */
export function resolveBubbleStyle(opts: {
  senderId?: string | null;
  isOwn: boolean;
  fallback?: unknown;
  viewerAllowed: boolean;
  showOthers: boolean;
}): BubbleStyleId {
  if (!opts.viewerAllowed) return DEFAULT_BUBBLE_STYLE;
  if (!opts.isOwn && !opts.showOthers) return DEFAULT_BUBBLE_STYLE;
  return getUserBubbleStyle(opts.senderId) ?? normalizeBubbleStyle(opts.fallback);
}

/** Подписка сокета на смену стиля пузырей любым пользователем (realtime). Возвращает отписку. */
export function attachBubbleStyleListener(socket: {
  on: (event: string, cb: (payload: { userId?: string; bubbleStyle?: unknown }) => void) => unknown;
  off: (event: string, cb: (payload: { userId?: string; bubbleStyle?: unknown }) => void) => unknown;
}, queryClient?: QueryClient): () => void {
  const handler = (payload: { userId?: string; bubbleStyle?: unknown }) => {
    setUserBubbleStyle(payload?.userId, payload?.bubbleStyle);
    // справочник в кеше тоже обновляем: иначе его следующий разбор вернул бы старый стиль
    if (queryClient && payload?.userId) {
      queryClient.setQueryData(usersDirectoryQueryKey(), (list: unknown) =>
        Array.isArray(list)
          ? list.map((row) => (row?.id === payload.userId ? { ...row, bubbleStyle: normalizeBubbleStyle(payload.bubbleStyle) } : row))
          : list,
      );
    }
  };
  socket.on("userBubbleStyleChanged", handler);
  return () => {
    socket.off("userBubbleStyleChanged", handler);
  };
}
