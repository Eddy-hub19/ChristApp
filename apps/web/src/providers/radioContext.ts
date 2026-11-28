"use client";

import { createContext, useContext } from "react";
import type { RadioState } from "@/lib/radioApi";

/** idle - не слушаю; connecting - подключаюсь; listening - в эфире; blocked - браузер не дал начать без касания; error - нет связи/сбой. */
export type RadioStatus = "idle" | "connecting" | "listening" | "blocked" | "error";

export interface RadioContextValue {
  /** Последнее известное состояние эфира (null - ещё не получали). */
  state: RadioState | null;
  /** Сколько человек сейчас слушают эфир. */
  listeners: number;
  /** Я подключён к эфиру (слушаю). */
  tunedIn: boolean;
  status: RadioStatus;
  /** Сокет радио на связи. */
  connected: boolean;
  /** Экран «Музыка» открыт: держит сокет живым (состояние и счётчик слушателей) до вызова возвращённой функции. */
  watch: () => () => void;
  /** Подключиться к эфиру. Вызывать из обработчика нажатия (политика автовоспроизведения). */
  tuneIn: () => void;
  /** Отключиться и убрать карточку плеера. */
  leave: () => void;
  /** Перечитать состояние эфира и подтянуть позицию. */
  refresh: () => void;
  /** Где сейчас эфир (секунды от начала трека) по часам сервера. */
  positionSec: () => number;
}

export const RadioContext = createContext<RadioContextValue | null>(null);

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used inside RadioProvider");
  return ctx;
}
