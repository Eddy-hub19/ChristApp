/** Рубіни й платні скіни «Отари»: константи, дзеркальні до backend/src/flock/flock.config.ts. */
export const FREE_SKINS = 12;
/** Скіни з номерами >= PREMIUM_FROM - преміум (дорожчі, з анімацією). */
export const PREMIUM_FROM = 18;
export const TOTAL_SKINS = 24;
export const isPaidSkin = (id: number) => id >= FREE_SKINS && id < TOTAL_SKINS;
export const isPremiumSkin = (id: number) => id >= PREMIUM_FROM && id < TOTAL_SKINS;
export const PAID_SKIN_IDS = Array.from({ length: PREMIUM_FROM - FREE_SKINS }, (_, i) => FREE_SKINS + i);
export const PREMIUM_SKIN_IDS = Array.from({ length: TOTAL_SKINS - PREMIUM_FROM }, (_, i) => PREMIUM_FROM + i);
