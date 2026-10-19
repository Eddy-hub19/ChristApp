/** Рубіни й платні скіни «Отари»: константи, дзеркальні до backend/src/flock/flock.config.ts. */
export const FREE_SKINS = 12;
/** Скіни з номерами >= PREMIUM_FROM - преміум (дорожчі, з анімацією). */
export const PREMIUM_FROM = 18;
/** Скіни з номерами >= SPECIAL_FROM - «особливі» (статичні, окремий ряд у лобі). */
export const SPECIAL_FROM = 24;
export const TOTAL_SKINS = 32;
export const isPaidSkin = (id: number) => id >= FREE_SKINS && id < TOTAL_SKINS;
export const isPremiumSkin = (id: number) => id >= PREMIUM_FROM && id < SPECIAL_FROM;
export const isSpecialSkin = (id: number) => id >= SPECIAL_FROM && id < TOTAL_SKINS;
/** Скрытые скины (зеркало HIDDEN_SKINS на сервере): нужны, пока профиль не загружен и сервер ещё не прислал config.hiddenSkins. */
export const HIDDEN_SKIN_IDS: readonly number[] = [13, 16, 22, 26, 30];
export const PAID_SKIN_IDS = Array.from({ length: PREMIUM_FROM - FREE_SKINS }, (_, i) => FREE_SKINS + i);
export const PREMIUM_SKIN_IDS = Array.from({ length: SPECIAL_FROM - PREMIUM_FROM }, (_, i) => PREMIUM_FROM + i);
export const SPECIAL_SKIN_IDS = Array.from({ length: TOTAL_SKINS - SPECIAL_FROM }, (_, i) => SPECIAL_FROM + i);
