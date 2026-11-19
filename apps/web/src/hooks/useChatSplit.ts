"use client";

import { useSyncExternalStore } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useChatLayoutPref } from "@/lib/chatLayoutPref";

/** Ширина, с которой раздел «Чат» делится на колонки (список слева, комната справа). */
export const CHAT_SPLIT_MIN_WIDTH_PX = 1024;

const noopSubscribe = () => () => {};
/** Новый дизайн включён (`<html data-design="v2">`). На сервере и при гидрации - false. */
export function useDesignV2(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => document.documentElement.getAttribute("data-design") === "v2",
    () => false,
  );
}

/** Двухколоночный чат как в Telegram: только на ПК, в новом дизайне и если пользователь не выбрал «отдельный экран». */
export function useChatSplit(): boolean {
  const wide = useMediaQuery(`(min-width: ${CHAT_SPLIT_MIN_WIDTH_PX}px)`);
  const pref = useChatLayoutPref();
  return useDesignV2() && wide && pref === "split";
}
