import {
  Bodoni_Moda,
  Caveat,
  Comfortaa,
  EB_Garamond,
  Exo_2,
  Geist_Mono,
  Inter,
  Jura,
  Lobster,
  Marck_Script,
  Montserrat_Alternates,
  Nunito,
  Pacifico,
  Pangolin,
  Press_Start_2P,
  Rubik,
  Russo_One,
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
export const montserratAlternates = Montserrat_Alternates({
  variable: "--font-montserrat-alternates",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  weight: ["400", "600", "700"],
});
export const exo2 = Exo_2({
  variable: "--font-exo-2",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});
export const russoOne = Russo_One({
  variable: "--font-russo-one",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  weight: "400",
});
export const jura = Jura({
  variable: "--font-jura",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});
export const pacifico = Pacifico({
  variable: "--font-pacifico",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  weight: "400",
});
export const lobster = Lobster({
  variable: "--font-lobster",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  weight: "400",
});
export const marckScript = Marck_Script({
  variable: "--font-marck-script",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  weight: "400",
});
export const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});
export const pressStart2p = Press_Start_2P({
  variable: "--font-press-start-2p",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  weight: "400",
});
export const pangolin = Pangolin({
  variable: "--font-pangolin",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  weight: "400",
});

/** Классы с CSS-переменными всех шрифтов выбора (вешаются на body). */
export const chatFontVariables = [
  nunito, rubik, comfortaa, montserratAlternates, exo2, russoOne, jura, pacifico, lobster, marckScript, caveat, pressStart2p, pangolin,
]
  .map((f) => f.variable)
  .join(" ");
