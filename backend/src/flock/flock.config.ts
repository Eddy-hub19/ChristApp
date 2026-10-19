/**
 * Усі числа "Отари" в одному місці: частота, бонуси, боти, ліміти.
 * Одиниці: відстань - світові одиниці, час - мс, швидкість - од/с.
 */
export const FLOCK_CONFIG = {
  // ======================================================================
  // ЛІМІТИ ПІД ТАРИФ - це єдине місце, яке міняємо при зміні інстансу.
  //
  // Зараз: платний Render, 0.5 vCPU / 512 МБ (~500 мс CPU/с), сервер не засинає.
  // Арена коштує ~25-35 мс CPU/с (боти, таймери, GC; docs/flock-load.md) + ~2-4 мс CPU/с
  // на кожного живого гравця (socket.io), тож під арену відводиться ~1/10 бюджету.
  //
  //                      | безкоштовний (~0.1 vCPU) | 0.5 vCPU (зараз) | 1 vCPU
  //   maxHumansPerArena  |            3             |        6         |   12
  //   maxArenas          |            1             |        1         |    2
  //   botTarget          |            4             |        8         |   12
  //   botTotalTarget     |            7             |        9         |   16
  //   botMin             |            2             |        3         |    4
  //   tickHz             |           10             |       10         |   15
  //
  // Значення для 1 vCPU - оцінка за тими ж замірами; перед підняттям перемірте
  //   node -r ts-node/register/transpile-only -r tsconfig-paths/register \
  //     scripts/flock-load.ts net <люди> <боти> <Гц> 30
  // Автоснижение частоти (tickHzFallback) лишається страховкою, якщо тік запізнюється.
  // ======================================================================
  /** Частота серверного тіку. */
  tickHz: 10,
  /** Скільки живих гравців на арені. Далі - "Арена заповнена" (код `full`). */
  maxHumansPerArena: 6,
  /** Скільки арен одночасно. Нова відкривається, лише коли попередня заповнена. */
  maxArenas: 1,
  /** Ботів на арені, коли людей мало; зменшується з приходом людей. */
  botTarget: 8,
  /** Ботів = clamp(botTotalTarget - люди, botMin, botTarget). */
  botTotalTarget: 9,
  botMin: 3,
  /**
   * Жорсткі ліміти ботів за кількістю живих людей (поверх botTarget/botMin): [людей від, максимум ботів].
   * 4-5 людей -> не більше 2 ботів, 6 -> 0 (навіть коли навантаження в нормі).
   */
  botCapByHumans: [
    [6, 0],
    [4, 2],
  ] as readonly (readonly [number, number])[],
  /**
   * Боти за навантаженням: арена раз на evalMs оцінює (запізнення тіків, лаг event loop, CPU процесу);
   * при високому - прибирає ботів по одному, при довго низькому - повертає по одному.
   */
  botLoad: {
    evalMs: 2500,
    /** Високе навантаження: будь-який із показників вище порога. */
    high: { lateMs: 18, loopP99Ms: 60, cpuPct: 70 },
    /** Низьке навантаження: усі показники нижче порогів (гістерезис). */
    low: { lateMs: 6, loopP99Ms: 25, cpuPct: 40 },
    /** Скільки оцінок поспіль «низько», щоб повернути одного бота (6 x 2.5 с = 15 с). */
    returnAfterLow: 6,
    /** Бот, що йде, тікає до краю; якщо за цей час його все ще видно - прибираємо в будь-якому разі. */
    retireMaxMs: 25_000,
    /** Бот, що йде, вважається «невидимим» поза цією кратністю радіуса огляду найближчої людини. */
    retireHideFactor: 1.35,
  },

  /** 4000 -> 3400 (-15% по кожній стороні, площа -28%). Позиції в пакетах - u16 з кроком 1/16, тож стеля 4095. */
  worldSize: 3400,
  chunkSize: 320,
  /** Як часто шлемо таблицю лідерів і мінікарту (с). */
  boardEverySec: 1.5,
  /** Запобіжник: якщо таймер тіка запізнюється (EMA, мс) довше за lagBackoffMs - знижуємо частоту до цих значень; повертаємо, коли < lagRecoverMs. */
  tickHzFallback: [8, 6],
  lagBackoffMs: 25,
  lagRecoverMs: 8,

  // --- решта лімітів світу ---
  maxCellsPerPlayer: 16,
  /** Щільність та сама, що була (700 на 4000²) -> 506 на 3400²; округлено до 510. */
  maxFood: 510,
  /** Кущі: випадкова кількість і розкладка при кожному створенні арени. */
  thorns: {
    min: 7,
    max: 13,
    /** Мінімальна відстань між центрами кущів. */
    minGap: 380,
    /** Мінімальна відстань від краю світу до центру куща. */
    edgeMargin: 260,
    /** Ніяких кущів у центрі світу: це запасна точка появи гравця. */
    centerClear: 340,
    /** Маса куща (радіус = radiusK * sqrt(маса)) випадкова в цих межах - розмір трохи різний. */
    massMin: 58,
    massMax: 86,
  },
  maxBlobs: 200,
  maxBonuses: 6,
  /** Гравець без вводу довше за це відключається від арени. */
  afkKickMs: 90_000,

  // --- сесія: відновлення після вильоту ---
  /** Скільки овечка чекає на арені (пауза), якщо гравець відключився не сам. Явний вихід - без паузи. */
  resumePauseMs: 20_000,
  /** Щит одразу після повернення. */
  resumeShieldMs: 2000,

  // --- баланс для новачків ---
  /** Щит після (пере)народження гравця. */
  spawnShieldMs: 5000,
  /** Боти не нападають на людей, що на арені менше за цей час (ні полюють, ні з'їдають). */
  botGraceMs: 15_000,

  // --- маса ---
  startMass: 24,
  minSplitMass: 36,
  minThrowMass: 30,
  throwMass: 8,
  foodMass: 1.2,
  /** Піврозмір спрайта їжі (світові одиниці). Було 8.5, тепер x1.5; бонуси - x1.2 (на клієнті). */
  foodRadius: 12.75,
  /** Їжа підбирається, коли центр їжі ближче за радіус клітини + foodRadius * foodTouch (візуальний дотик). */
  foodTouch: 0.55,
  /** Радіус = radiusK * sqrt(маса). */
  radiusK: 4.2,
  /** Масу вище порога повільно "з'їдає" розпад (частка за секунду). */
  decayFromMass: 220,
  decayPerSec: 0.003,
  /** Хто більший у стільки разів - може з'їсти. */
  eatRatio: 1.25,
  /** Наскільки центр жертви має бути всередині того, хто їсть (частка радіуса жертви). */
  eatOverlap: 0.4,

  // --- рух ---
  baseSpeed: 330,
  speedMassExp: -0.18,
  minSpeed: 62,
  splitImpulse: 520,
  throwImpulse: 640,
  impulseFriction: 4.2,
  mergeDelayMs: 9000,
  splitCooldownMs: 250,
  throwCooldownMs: 90,
  /** Ліміт швидкості поверх будь-якого вводу (античіт). */
  maxSpeedHard: 560,

  // --- кущі ---
  /** Базова маса куща: від неї рахується поріг, коли великі клітини рве кущ (самі кущі мають масу massMin..massMax). */
  thornMass: 70,
  /** Кущ рве клітину, якщо її маса більша за thornMass * цей коефіцієнт. */
  thornPopRatio: 1.3,
  thornPieces: 6,

  // --- боти ---
  /** ШІ бота думає раз на N тіків (зі зсувом за id). */
  botThinkEvery: 5,
  botRespawnMs: 3000,

  // --- бонуси ---
  bonusSpawnEveryMs: 7000,
  /** Бонус підбирається, коли центр бонуса ближче за радіус клітини + bonusReach (було 14, бонуси на екрані x1.2 -> 17). */
  bonusReach: 17,
  bonusDurations: {
    speed: 7000,
    magnet: 8000,
    shield: 6000,
    ghost: 6000,
    double: 9000,
    freeze: 4000,
    golden: 0,
  },
  speedMultiplier: 1.5,

  /**
   * Розгін на старті: після входу на арену чи відродження людина швидша, щоб встигнути набрати масу й
   * піти від небезпеки. Бонус до швидкості лінійно спадає від speedBonus до 0 за durationMs і
   * не діє, коли загальна маса досягла massLimit. Ботам розгін не дається.
   */
  spawnBoost: {
    /** +40% до швидкості на самому початку. */
    speedBonus: 0.4,
    durationMs: 20_000,
    /** Від цієї загальної маси розгін вимикається. */
    massLimit: 120,
  },
  magnetRadius: 340,
  magnetPull: 260,
  freezeRadius: 650,
  freezeMaxTargets: 4,
  goldenMassFraction: 0.35,
  goldenMinMass: 40,

  // --- область видимості ---
  viewBase: 400,
  viewPerSqrtMass: 6.5,
  viewMax: 1100,
  /** Допустиме співвідношення сторін екрана клієнта (ширина/висота); площа огляду від нього не залежить. */
  aspectMin: 0.4,
  aspectMax: 2.5,

  // --- рубіни (внутрішньоігрова валюта, лише від сервера) ---
  rubies: {
    /** Нагорода за 1-ше місце в «Топ-10» з масою від порога (раз за життя). */
    top1Reward: 10,
    top1MassThreshold: 3000,
    /** Скільки рубінів можна заробити на арені за добу (доба за часом Києва). */
    dailyLimit: 100,
    dailyTimeZone: 'Europe/Kyiv',
    /** Вартість звичайного платного скіна. */
    skinPrice: 20,
    /** Вартість преміум-скіна (з анімацією) - окремо від звичайних платних. */
    premiumSkinPrice: 60,
    /** Скіни з номерами < freeSkins безкоштовні, решта - платні. */
    freeSkins: 12,
    /** Скіни з номерами >= premiumFrom - преміум (дорожчі, з анімацією). */
    premiumFrom: 18,
    /** Вартість «особливого» скіна (ряд 24-31, без анімації) - окремо від звичайних і преміум. */
    specialSkinPrice: 40,
    /** Скіни з номерами >= specialFrom - «особливі» (статичні, окремий ряд у лобі). */
    specialFrom: 24,
  },
} as const;

/** Розкладка кущів: розсип по всьому світу, купки (гаї) або кільце навколо центру. */
/** Параметри кущів (числа без літеральних типів: карти їх перекривають). */
export type ThornCfg = { [K in keyof typeof FLOCK_CONFIG.thorns]: number };

export type MapLayout = 'scatter' | 'clusters' | 'ring';

export interface FlockMapDef {
  /** Номер карти по мережі (u8, у welcome); клієнт за ним вибирає палітру. */
  id: number;
  name: string;
  layout: MapLayout;
  /** Перекриття C.thorns для цієї карти. */
  thorns: Partial<ThornCfg>;
}

/**
 * Види карт: арена при створенні випадково (рівноймовірно) бере одну з них. Новий вид = ще один запис тут
 * + палітра з таким id на клієнті (flockMaps.ts).
 */
export const FLOCK_MAPS: readonly FlockMapDef[] = [
  { id: 0, name: 'meadow', layout: 'scatter', thorns: {} },
  { id: 1, name: 'grove', layout: 'clusters', thorns: { min: 8, max: 12, minGap: 300 } },
  { id: 2, name: 'frost', layout: 'ring', thorns: { min: 8, max: 11, minGap: 340, massMin: 66, massMax: 92 } },
];

export type BonusKind = keyof typeof FLOCK_CONFIG.bonusDurations;
export const BONUS_KINDS = Object.keys(
  FLOCK_CONFIG.bonusDurations,
) as BonusKind[];

/** Безкоштовні 0..11, шість платних 12..17, шість преміум 18..23 і вісім особливих 24..31 (номер скіна по мережі - u8). */
export const NUM_SKINS = 32;
export const FREE_SKINS = FLOCK_CONFIG.rubies.freeSkins;
export const PREMIUM_FROM = FLOCK_CONFIG.rubies.premiumFrom;
export const isPaidSkin = (id: number) => id >= FREE_SKINS && id < NUM_SKINS;
export const SPECIAL_FROM = FLOCK_CONFIG.rubies.specialFrom;
export const isPremiumSkin = (id: number) => id >= PREMIUM_FROM && id < SPECIAL_FROM;
export const isSpecialSkin = (id: number) => id >= SPECIAL_FROM && id < NUM_SKINS;
/** Ціна платного скіна в рубінах (звичайний - skinPrice, преміум - premiumSkinPrice, особливий - specialSkinPrice). */
export const skinPriceOf = (id: number) =>
  isSpecialSkin(id)
    ? FLOCK_CONFIG.rubies.specialSkinPrice
    : isPremiumSkin(id)
      ? FLOCK_CONFIG.rubies.premiumSkinPrice
      : FLOCK_CONFIG.rubies.skinPrice;

/**
 * Скрытые скіни (тимчасово): не показуються в лобі й магазині, купити їх не можна (сервер відхиляє `skin_hidden`).
 * Уже куплені лишаються в гравця й доступні для гри. Щоб відкрити скіни - достатньо спорожнити цей масив.
 * Зараз сховано шість преміум-скінів з анімацією (18-23).
 */
export const HIDDEN_SKINS: readonly number[] = [18, 19, 20, 21, 22, 23];
export const isHiddenSkin = (id: number) => HIDDEN_SKINS.includes(id);
