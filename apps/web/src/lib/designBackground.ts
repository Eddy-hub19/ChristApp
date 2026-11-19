/**
 * Фон приложения в новом дизайне (html[data-design="v2"]): «Зелёный лес» (по умолчанию), «Сливовый закат», «Ночная синева» или «Пустыня» (серо-песочный).
 * Выбор хранится в localStorage этого браузера и ставится на <html data-design-bg> до первого paint
 * (DESIGN_BOOTSTRAP_SCRIPT в app/layout.tsx). Стили - styles/designV2.scss.
 */
export const DESIGN_BACKGROUNDS = ["plum", "night", "forest", "desert"] as const;
export type DesignBackgroundId = (typeof DESIGN_BACKGROUNDS)[number];
export const DEFAULT_DESIGN_BACKGROUND: DesignBackgroundId = "forest";
export const DESIGN_BG_STORAGE_KEY = "christapp:designBg";

export const isDesignBackgroundId = (v: unknown): v is DesignBackgroundId =>
  typeof v === "string" && (DESIGN_BACKGROUNDS as readonly string[]).includes(v);

export function getDesignBackground(): DesignBackgroundId {
  if (typeof document === "undefined") return DEFAULT_DESIGN_BACKGROUND;
  const v = document.documentElement.getAttribute("data-design-bg");
  return isDesignBackgroundId(v) ? v : DEFAULT_DESIGN_BACKGROUND;
}

export function setDesignBackground(id: DesignBackgroundId) {
  const root = document.documentElement;
  /* Атрибут ставим всегда, в т.ч. для «plum»: без него по умолчанию подставляется «forest». */
  root.setAttribute("data-design-bg", id);
  try {
    window.localStorage.setItem(DESIGN_BG_STORAGE_KEY, id);
  } catch {}
}
