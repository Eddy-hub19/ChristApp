"use client";

import { useLayoutEffect } from "react";

/**
 * Повторно применяет к `<html>` атрибуты темы и дизайна, которые при загрузке документа ставят blocking-скрипты
 * из `app/RootHtml.tsx` (THEME/DESIGN_BOOTSTRAP_SCRIPT). При смене языка `<html>` пересоздаётся (`[lang]` — корневой
 * layout), а скрипты в `<head>` при мягком переходе не запускаются, из-за чего пропадал новый дизайн.
 * Логика должна совпадать со скриптами в `RootHtml.tsx`. Выполняется до paint, поэтому без мерцания.
 */
export default function HtmlBootstrapSync() {
  useLayoutEffect(() => {
    const h = document.documentElement;
    const read = (key: string): string | null => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    };

    const theme = read("theme");
    h.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    if (read("authTheme") === "dark") h.setAttribute("data-auth-theme", "dark");

    try {
      const p = JSON.parse(read("christapp:fontPrefs") || "null");
      if (p && p.size && p.size !== "md") h.setAttribute("data-text-size", String(p.size));
    } catch {
      /* ignore */
    }

    if (read("design") !== "off") {
      h.setAttribute("data-design", "v2");
      const bg = read("christapp:designBg");
      h.setAttribute(
        "data-design-bg",
        bg === "plum" || bg === "night" || bg === "forest" || bg === "desert" ? bg : "forest",
      );
    }
  }, []);

  return null;
}
