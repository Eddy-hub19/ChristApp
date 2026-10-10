/**
 * Усі числа "Отари" в одному місці: частота, бонуси, боти, ліміти.
 * Одиниці: відстань - світові одиниці, час - мс, швидкість - од/с.
 */
export const FLOCK_CONFIG = {
  /** Частота серверного тіку. Підібрана замірами (scripts/flock-load.ts, docs/flock-load.md). */
  tickHz: 10,
  worldSize: 3200,
  chunkSize: 320,

  // --- ліміти (безкоштовний Render: ~0.1 CPU / 512 МБ) ---
  maxHumansPerArena: 30,
  maxArenas: 2,
  maxCellsPerPlayer: 16,
  maxFood: 520,
  maxThorns: 14,
  maxBlobs: 200,
  maxBonuses: 6,
  /** Гравець без вводу довше за це відключається від арени. */
  afkKickMs: 90_000,

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
  botTarget: 12,
  /** Скільки "живих місць" рахуємо в сумі з ботами: ботів = clamp(total - humans, botMin, botTarget). */
  botTotalTarget: 24,
  botMin: 4,
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
  viewBase: 520,
  viewPerSqrtMass: 7,
  viewMax: 1300,
} as const;

export type BonusKind = keyof typeof FLOCK_CONFIG.bonusDurations;
export const BONUS_KINDS = Object.keys(
  FLOCK_CONFIG.bonusDurations,
) as BonusKind[];

export const NUM_SKINS = 12;
