/** Рубіни й платні скіни «Отари»: константи, дзеркальні до backend/src/flock/flock.config.ts. */
export const FREE_SKINS = 12;
/** Скіни з номерами >= PREMIUM_FROM - преміум (дорожчі, з анімацією). */
export const PREMIUM_FROM = 18;
/** Скіни з номерами >= SPECIAL_FROM - «особливі» (статичні, окремий ряд у лобі). */
export const SPECIAL_FROM = 24;
/** Звичайні платні скіни, додані після особливих (34, 35): ціна skinPrice, в лобі в одному ряду з 12..17. */
export const EXTRA_PAID_FROM = 34;
export const TOTAL_SKINS = 36;
export const isPaidSkin = (id: number) => id >= FREE_SKINS && id < TOTAL_SKINS;
export const isPremiumSkin = (id: number) => id >= PREMIUM_FROM && id < SPECIAL_FROM;
export const isSpecialSkin = (id: number) => id >= SPECIAL_FROM && id < EXTRA_PAID_FROM;
/** Скрытые скины (зеркало HIDDEN_SKINS на сервере): нужны, пока профиль не загружен и сервер ещё не прислал config.hiddenSkins. */
export const HIDDEN_SKIN_IDS: readonly number[] = [13, 16, 22, 26, 30];
export const PAID_SKIN_IDS = [
  ...Array.from({ length: PREMIUM_FROM - FREE_SKINS }, (_, i) => FREE_SKINS + i),
  ...Array.from({ length: TOTAL_SKINS - EXTRA_PAID_FROM }, (_, i) => EXTRA_PAID_FROM + i),
];
export const PREMIUM_SKIN_IDS = Array.from({ length: SPECIAL_FROM - PREMIUM_FROM }, (_, i) => PREMIUM_FROM + i);
export const SPECIAL_SKIN_IDS = Array.from({ length: EXTRA_PAID_FROM - SPECIAL_FROM }, (_, i) => SPECIAL_FROM + i);
