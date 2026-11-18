import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { BonusIcon } from "@/components/icons/game";

/**
 * Іконки бонусів для канвасу поля гри беруться з тієї самої кастомної бібліотеки, що й HUD та «Про гру»:
 * компонент рендериться раз у SVG-рядок, перетворюється на картинку й малюється у спрайт бонуса.
 * Поки картинка вантажиться - null (спрайт не кешується й малюється знову); якщо не вийшло - "fail" (запасний емодзі).
 */
const images = new Map<string, HTMLImageElement | "fail">();

export function bonusIconImage(kind: string): HTMLImageElement | "fail" | null {
  if (typeof document === "undefined") return "fail";
  const hit = images.get(kind);
  if (hit === "fail") return "fail";
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
  let svg = "";
  try {
    const host = document.createElement("div");
    const root = createRoot(host);
    flushSync(() => root.render(<BonusIcon kind={kind} size={128} />));
    svg = host.innerHTML;
    root.unmount();
  } catch {
    svg = "";
  }
  if (!svg) {
    images.set(kind, "fail");
    return "fail";
  }
  const img = new Image();
  img.onerror = () => images.set(kind, "fail");
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  images.set(kind, img);
  return null;
}
