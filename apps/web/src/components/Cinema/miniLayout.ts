"use client";

import { useEffect, useState } from "react";

export type MiniCorner = "tl" | "tr" | "bl" | "br";

export const MINI_MARGIN = 8;
const CORNER_KEY = "cinema:miniCorner";
/** Нижній край навбара: bottom 12 + висота 80 + зазор. */
const TABBAR_CLEARANCE = 12 + 80 + MINI_MARGIN;
/** Поле вводу в кімнаті чату (+ зазор). */
const COMPOSER_CLEARANCE = 96;
/** Клавіатура: visual viewport нижчий за layout viewport більше ніж на стільки. */
const KEYBOARD_THRESHOLD = 150;

export type MiniViewport = {
  w: number;
  h: number;
  top: number;
  keyboardOpen: boolean;
  safe: { top: number; right: number; bottom: number; left: number };
};

const EMPTY_VIEWPORT: MiniViewport = {
  w: 0,
  h: 0,
  top: 0,
  keyboardOpen: false,
  safe: { top: 0, right: 0, bottom: 0, left: 0 },
};

/** env(safe-area-inset-*) недоступний із JS напряму — читаємо через проб-елемент. */
function readSafeInsets(): MiniViewport["safe"] {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const safe = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return safe;
}

export function useMiniViewport(): MiniViewport {
  const [vp, setVp] = useState<MiniViewport>(EMPTY_VIEWPORT);
  useEffect(() => {
    const safe = readSafeInsets();
    const update = () => {
      const v = window.visualViewport;
      const h = v?.height ?? window.innerHeight;
      setVp({
        w: v?.width ?? window.innerWidth,
        h,
        top: v?.offsetTop ?? 0,
        keyboardOpen: window.innerHeight - h > KEYBOARD_THRESHOLD,
        safe,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
  return vp;
}

/** Скільки знизу зарезервовано: навбар або поле вводу чату — мініплеєр їх не перекриває. */
export function miniBottomClearance(
  pathname: string,
  safeBottom: number,
): number {
  if (pathname.startsWith("/chat/")) return COMPOSER_CLEARANCE + safeBottom;
  const tabBarHidden =
    pathname === "/" ||
    pathname === "/register" ||
    pathname === "/offline" ||
    pathname.startsWith("/cinema/");
  return (tabBarHidden ? MINI_MARGIN : TABBAR_CLEARANCE) + safeBottom;
}

/** Розмір вікна: YouTube вимагає від вбудованого плеєра щонайменше 200×200, решта може бути меншою. */
export function miniSize(
  provider: string,
  viewportW: number,
): { w: number; h: number } {
  const maxW = Math.max(160, viewportW - MINI_MARGIN * 2);
  if (provider === "YOUTUBE") {
    const w = Math.min(356, maxW);
    return { w, h: Math.max(200, Math.round((w * 9) / 16)) };
  }
  const w = Math.min(viewportW >= 768 ? 320 : 256, maxW);
  return { w, h: Math.round((w * 9) / 16) };
}

export function miniPositionFor(
  corner: MiniCorner,
  size: { w: number; h: number },
  vp: MiniViewport,
  pathname: string,
): { left: number; top: number } {
  // З клавіатурою нижні кути лізли б на поле вводу — тимчасово піднімаємо у верхній.
  const bottom = (corner === "bl" || corner === "br") && !vp.keyboardOpen;
  const right = corner === "tr" || corner === "br";
  return {
    left: right
      ? vp.w - size.w - MINI_MARGIN - vp.safe.right
      : MINI_MARGIN + vp.safe.left,
    top: bottom
      ? vp.top + vp.h - size.h - miniBottomClearance(pathname, vp.safe.bottom)
      : vp.top + MINI_MARGIN + vp.safe.top,
  };
}

export function nearestCorner(
  centerX: number,
  centerY: number,
  vp: MiniViewport,
): MiniCorner {
  const right = centerX > vp.w / 2;
  const bottom = centerY > vp.top + vp.h / 2;
  return `${bottom ? "b" : "t"}${right ? "r" : "l"}` as MiniCorner;
}

export function readStoredCorner(): MiniCorner {
  try {
    const v = window.localStorage.getItem(CORNER_KEY);
    if (v === "tl" || v === "tr" || v === "bl" || v === "br") return v;
  } catch {
    // приватний режим — кут не запамʼятається
  }
  return "br";
}

export function storeCorner(corner: MiniCorner) {
  try {
    window.localStorage.setItem(CORNER_KEY, corner);
  } catch {
    // див. вище
  }
}
