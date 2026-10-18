"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TabBarOverlayContextValue = {
  chatComposerFocused: boolean;
  setChatComposerFocused: (focused: boolean) => void;
  /** Відкрито повноекранний режим (гра): навбар і лампочка теми не показуються. */
  fullscreenActive: boolean;
  /** Те саме, але лише для режимів, що ховають і лампочку (ігри); читалка Біблії лампочку лишає. */
  themeToggleHiddenByFullscreen: boolean;
  /** Реєструє повноекранний режим; повертає функцію, що його знімає (лічильник — можна вкладати). */
  acquireFullscreen: (options?: FullscreenOptions) => () => void;
};

export type FullscreenOptions = {
  /** Ховати лише навбар, а лампочку теми залишити (читалка Біблії). */
  keepThemeToggle?: boolean;
};

const TabBarOverlayContext = createContext<TabBarOverlayContextValue | null>(
  null,
);

export function TabBarOverlayProvider({ children }: { children: ReactNode }) {
  const [chatComposerFocused, setChatComposerFocusedState] = useState(false);
  const setChatComposerFocused = useCallback((focused: boolean) => {
    setChatComposerFocusedState(focused);
  }, []);
  const [fullscreenCount, setFullscreenCount] = useState(0);
  /** Скільки з активних режимів просять залишити лампочку. */
  const [keepThemeToggleCount, setKeepThemeToggleCount] = useState(0);
  const acquireFullscreen = useCallback((options?: FullscreenOptions) => {
    const keep = options?.keepThemeToggle === true;
    setFullscreenCount((n) => n + 1);
    if (keep) setKeepThemeToggleCount((n) => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setFullscreenCount((n) => Math.max(0, n - 1));
      if (keep) setKeepThemeToggleCount((n) => Math.max(0, n - 1));
    };
  }, []);
  const value = useMemo(
    () => ({
      chatComposerFocused,
      setChatComposerFocused,
      fullscreenActive: fullscreenCount > 0,
      themeToggleHiddenByFullscreen: fullscreenCount - keepThemeToggleCount > 0,
      acquireFullscreen,
    }),
    [
      chatComposerFocused,
      setChatComposerFocused,
      fullscreenCount,
      keepThemeToggleCount,
      acquireFullscreen,
    ],
  );
  return (
    <TabBarOverlayContext.Provider value={value}>
      {children}
    </TabBarOverlayContext.Provider>
  );
}

export function useTabBarOverlay() {
  const ctx = useContext(TabBarOverlayContext);
  if (!ctx) {
    throw new Error(
      "useTabBarOverlay must be used within TabBarOverlayProvider",
    );
  }
  return ctx;
}

/** Для TabBar і розмітки поза обов'язковим провайдером (наприклад, тести). */
export function useTabBarOverlayOptional(): TabBarOverlayContextValue | null {
  return useContext(TabBarOverlayContext);
}

/**
 * Поки `active` — застосунок у повноекранному режимі: навбар і перемикач теми ховаються (не рендеряться).
 * Викликайте з повноекранної гри/сцени; при розмонтуванні чи `active=false` навбар повертається.
 */
export function useFullscreenMode(
  active: boolean,
  { keepThemeToggle = false }: FullscreenOptions = {},
) {
  const acquire = useContext(TabBarOverlayContext)?.acquireFullscreen;
  useEffect(() => {
    if (!active || !acquire) return;
    return acquire({ keepThemeToggle });
  }, [active, acquire, keepThemeToggle]);
}
