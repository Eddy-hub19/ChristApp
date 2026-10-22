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
  /** Кінозала завжди темна — перемикач теми там лише заважає. */
  const isCinemaHall = pathname.startsWith("/cinema/");

  /** Повноекранна гра: лампочка налізала на HUD («Топ-10»). */
  const isFullscreen = fullscreenActive || isFullscreenPath(pathname);

  /** Екрани чатів (особисті, Global chat, «Поділися з Ісусом»): лампочка не займає місце в шапці; тема - на головному й у профілі. */
  const isChatRoom = /^\/chat\/[^/]+/.test(pathname);

  if (isProfilePage || isOfflinePage || isCinemaHall || isFullscreen || isChatRoom) {
    return null;
  }

  return (
    <div className={styles.hanger} data-theme-toggle>
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
