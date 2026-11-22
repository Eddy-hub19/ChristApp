import { defineRouting } from "next-intl/routing";

const baseRouting = defineRouting({
  locales: ["en", "ru", "ua"],
  defaultLocale: "ru",
  // без автовизначення мови за заголовком браузера: за замовчуванням завжди російська, вибір користувача лишається в cookie
  localeDetection: false,
  localePrefix: "always",
  // Заголовок `Link: rel=alternate` формуємо самі в middleware (`publicAlternateLinkHeader`): next-intl віддавав "ua" замість "uk" і x-default на /welcome.
  alternateLinks: false,
});

export const routing = {
  ...baseRouting,
  langs: baseRouting.locales,
  defaultLang: baseRouting.defaultLocale,
  langPrefix: baseRouting.localePrefix,
};
