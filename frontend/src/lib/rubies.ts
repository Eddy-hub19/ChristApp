/** Рубіни й платні скіни «Отари»: константи, дзеркальні до backend/src/flock/flock.config.ts. */
/** Перший номер платних скінів у старій нумерації (безкоштовні задає FREE_SKIN_ROWS). */
export const FREE_SKINS = 12;
/** Скіни з номерами >= PREMIUM_FROM - преміум (дорожчі, з анімацією). */
export const PREMIUM_FROM = 18;
/** Скіни з номерами >= SPECIAL_FROM - «особливі» (статичні, окремий ряд у лобі). */
export const SPECIAL_FROM = 24;
/** Звичайні платні скіни, додані після особливих (34, 35): ціна skinPrice, в лобі в одному ряду з 12..17. */
export const EXTRA_PAID_FROM = 34;
/** Скін «Вожака» (36): зарезервований, не продається й не обирається. */
export const BOSS_SKIN_ID = 36;
/** Усього номерів (у межах - і зарезервований «Вожак»). */
export const TOTAL_SKINS = 47;
/** Безкоштовні скіни рядами лобі: 6 овечок, вовки (старі 8, 9 і нові 37-40), решта (ягня, баран, собака, вівця). Явний список. */
export const FREE_SKIN_ROWS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5],
  [8, 9, 37, 38, 39, 40],
  [6, 7, 10, 11],
];
export const FREE_SKIN_IDS: readonly number[] = FREE_SKIN_ROWS.flat();
/** Скін, який можна обрати (не «Вожак», у межах нумерації). */
export const isSelectableSkin = (id: number) => Number.isInteger(id) && id >= 0 && id < TOTAL_SKINS && id !== BOSS_SKIN_ID;
export const isPaidSkin = (id: number) => isSelectableSkin(id) && !FREE_SKIN_IDS.includes(id);
/** Преміум-скіни рядами лобі (ряд = шість скінів з анімацією). */
export const PREMIUM_SKIN_ROWS: readonly (readonly number[])[] = [
  [18, 19, 20, 21, 22, 23],
  [41, 42, 43, 44, 45, 46],
];
export const PREMIUM_SKIN_IDS: readonly number[] = PREMIUM_SKIN_ROWS.flat();
export const isPremiumSkin = (id: number) => PREMIUM_SKIN_IDS.includes(id);
export const isSpecialSkin = (id: number) => id >= SPECIAL_FROM && id < EXTRA_PAID_FROM;
/** Зняті з продажу (зеркало HIDDEN_SKINS на сервері): потрібні, поки профіль не завантажено й сервер ще не прислав config.hiddenSkins. */
export const HIDDEN_SKIN_IDS: readonly number[] = [13, 16, 22, 23, 24, 26, 27, 30, 31];
export const PAID_SKIN_IDS = [
  ...Array.from({ length: PREMIUM_FROM - FREE_SKINS }, (_, i) => FREE_SKINS + i),
  ...Array.from({ length: BOSS_SKIN_ID - EXTRA_PAID_FROM }, (_, i) => EXTRA_PAID_FROM + i),
];
export const SPECIAL_SKIN_IDS = Array.from({ length: EXTRA_PAID_FROM - SPECIAL_FROM }, (_, i) => SPECIAL_FROM + i);
