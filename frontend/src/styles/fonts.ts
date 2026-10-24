import {
  Bodoni_Moda,
  Caveat,
  Comfortaa,
  EB_Garamond,
  Geist_Mono,
  Inter,
  Nunito,
  Rubik,
} from "next/font/google";

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/** Сцена «давній пергамент» (NoteScene). */
export const ebGaramond = EB_Garamond({
  variable: "--font-note-scene-eb-garamond",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni-moda",
  subsets: ["latin"],
});

/**
 * Шрифты на выбор пользователя («Налаштування» -> «Шрифт», lib/chatFonts.ts). Все с кириллицей (є, і, ї, ґ проверены), лицензия OFL.
 * `preload: false`: файл шрифта скачивается, только когда он реально используется на странице (выбран пользователем),
 * `display: "swap"` + автоматический fallback с близкими метриками - без скачка вёрстки при загрузке.
 */
export const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});
export const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});
export const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});
export const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});

/** Классы с CSS-переменными всех шрифтов выбора (вешаются на body). */
export const chatFontVariables = [
  nunito, rubik, comfortaa, caveat,
]
  .map((f) => f.variable)
  .join(" ");
