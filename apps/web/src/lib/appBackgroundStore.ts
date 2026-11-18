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

/**
 * Экраны, где корневой фон не рисуется (зал кинотеатра, игра «Отара»): ставят `data-app-bg-off` на <html>.
 * Раньше это решали селекторы `:has()` на корне - они пересчитываются при любом изменении DOM (каждое сообщение чата).
 */
let suspendCount = 0;
export function suspendAppBackground(): () => void {
  if (typeof document === "undefined") return () => {};
  suspendCount += 1;
  document.documentElement.setAttribute("data-app-bg-off", "");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suspendCount -= 1;
    if (suspendCount <= 0) {
      suspendCount = 0;
      document.documentElement.removeAttribute("data-app-bg-off");
    }
  };
}
