"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getActiveChatBackgroundKey, setActiveChatBackgroundKey, subscribeActiveChatBackgroundKey } from "@/lib/appBackgroundStore";
import {
  CHAT_BG_DIM_MAX,
  normalizeChatBackgrounds,
  resolveChatBackground,
  type ChatBackgroundId,
  type ResolvedBackground,
} from "@/lib/chatBackgrounds";

/**
 * Слой фона чата (стили - styles/chatBackgrounds.scss): абсолютный, за содержимым карточки (z-index: -1), без fixed.
 * Оба варианта темы лежат в DOM; для «Стандартний» слоя нет вовсе.
 */
export function ChatBackgroundLayer({ id, dim, fixed = false }: { id: ChatBackgroundId; dim: number; fixed?: boolean }) {
  if (id === "default") return null;
  const d = Math.max(0, Math.min(CHAT_BG_DIM_MAX, dim));
  return (
    <div data-chat-bg-layer data-chat-bg={id} data-fixed={fixed ? "" : undefined} aria-hidden>
      <i data-v="light" />
      <i data-v="dark" />
      {d > 0 ? <b style={{ opacity: d / 100 }} /> : null}
    </div>
  );
}

/** Фон, который действует в чате roomKey у текущего пользователя (свой фон чата, иначе фон по умолчанию). */
export function useResolvedChatBackground(roomKey: string | null | undefined): ResolvedBackground {
  const { user } = useAuth();
  const prefs = useMemo(() => normalizeChatBackgrounds(user?.chatBackgrounds), [user?.chatBackgrounds]);
  return useMemo(() => resolveChatBackground(prefs, roomKey), [prefs, roomKey]);
}

export function useChatBackgroundPrefs() {
  const { user } = useAuth();
  return useMemo(() => normalizeChatBackgrounds(user?.chatBackgrounds), [user?.chatBackgrounds]);
}

/**
 * Один общий слой фона на корневом уровне (position: fixed за всем содержимым): выбранный «Фон чату за замовчуванням»
 * действует на всё приложение, а в открытом чате - фон этого чата (свой или по умолчанию). Слой не пересоздаётся при
 * переходах; тема переключает вариант фона через opacity. Не рисуется в зале кинотеатра и под игрой «Отара» (CSS).
 * На <html> ставится `data-app-bg`: карточки получают мягкую полупрозрачную подложку (без backdrop-filter).
 */
export default function AppBackground() {
  const key = useSyncExternalStore(subscribeActiveChatBackgroundKey, getActiveChatBackgroundKey, () => null);
  const bg = useResolvedChatBackground(key);
  useEffect(() => {
    const root = document.documentElement;
    if (bg.id === "default") root.removeAttribute("data-app-bg");
    else root.setAttribute("data-app-bg", bg.id);
    return () => root.removeAttribute("data-app-bg");
  }, [bg.id]);
  return <ChatBackgroundLayer id={bg.id} dim={bg.dim} fixed />;
}

/** Страница чата сообщает корневому слою, чей фон показывать (пока чат открыт). */
export function usePublishChatBackgroundKey(key: string | null) {
  useEffect(() => {
    setActiveChatBackgroundKey(key);
    return () => setActiveChatBackgroundKey(null);
  }, [key]);
}
