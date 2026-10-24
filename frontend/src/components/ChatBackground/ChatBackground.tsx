"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
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
export function ChatBackgroundLayer({ id, dim }: { id: ChatBackgroundId; dim: number }) {
  if (id === "default") return null;
  const d = Math.max(0, Math.min(CHAT_BG_DIM_MAX, dim));
  return (
    <div data-chat-bg-layer data-chat-bg={id} aria-hidden>
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
