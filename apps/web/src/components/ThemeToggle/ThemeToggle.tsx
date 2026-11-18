"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext";
import { isFullscreenPath } from "@/lib/fullscreenRoutes";
import { reapplyUserAppearanceForCurrentTheme } from "@/lib/userAppearance";
import styles from "./ThemeToggle.module.scss";

type ThemeMode = "light" | "dark";
const THEME_STORAGE_KEY = "theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function ThemeToggle() {
  const t = useTranslations("theme");
  // Збігається з SSR і з <html data-theme="dark"> у layout — інакше гідрація лається.
  // Реальне значення вже стоїть на <html> завдяки блокуючому скрипту в layout, тож
  // після гідрації ми лише зчитуємо його, а не перезастосовуємо (звідси й брався спалах).
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [hasHydratedTheme, setHasHydratedTheme] = useState(false);
  const pathname = usePathname();
  const fullscreenActive =
    useTabBarOverlayOptional()?.themeToggleHiddenByFullscreen ?? false;

  useEffect(() => {
    const applied = document.documentElement.getAttribute("data-theme");
    if (applied === "light" || applied === "dark") {
      setTheme(applied);
    }
    setHasHydratedTheme(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedTheme) {
      return;
    }
    if (document.documentElement.getAttribute("data-theme") === theme) {
      return;
    }
    applyTheme(theme);
    reapplyUserAppearanceForCurrentTheme();
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme, hasHydratedTheme]);

  const handleToggle = () => {
    setTheme((currentTheme: ThemeMode) =>
      currentTheme === "light" ? "dark" : "light",
    );
  };

  const isLight = theme === "light";
  const isProfilePage = pathname.startsWith("/profile");
  const isOfflinePage = pathname === "/offline";
  /** Экраны входа/регистрации/выбора ника всегда тёмные - переключатель темы там ничего не меняет. */
  const isAuthScreen =
    pathname === "/" || pathname === "/register" || pathname === "/choose-nickname";
  /** Кінозала завжди темна — перемикач теми там лише заважає. */
  const isCinemaHall = pathname.startsWith("/cinema/");

  /** Повноекранна гра: лампочка налізала на HUD («Топ-10»). */
  const isFullscreen = fullscreenActive || isFullscreenPath(pathname);

  /** Екрани чатів (особисті, Global chat, «Поділися з Ісусом»): лампочка не займає місце в шапці; тема - на головному й у профілі. */
  const isChatRoom = /^\/chat\/[^/]+/.test(pathname);

  const hidden =
    isProfilePage || isOfflinePage || isAuthScreen || isCinemaHall || isFullscreen || isChatRoom;

  // Место под лампочку для шапок экранов (--theme-toggle-inset): атрибут на <html> вместо `:root:has([data-theme-toggle])`.
  useEffect(() => {
    if (hidden) return;
    const root = document.documentElement;
    root.setAttribute("data-theme-toggle-on", "");
    return () => root.removeAttribute("data-theme-toggle-on");
  }, [hidden]);

  // Открыта модалка/шторка/игра - лампочка прячется. Вместо `body:has(...)` (пересчёт при каждом изменении DOM)
  // следим за появлением таких элементов одним наблюдателем с троттлингом через rAF.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (hidden) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      setOverlayOpen(Boolean(document.querySelector('[aria-modal="true"], [data-app-overlay]')));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    check();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal", "data-app-overlay"],
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hidden]);

  if (hidden) {
    return null;
  }

  return (
    <div className={styles.hanger} data-theme-toggle data-overlay-open={overlayOpen ? "" : undefined}>
      <span className={styles.mount} />
      <button
        type="button"
        className={`${styles.toggle} ${isLight ? styles.light : styles.dark}`}
        onClick={handleToggle}
        aria-label={isLight ? t("toDark") : t("toLight")}
        title={isLight ? t("titleDark") : t("titleLight")}
      >
        <span className={styles.rope} />
        <span className={styles.lamp}>
          <span className={styles.glow} />
        </span>
      </button>
    </div>
  );
}
