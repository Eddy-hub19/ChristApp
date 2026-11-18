/**
 * Мова застосунку в URL — "ua", але для Intl це не українська (код мови — "uk"): `new Intl.PluralRules("ua")`
 * мовчки падає на дефолтну локаль (en на сервері, системну в браузері), тож ICU `plural` у ua.json давав би
 * "5 учасника". Підміняємо "ua" → "uk" лише для PluralRules; сам useLocale() і маршрути лишаються "ua".
 * Імпортується побічним ефектом із серверного layout і з клієнтських провайдерів (окремі бандли).
 */
const NativePluralRules = Intl.PluralRules;

type Locales = string | string[] | undefined;

const aliasLocale = (locales: Locales): Locales => {
  if (locales === "ua") return "uk";
  if (Array.isArray(locales)) {
    return locales.map((l) => (l === "ua" ? "uk" : l));
  }
  return locales;
};

if (!(NativePluralRules as unknown as { __uaAliased?: boolean }).__uaAliased) {
  const Aliased = function (locales?: Locales, options?: Intl.PluralRulesOptions) {
    return new NativePluralRules(aliasLocale(locales) as string | string[], options);
  } as unknown as typeof Intl.PluralRules;
  Aliased.prototype = NativePluralRules.prototype;
  Aliased.supportedLocalesOf = (locales, options) =>
    NativePluralRules.supportedLocalesOf(
      aliasLocale(locales as Locales) as string | string[],
      options,
    );
  (Aliased as unknown as { __uaAliased: boolean }).__uaAliased = true;
  (Intl as { PluralRules: typeof Intl.PluralRules }).PluralRules = Aliased;
}

export {};
