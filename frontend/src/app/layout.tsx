import { inter, geistMono, bodoniModa } from "@/styles/fonts";
import "@/styles/globals.scss";
import type { ReactNode } from "react";
import { getDirectApiOrigin, getHttpApiBase } from "@/lib/apiBase";

/**
 * Блокуючий скрипт у <head>: тема застосовується до першого paint, інакше сторінка
 * встигає намалюватися темною і лише потім перемкнутися на світлу (спалах при завантаженні).
 */
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

/**
 * Критичний CSS, який фарбує html/body у колір теми ще до того, як завантажиться і
 * розпарситься основний stylesheet — без нього перший кадр малюється білим за замовчуванням.
 * Дублює `--background` з `globals.scss` (dark = дефолт, light — під атрибутом теми).
 */
const CRITICAL_THEME_CSS = `html,body{background:#2e2d2d;color-scheme:dark}html[data-theme="light"],html[data-theme="light"] body{background:#f8f2e9;color-scheme:light}`;

/**
 * Health-check бекенду стартує тут, у <head>, ще до завантаження React-бандла —
 * саме це визначає, чи встигнемо вкластися в паузу перед показом ServerStartupScreen
 * (`useServerStartupBoot` читає `window.__earlyHealthCheck` замість повторного запиту).
 */
const EARLY_HEALTH_CHECK_SCRIPT = `(function(){try{var startedAt=Date.now();var ctrl=new AbortController();var timer=setTimeout(function(){ctrl.abort();},8000);var promise=fetch(${JSON.stringify(`${getHttpApiBase()}/health`)},{method:"GET",cache:"no-store",signal:ctrl.signal}).then(function(res){clearTimeout(timer);if(!res.ok)return false;var ct=res.headers.get("content-type")||"";if(ct.indexOf("application/json")!==-1){return res.json().then(function(b){return !!(b&&b.ok===true);}).catch(function(){return false;});}return true;}).catch(function(){clearTimeout(timer);return false;});window.__earlyHealthCheck={startedAt:startedAt,promise:promise};}catch(e){}})();`;

/** Прямий origin Nest (WebSocket/презенс): преконект, щоб TLS/TCP не чекали на React-бандл. */
function resolvePreconnectOrigin(): string | null {
  try {
    const url = new URL(getDirectApiOrigin());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Кореневий layout: шрифти та глобальні стилі. Локалізована оболонка — у `app/[lang]/layout.tsx`.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const preconnectOrigin = resolvePreconnectOrigin();

  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <head>
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_THEME_CSS }} />
        {/* Next 16 генерує лише сучасний `mobile-web-app-capable` для appleWebApp.capable;
            старий vendor-tag лишаємо вручну під iOS-версії, що ще не знають новий. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        {preconnectOrigin ? (
          <>
            <link rel="preconnect" href={preconnectOrigin} />
            <link rel="dns-prefetch" href={preconnectOrigin} />
          </>
        ) : null}
        <script
          dangerouslySetInnerHTML={{ __html: EARLY_HEALTH_CHECK_SCRIPT }}
        />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${bodoniModa.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
