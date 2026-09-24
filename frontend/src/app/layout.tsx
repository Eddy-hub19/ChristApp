import { inter, geistMono, bodoniModa } from "@/styles/fonts";
import "@/styles/globals.scss";
import type { ReactNode } from "react";

/**
 * Блокуючий скрипт у <head>: тема застосовується до першого paint, інакше сторінка
 * встигає намалюватися темною і лише потім перемкнутися на світлу (спалах при завантаженні).
 */
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

/**
 * Кореневий layout: шрифти та глобальні стилі. Локалізована оболонка — у `app/[lang]/layout.tsx`.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${bodoniModa.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
