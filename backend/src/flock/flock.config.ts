/**
 * Усі числа "Отари" в одному місці: частота, бонуси, боти, ліміти.
 * Одиниці: відстань - світові одиниці, час - мс, швидкість - од/с.
 */
export const FLOCK_CONFIG = {
  // ======================================================================
  // ЛІМІТИ ПІД ТАРИФ - це єдине місце, яке міняємо при зміні інстансу.
  //
  // Зараз: безкоштовний Render (~0.1 vCPU, 512 МБ). За замірами з
  // docs/flock-load.md арена коштує ~25-30 мс CPU/с постійно (боти, таймери, GC)
  // + ~4 мс CPU/с на кожного живого гравця (socket.io), тож під арену
  // віддаємо мінімум.
  //
  // При переході на платний тариф (орієнтир від ~0.5 vCPU, бюджет під арену
  // ~1/3 = ~165 мс/с) можна поставити:
  //   maxHumansPerArena: 30, maxArenas: 2,
  //   botTarget: 20, botTotalTarget: 34, botMin: 6,
  //   tickHz: 15 (20 - від ~1 vCPU).
  // Це оцінка за тими ж замірами: перед підняттям перемірте
  //   node -r ts-node/register/transpile-only -r tsconfig-paths/register \
  //     scripts/flock-load.ts net <люди> <боти> <Гц> 30
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
  botTotalTarget: 10,
  botMin: 3,

  worldSize: 3200,
  chunkSize: 320,

  // --- решта лімітів світу ---
  maxCellsPerPlayer: 16,
  maxFood: 520,
  maxThorns: 14,
  maxBlobs: 200,
  maxBonuses: 6,
  /** Гравець без вводу довше за це відключається від арени. */
  afkKickMs: 90_000,

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
  thornMass: 70,
  /** Кущ рве клітину, якщо її маса більша за thornMass * цей коефіцієнт. */
  thornPopRatio: 1.3,
  thornPieces: 6,

  // --- боти ---
  /** ШІ бота думає раз на N тіків (зі зсувом за id). */
  botThinkEvery: 4,
  botRespawnMs: 3000,

  // --- бонуси ---
  bonusSpawnEveryMs: 7000,
  bonusDurations: {
    speed: 7000,
    magnet: 8000,
    shield: 6000,
    ghost: 6000,
    double: 9000,
    freeze: 2000,
    golden: 0,
  },
  speedMultiplier: 1.5,
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
} as const;

export type BonusKind = keyof typeof FLOCK_CONFIG.bonusDurations;
export const BONUS_KINDS = Object.keys(
  FLOCK_CONFIG.bonusDurations,
) as BonusKind[];

export const NUM_SKINS = 12;
