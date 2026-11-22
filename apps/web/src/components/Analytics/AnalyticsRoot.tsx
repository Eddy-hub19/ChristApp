"use client";

import { useEffect, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import ConsentBanner from "@/components/Analytics/ConsentBanner";
import {
  GTM_ID,
  applyAnalyticsConsent,
  flushPendingAuthEvent,
  initAnalyticsDataLayer,
  shouldLoadGtmOnPath,
  track,
  trackPageView,
} from "@/lib/analytics";
import {
  readAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "@/lib/analyticsConsent";

function isStandaloneDisplay(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Короткий код ошибки: имя типа (TypeError, ChunkLoadError…), иначе "unknown". Текст ошибки не используется. */
function errorCode(value: unknown): string {
  return value instanceof Error && /^[A-Za-z]{2,30}$/.test(value.name) ? value.name : "unknown";
}

/**
 * Единая точка подключения аналитики для всего `[lang]` (приложение и публичные страницы):
 *  - без `NEXT_PUBLIC_GTM_ID` не рендерит ничего и ничего не грузит;
 *  - контейнер GTM грузится только после согласия и не на /admin; dataLayer и default consent (denied) создаются до него;
 *  - `page_view` и `app_open` отправляются отсюда, один раз на смену экрана / сессию.
 */
export default function AnalyticsRoot() {
  const pathname = usePathname() ?? "";
  const consent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    () => null,
  );

  // Согласие применяется к GTM (granted → update + сброс буфера; denied → буфер выбрасывается).
  useEffect(() => {
    if (!GTM_ID) return;
    initAnalyticsDataLayer();
    applyAnalyticsConsent(consent);
  }, [consent]);

  // Смена экрана (App Router без перезагрузки) → page_view с безопасным шаблоном пути + отложенные события входа.
  useEffect(() => {
    if (!GTM_ID) return;
    trackPageView(pathname);
    flushPendingAuthEvent();
  }, [pathname]);

  useEffect(() => {
    if (!GTM_ID) return;
    track("app_open", { mode: isStandaloneDisplay() ? "standalone" : "browser" });
  }, []);

  // Ошибки клиента: только категория и короткий код (имя типа ошибки), без текста сообщения и стека.
  useEffect(() => {
    if (!GTM_ID) return;
    const onError = (event: ErrorEvent) => {
      if (event.target !== window) return;
      track("client_error", { category: "js", code: errorCode(event.error) });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      track("client_error", { category: "promise", code: errorCode(event.reason) });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!GTM_ID) return null;

  const loadGtm = consent === "granted" && shouldLoadGtmOnPath(pathname);

  return (
    <>
      {loadGtm ? (
        <Script
          id="gtm-loader"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];window.dataLayer.push({"gtm.start":Date.now(),event:"gtm.js"});var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtm.js?id=${GTM_ID}";document.head.appendChild(s);`,
          }}
        />
      ) : null}
      <ConsentBanner pathname={pathname} consent={consent} />
    </>
  );
}
