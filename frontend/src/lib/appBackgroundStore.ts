/**
 * Ключ открытого чата для корневого слоя фона (components/ChatBackground/AppBackground.tsx): страница чата знает ключ
 * (в личных чатах он зависит от собеседника), а слой фона живёт в корне и не пересоздаётся при переходах между экранами.
 * null - открыт не чат: действует фон по умолчанию.
 */
let activeKey: string | null = null;
const listeners = new Set<() => void>();

export function setActiveChatBackgroundKey(key: string | null) {
  if (activeKey === key) return;
  activeKey = key;
  for (const l of listeners) l();
}

export function subscribeActiveChatBackgroundKey(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const getActiveChatBackgroundKey = () => activeKey;
