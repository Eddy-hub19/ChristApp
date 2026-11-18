"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import {
  canShowInstallPrompt,
  readPwaState,
  recordDismiss,
  recordInstalled,
  type PwaInstallState,
} from "@/lib/pwaInstallPolicy";
import styles from "@/components/PwaInstallPrompt/PwaInstallPrompt.module.scss";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Як часто перевіряємо, чи вже доречно показати плашку (таймер, модалки й повний екран не мають подій). */
const CHECK_INTERVAL_MS = 5000;

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIosSafariFamily(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  return window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
}

/** Відкрита модалка чи шторка будь-де в застосунку (усі вони мають role="dialog"). */
function isModalOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"], dialog[open]'));
}

/**
 * Плашка «Установити застосунок». З'являється рідко й лише доречно (див. `lib/pwaInstallPolicy.ts`):
 * не в іграх, залі кінотеатру, на повному екрані, поверх модалок і в перші 30 с; після закриття — пауза доба
 * (тиждень після трьох закриттів поспіль); у встановленому застосунку — ніколи. Не перекриває решту інтерфейсу.
 */
export default function PwaInstallPrompt() {
  const t = useTranslations("pwaInstall");
  const pathname = usePathname();
  const [variant, setVariant] = useState<"chromium" | "ios" | null>(null);
  const [open, setOpen] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const stateRef = useRef<PwaInstallState | null>(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Який різновид плашки взагалі можливий у цьому браузері (iOS — власного запиту встановлення немає).
  useEffect(() => {
    stateRef.current = readPwaState();
    if (isStandaloneDisplay() || stateRef.current.installed) return;
    if (isIosSafariFamily()) setVariant("ios");

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setVariant("chromium");
    };
    const onAppInstalled = () => {
      stateRef.current = recordInstalled();
      deferredRef.current = null;
      setOpen(false);
      setVariant(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Показ/приховування за умовами. Якщо умови зникли (відкрили гру чи модалку) — ховаємо, але не «закриваємо».
  useEffect(() => {
    if (!variant) return;
    const evaluate = () => {
      const state = readPwaState();
      stateRef.current = state;
      const allowed = canShowInstallPrompt({
        now: Date.now(),
        sessionMs: performance.now(),
        pathname: pathnameRef.current,
        standalone: isStandaloneDisplay(),
        fullscreen: Boolean(document.fullscreenElement),
        modalOpen: isModalOpen(),
        visible: document.visibilityState === "visible",
        state,
      });
      setOpen(allowed);
    };
    evaluate();
    const id = window.setInterval(evaluate, CHECK_INTERVAL_MS);
    document.addEventListener("fullscreenchange", evaluate);
    document.addEventListener("visibilitychange", evaluate);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("fullscreenchange", evaluate);
      document.removeEventListener("visibilitychange", evaluate);
    };
  }, [variant, pathname]);

  const dismiss = useCallback(() => {
    stateRef.current = recordDismiss(Date.now());
    setOpen(false);
  }, []);

  const onInstallClick = useCallback(async () => {
    const ev = deferredRef.current;
    if (!ev) return;
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === "accepted") {
        stateRef.current = recordInstalled();
        deferredRef.current = null;
        setOpen(false);
        setVariant(null);
        return;
      }
    } catch {
      /* ігноруємо */
    }
    dismiss();
  }, [dismiss]);

  if (!variant) return null;

  const closeButton = (
    <button type="button" className={styles.close} onClick={dismiss} aria-label={t("close")}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );

  return (
    <div
      className={`${styles.sheet} ${open ? styles.open : ""}`}
      role="region"
      aria-label={t("title")}
      aria-hidden={!open}
      inert={!open}
      data-pwa-install
    >
      {variant === "ios" ? (
        <div className={styles.compact}>
          <Image src="/icon-192x192.png" alt="" width={40} height={40} className={styles.iconSmall} />
          <p className={styles.hint}>
            <strong>{t("iosTitle")}</strong>
            <span>{t("iosHint")}</span>
          </p>
          {closeButton}
        </div>
      ) : (
        <>
          <div className={styles.head}>
            <div className={styles.iconWrap}>
              <Image src="/icon-192x192.png" alt="" width={52} height={52} className={styles.icon} />
            </div>
            <div className={styles.headText}>
              <h2 className={styles.title}>{t("title")}</h2>
              <p className={styles.subtitle}>{t("subtitle")}</p>
            </div>
            {closeButton}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onInstallClick}>
              {t("install")}
            </button>
            <button type="button" className={styles.secondary} onClick={dismiss}>
              {t("notNow")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
