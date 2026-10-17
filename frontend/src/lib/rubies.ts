/** Рубіни й платні скіни «Отари»: константи, дзеркальні до backend/src/flock/flock.config.ts. */
export const FREE_SKINS = 12;
export const TOTAL_SKINS = 18;
export const isPaidSkin = (id: number) => id >= FREE_SKINS && id < TOTAL_SKINS;
export const PAID_SKIN_IDS = Array.from({ length: TOTAL_SKINS - FREE_SKINS }, (_, i) => FREE_SKINS + i);
