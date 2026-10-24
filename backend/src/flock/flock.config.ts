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
  /** Було 510 на 3400² (щільність 700 на 4000²); тепер +35% - вісім клітин на екрані ситіші. */
  maxFood: 690,
  /** Скільки їжі додається за тік, коли її менше за maxFood (було 8): з'їдене відростає швидше. */
  foodRegrowPerTick: 14,
  /** Кущі: випадкова кількість і розкладка при кожному створенні арени. */
  thorns: {
    /** Кущів на арені (було 7-13): мало й рівномірно по карті. */
    min: 4,
    max: 7,
    /** Мінімальна відстань між центрами кущів (щоб не слипались; з 4-7 кущами на 3400² пустих зон не лишає). */
    minGap: 700,
    /** Скільки випадкових точок пробуємо на кожен кущ: беремо найвіддаленішу від уже поставлених (рівномірний розсип). */
    candidates: 60,
    /** Розмір кущів зменшено в стільки разів (радіус; маса й радіус = / sizeDivisor, спрайт малюється за радіусом). */
    sizeDivisor: 1.5,
    /** Мінімальна відстань від краю світу до центру куща. */
    edgeMargin: 260,
    /** Ніяких кущів у центрі світу: це запасна точка появи гравця. */
    centerClear: 340,
    /** Маса куща (радіус = radiusK * sqrt(маса)) випадкова в цих межах - розмір трохи різний. */
    massMin: 58,
    /** Радіус до ~150: у найширший кущ влізе й гравець із 500+ масою (радіус 94). */
    massMax: 1275,
  },
  maxBlobs: 200,
  maxBonuses: 6,
  /** Гравець без вводу довше за це відключається від арени. */
  afkKickMs: 90_000,

  // --- сесія: відновлення після вильоту ---
  /** Скільки овечка чекає на арені (пауза), якщо гравець відключився не сам. Явний вихід - без паузи. */
  resumePauseMs: 30_000,
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
    speed: 10_000,
    magnet: 10_000,
    shield: 10_000,
    ghost: 6000,
    double: 9000,
    freeze: 4000,
    golden: 0,
    scissors: 0,
  },
  /**
   * Бонус «Ножиці»: миттєва хвиля навколо того, хто підібрав. Усі (крім нього), у кого загальна маса більша за
   * massThreshold, втрачають cutFraction маси кожної частини в радіусі; маса не падає нижче minMassAfter.
   * Зрізана маса переходить тому, хто взяв ножиці (takerShare, не більше maxGainOfOwnMass його поточної маси);
   * решта, що не влізла в ліміт, пропадає (їжею не розсипається).
   */
  scissors: {
    /** Шанс, що черговий бонус на полі - «Ножиці» (одночасно на полі не більше одних). */
    spawnChance: 0.05,
    /** Радіус хвилі у радіусах клітини, що підібрала бонус. */
    /** Було 2.5; +25% (takerShare / maxGainOfOwnMass - нижче). */
    radiusMul: 3.125,
    /** Не менше цього радіуса (світові одиниці), щоб хвиля була помітна й для малої клітини. */
    minRadius: 150,
    cutFraction: 0.5,
    /** Різати можна лише гравця із загальною масою БІЛЬШЕ цього порогу. */
    massThreshold: 500,
    /** Нижче цієї загальної маси гравця не підрізаємо. */
    minMassAfter: 500,
    /** Імунітети: щит, пауза (після вильоту), новачок (перші мс на арені). */
    immuneShield: true,
    immunePaused: true,
    newbieImmuneMs: 15_000,
    /** Яка частка зрізаної маси дістається тому, хто взяв ножиці (1 - уся). */
    takerShare: 1,
    /** Виграш за одне використання не більший за цю частку власної поточної маси того, хто взяв (проти різких стрибків). */
    maxGainOfOwnMass: 1,
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

  /**
   * Подія «Зорепад»: коли жива людина (не бот) досягає triggerMass, ~durationMs з неба падають великі зірки.
   * Зірки падають подалі від лідера й ближче до менших за нього; перед приземленням видно тінь (fallMs).
   * Повтор не частіше за cooldown (випадково між cooldownMinMs і cooldownMaxMs), поки хтось тримає triggerMass+.
   */
  zorepad: {
    triggerMass: 1000,
    durationMs: 10_000,
    /** Інтервал між зірками під час події (~22 зірки за подію). */
    spawnEveryMs: 450,
    /** Від появи тіні до приземлення; зірка підбирається лише після приземлення. */
    fallMs: 1000,
    /** Скільки мс нез'їдена зірка лежить на землі, поки не зникне. */
    lifetimeMs: 20_000,
    /** Скільки зірок на арені максимум. */
    maxStars: 30,
    /** Маса за зірку. */
    starMass: 200,
    /** Підбір: центр зірки ближче за радіус клітини + pickupReach. */
    pickupReach: 40,
    /** Мінімум живих гравців на арені (разом із ботами), щоб подія стартувала. */
    minAlive: 2,
    /** Скільки разів «Зорепад» може запустити один гравець за своє життя (від входу/відродження до смерті). */
    maxPerPlayerLife: 2,
    cooldownMinMs: 60_000,
    cooldownMaxMs: 90_000,
    /** Навколо лідера зірок немає; до leaderSparseRadius вони рідкі (ймовірність росте лінійно). */
    leaderClearRadius: 600,
    leaderSparseRadius: 1400,
    /** Частка зірок, що падають поблизу випадкового меншого за лідера гравця, і радіус розкиду навколо нього. */
    nearSmallerShare: 0.7,
    nearSmallerRadius: 500,
    /** Відступ від краю світу. */
    edgeMargin: 80,
  },

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
    /** Нагорода тому, хто з'їв «Вожака» (поза dailyLimit). */
    bossKillReward: 5,
    /** Скільки рубінів можна заробити на арені за добу (доба за часом Києва). */
    /** Разовий бонус кожному гравцеві за перший вхід у гру (не входить у dailyLimit). */
    entryBonus: 20,
    dailyLimit: 100,
    dailyTimeZone: 'Europe/Kyiv',
    /** Вартість звичайного платного скіна. */
    skinPrice: 20,
    /** Вартість преміум-скіна (з анімацією) - окремо від звичайних платних. */
    premiumSkinPrice: 60,
    /** Перший номер платних скінів у старій нумерації (безкоштовні задає FREE_SKIN_IDS). */
    freeSkins: 12,
    /** Скіни з номерами >= premiumFrom - преміум (дорожчі, з анімацією). */
    premiumFrom: 18,
    /** Вартість «особливого» скіна (ряд 24-33, без анімації) - окремо від звичайних і преміум. */
    specialSkinPrice: 40,
    /** Скіни з номерами >= specialFrom - «особливі» (статичні, окремий ряд у лобі). */
    specialFrom: 24,
  },

  // --- Швидкі фрази (хмаринка над овечкою; тексти й емодзі - на клієнті, по мережі лише id) ---
  phrases: {
    /** Допустимі id фраз. Нова фраза = дописати id сюди й запис у клієнтський flockPhrases.ts. */
    ids: [1, 2, 3, 4, 5, 6, 7, 8] as readonly number[],
    /** Скільки висить хмаринка (мс); не більше 30 с (див. PHRASE_MAX_MS). */
    durationMs: 30_000,
    /** Не частіше однієї фрази на гравця за цей час (мс). */
    cooldownMs: 3_000,
  },

  // --- «Рекорди дня» і нагорода за серію днів на 1-му місці (доба за rubies.dailyTimeZone) ---
  dailyRecords: {
    /** Скільки днів поспіль треба бути №1 за день. */
    streakDays: 3,
    /** Нагорода за серію (поза rubies.dailyLimit). */
    streakReward: 20,
    /** Мінімальна маса, з якою день зараховується переможцю (щоб не виграти день порожньою грою). */
    minMass: 1000,
    /** Не частіше ніж раз на стільки мс пишемо рекорд одного гравця в БД. */
    writeThrottleMs: 10_000,
    /** Кеш таблиці на сервері (мс). */
    cacheMs: 45_000,
    /** Скільки днів зберігати рекорди. */
    keepDays: 30,
    /** Скільки рядків у таблиці. */
    topSize: 3,
  },

  // --- «Вожак»: один дуже сильний бот на арені (але переможний: можна з'їсти, маса тане і має стелю) ---
  boss: {
    enabled: true,
    /** Ім'я фіксоване (не зі списку імен ботів). */
    name: 'Вожак',
    /** Перша поява після старту арени (світовий час, мс), лише коли є живі гравці. */
    firstSpawnMinMs: 60_000,
    firstSpawnMaxMs: 120_000,
    /** Відродження після смерті (мс). */
    respawnMinMs: 110_000,
    respawnMaxMs: 130_000,
    startMass: 2000,
    /** Стеля: понад це маса обрізається (з'їдене зверху пропадає), щоб не захопив арену. */
    maxMass: 2600,
    /**
     * Розпад: тане лише маса клітини ВИЩЕ decayFromMass і пропорційно цьому надлишку (decayPerSec за секунду),
     * тож маса м'яко сповзає до ~decayFromMass і не обвалюється миттєво; тримається в межах decayFromMass..maxMass.
     */
    decayFromMass: 1800,
    decayPerSec: 0.01,
    /** «Ножиці» різають його як усіх, але нижче цієї загальної маси не опускають (звичайним гравцям - scissors.minMassAfter). */
    scissorsMinMassAfter: 1000,
    /** Нагорода тому, хто з'їв Вожака: частка маси клітини, що додається (1 - як за звичайного гравця). */
    eatMassGain: 1,
    /** ШІ думає раз на N тіків (у звичайних ботів botThinkEvery = 5). */
    thinkEvery: 2,
    /** Радіус огляду: у ньому Вожак бачить гравців, групи й кущі. */
    viewRadius: 1300,
    /** Радіуси: полювання, втеча, їжа, бонуси. */
    huntRadius: 1050,
    fleeRadius: 700,
    foodRadius: 420,
    bonusRadius: 700,
    /** Агресивність 0..1: множить цінність здобичі (полює охочіше й далі). */
    aggression: 0.8,
    /** Здобич із їстівною масою менше за це - дрібниця: ігнорується (їжа важливіша). */
    preyMinMass: 120,
    /** Цінність цілі = їстівна маса * aggression / (відстань + preyDistSoft); бонус за поточну ціль - щоб не метатися. */
    preyDistSoft: 250,
    preyStickBonus: 1.35,
    /** Упреждення: на скільки секунд вперед екстраполюємо рух цілі (не більше) і згладжування оцінки швидкості. */
    leadMaxSec: 2.5,
    velSmooth: 0.5,
    /** Поділ для нападу лише коли шанс спіймати (0..1) не менший за цей; поділ можливий не частіше за splitGapMs. */
    splitMinCatch: 0.75,
    splitGapMs: 6000,
    /** Після стількох мс без атаки й без загрози Вожак збирає частини докупи. */
    regroupAfterMs: 2500,
    /** Загін до краю: цілі, ближчі за стільки до стіни, вважаються загнаними (кут - ще й шанс вище). */
    trapWallDist: 380,
    /** Заходимо до цілі з боку, протилежного стіні: бічний зсув (частка відстані, не більше herdMaxOffset). */
    herdFactor: 0.45,
    herdMaxOffset: 420,
    /** Засідка: Вожак із клітинами, що влазять у кущ, чекає в ньому, поки ціль підійде ближче за ambushStrikeDist. */
    ambushRadius: 650,
    ambushLureRadius: 700,
    ambushMaxMs: 7000,
    ambushCooldownMs: 9000,
    ambushStrikeDist: 360,
    /** Схованка: радіус пошуку куща, у який Вожак вміщується (радіус куща більший за його). */
    hideRadius: 800,
    /** Тактика: стільки людей у crowdRadius - «натовп»: тримається на окраїні й б'є одинаків (ізольованих на loneRadius). */
    crowdCount: 3,
    crowdRadius: 1000,
    loneRadius: 520,
    /** Група, що разом важить не менше за groupThreatRatio * його масу, у groupRadius - загроза (тікає). */
    groupRadius: 600,
    groupThreatRatio: 0.9,
    /** Відступ від краю світу, куди тримається в «натовпі», і поле, де стіна відштовхує. */
    outskirtsMargin: 480,
    wallMargin: 260,
    /** Скільки радіан за одне роздумування можна повернути (плавність); при втечі - x2. */
    maxTurnPerThink: 0.5,
    /** Застрягання: рухається, а зсув за stuckCheckMs менший за stuckMinMove - розвертається на unstuckMs. */
    stuckCheckMs: 1200,
    stuckMinMove: 40,
    unstuckMs: 1400,
  },

  // --- артефакти (надягаються поверх скіна, купуються за рубіни, 1 надітий; бонус рахує сервер за надітим) ---
  artifacts: {
    /** Ціна кожного артефакта в рубінах - окремо від цін скінів. */
    price: 100,
    /** 1 «Взуття»: +8% до швидкості (вище maxSpeedHard не піднімає). */
    shoesSpeedBonus: 0.08,
    /**
     * 2 «Шапка священника»: перші priestHatFreeMs життя (від входу чи відродження) маса не тане, далі тане як
     * звичайно; на початку кожного priestHatPeriodMs від початку життя знову priestHatFreeMs без розпаду.
     */
    priestHatFreeMs: 60_000,
    priestHatPeriodMs: 300_000,
    /** 3 «Королівська корона»: +10% маси від з'їденої їжі. */
    crownFoodBonus: 0.1,
    /** 4 «Магніт»: слабке постійне притягання їжі (радіус не змінюється), швидкість притягання +magnetPullBonus. */
    magnetRadius: 140,
    magnetPull: 70,
    magnetPullBonus: 0.25,
    /** 5 «Пісочний годинник»: підібрані бонуси діють на 30% довше. */
    hourglassDurationBonus: 0.3,
    /** 6 «Хрест»: «Друге життя» - раз за життя оживає на місці з цією часткою маси, зі щитом на reviveShieldMs. */
    reviveMassFraction: 0.4,
    reviveShieldMs: 3000,
    /** 7 «Кадило»: боти й «Вожак» тримаються подалі від носія в цьому радіусі (на людей не діє). */
    censerRadius: 500,
  },
} as const;

/** Розкладка кущів: розсип по всьому світу, купки (гаї) або кільце навколо центру. */
/** Параметри кущів (числа без літеральних типів: карти їх перекривають). */
export type ThornCfg = { [K in keyof typeof FLOCK_CONFIG.thorns]: number };

/** Вигляд кущів карти: `bush` - зелений, `autumn` - жовте осіннє листя, `fir` - ялинка зі сніговими шапками. */
export type ThornStyle = 'bush' | 'autumn' | 'fir';

export type MapLayout = 'scatter' | 'clusters' | 'ring';

export interface FlockMapDef {
  /** Номер карти по мережі (u8, у welcome); клієнт за ним вибирає палітру. */
  id: number;
  name: string;
  layout: MapLayout;
  /** Вигляд «кущів» на карті (клієнт малює спрайт за цим значенням; поведінка однакова): зелений кущ, осінній (жовтий), ялинка. */
  thornStyle: ThornStyle;
  /** Перекриття C.thorns для цієї карти. */
  thorns: Partial<ThornCfg>;
}

/**
 * Види карт: арена при створенні випадково (рівноймовірно) бере одну з них. Новий вид = ще один запис тут
 * + палітра з таким id на клієнті (flockMaps.ts).
 */
export const FLOCK_MAPS: readonly FlockMapDef[] = [
  { id: 0, name: 'meadow', layout: 'scatter', thornStyle: 'bush', thorns: {} },
  { id: 1, name: 'grove', layout: 'scatter', thornStyle: 'autumn', thorns: {} },
  { id: 2, name: 'frost', layout: 'scatter', thornStyle: 'fir', thorns: {} },
];

/**
 * Числа для экрана «Про гру» в лобби: уходят клиенту в ответе /flock/me (config.game), чтобы тексты не расходились с игрой.
 * Новое число для описания - дописать сюда и сослаться на него путём из flockInfoData.ts на клиенте.
 */
export function clientGameConfig() {
  const c = FLOCK_CONFIG;
  return {
    bonusDurations: { ...c.bonusDurations },
    speedMultiplier: c.speedMultiplier,
    goldenMassFraction: c.goldenMassFraction,
    goldenMinMass: c.goldenMinMass,
    freezeMaxTargets: c.freezeMaxTargets,
    scissors: {
      cutFraction: c.scissors.cutFraction,
      massThreshold: c.scissors.massThreshold,
      minMassAfter: c.scissors.minMassAfter,
      takerShare: c.scissors.takerShare,
    },
    spawnBoost: { ...c.spawnBoost },
    spawnShieldMs: c.spawnShieldMs,
    resumePauseMs: c.resumePauseMs,
    resumeShieldMs: c.resumeShieldMs,
    botGraceMs: c.botGraceMs,
    mergeDelayMs: c.mergeDelayMs,
    eatRatio: c.eatRatio,
    foodMass: c.foodMass,
    throwMass: c.throwMass,
    thornPopMass: Math.round(c.thornMass * c.thornPopRatio),
    zorepad: {
      triggerMass: c.zorepad.triggerMass,
      durationMs: c.zorepad.durationMs,
      starMass: c.zorepad.starMass,
      maxPerPlayerLife: c.zorepad.maxPerPlayerLife,
    },
    boss: {
      startMass: c.boss.startMass,
      maxMass: c.boss.maxMass,
      firstSpawnMinMs: c.boss.firstSpawnMinMs,
      firstSpawnMaxMs: c.boss.firstSpawnMaxMs,
      respawnMinMs: c.boss.respawnMinMs,
      respawnMaxMs: c.boss.respawnMaxMs,
    },
    rubies: {
      top1Reward: c.rubies.top1Reward,
      top1MassThreshold: c.rubies.top1MassThreshold,
      dailyLimit: c.rubies.dailyLimit,
      entryBonus: c.rubies.entryBonus,
      bossKillReward: c.rubies.bossKillReward,
      skinPrice: c.rubies.skinPrice,
      premiumSkinPrice: c.rubies.premiumSkinPrice,
      specialSkinPrice: c.rubies.specialSkinPrice,
    },
    dailyRecords: {
      streakDays: c.dailyRecords.streakDays,
      streakReward: c.dailyRecords.streakReward,
      minMass: c.dailyRecords.minMass,
      topSize: c.dailyRecords.topSize,
    },
    artifactPrice: c.artifacts.price,
    artifacts: {
      priestHatFreeMs: c.artifacts.priestHatFreeMs,
      priestHatPeriodMs: c.artifacts.priestHatPeriodMs,
      magnetPullBonus: c.artifacts.magnetPullBonus,
      reviveMassFraction: c.artifacts.reviveMassFraction,
      censerRadius: c.artifacts.censerRadius,
    },
    phrases: {
      durationMs: phraseDurationMs(),
      cooldownMs: c.phrases.cooldownMs,
    },
  };
}

export type BonusKind = keyof typeof FLOCK_CONFIG.bonusDurations;
export const BONUS_KINDS = Object.keys(
  FLOCK_CONFIG.bonusDurations,
) as BonusKind[];

/**
 * Номери скінів (u8 по мережі). Нумерація існуючих НЕ міняється, нові додаються в кінець:
 * 0-11 безкоштовні (старі), 12-17 платні, 18-23 преміум, 24-33 особливі, 34-35 платні (звичайні),
 * 36 - «Вожак» (поза вибором), 37-40 нові безкоштовні вовки. Групи задано явними списками.
 */
export const EXTRA_PAID_FROM = 34;
export const NUM_SKINS = 41;
/** Скін «Вожака»: гравець обрати не може, у лобі його нема (номер у діапазоні, але зарезервований). */
export const BOSS_SKIN = 36;
/** Перший номер платних скінів у старій нумерації (лише для зворотної сумісності; безкоштовні - FREE_SKIN_IDS). */
export const FREE_SKINS = FLOCK_CONFIG.rubies.freeSkins;
/**
 * Безкоштовні скіни: явний список. Ботам дістаються лише вони (випадковий з цього списку).
 * Порядок = розкладка лобі: 6 овечок (0-5), ряд вовків (8, 9 і нові 37-40), решта (ягня 6, баран 7, собака 10, вівця 11).
 */
export const FREE_SKIN_IDS: readonly number[] = [
  0, 1, 2, 3, 4, 5, 8, 9, 37, 38, 39, 40, 6, 7, 10, 11,
];
export const isFreeSkin = (id: number) => FREE_SKIN_IDS.includes(id);
/** Скін, який гравець узагалі може обрати (не «Вожак», у межах нумерації). */
export const isSelectableSkin = (id: number) =>
  Number.isInteger(id) && id >= 0 && id < NUM_SKINS && id !== BOSS_SKIN;
export const isPaidSkin = (id: number) => isSelectableSkin(id) && !isFreeSkin(id);
/** Преміум-скіни (з анімацією, premiumSkinPrice): явний список. */
export const PREMIUM_SKIN_IDS: readonly number[] = [18, 19, 20, 21, 22, 23];
export const PREMIUM_FROM = FLOCK_CONFIG.rubies.premiumFrom;
export const SPECIAL_FROM = FLOCK_CONFIG.rubies.specialFrom;
export const isPremiumSkin = (id: number) => PREMIUM_SKIN_IDS.includes(id);
export const isSpecialSkin = (id: number) => id >= SPECIAL_FROM && id < EXTRA_PAID_FROM;
/** Ціна платного скіна в рубінах (звичайний - skinPrice, преміум - premiumSkinPrice, особливий - specialSkinPrice). */
export const skinPriceOf = (id: number) =>
  isSpecialSkin(id)
    ? FLOCK_CONFIG.rubies.specialSkinPrice
    : isPremiumSkin(id)
      ? FLOCK_CONFIG.rubies.premiumSkinPrice
      : FLOCK_CONFIG.rubies.skinPrice;

/**
 * Зняті з продажу скіни: не показуються в лобі (крім тих, хто їх вже купив) і не продаються (сервер відхиляє
 * `skin_hidden`). Куплені лишаються в гравця й доступні для гри. Щоб відкрити скіни - спорожнити масив.
 * Зараз: 13 «Барашек із дзвіночком», 16 «Вовк в овечій шкурі», 22 «Пастушок Давид», 23 «Полярний вовк»,
 * 24 «Кришталева вівця», 26 «Вівця-грибок», 27 «Лавова вівця», 30 «Вівця-робот», 31 «Вівця-суші».
 * Нумерація не змінюється; дзеркало для клієнта - HIDDEN_SKIN_IDS у frontend/src/lib/rubies.ts (до завантаження профілю).
 * Покупки на момент зняття (2026-10-24, читання БД): 13 - 1, 23 - 1, 24 - 1, 27 - 2, 31 - 2: спрайти лишаються в коді.
 */
export const HIDDEN_SKINS: readonly number[] = [13, 16, 22, 23, 24, 26, 27, 30, 31];
export const isHiddenSkin = (id: number) => HIDDEN_SKINS.includes(id);

/** Артефакти: номер по мережі (u8) і в БД; 0 - нічого не надіто. Ціна - FLOCK_CONFIG.artifacts.price. */
export const ARTIFACT = {
  none: 0,
  shoes: 1,
  priestHat: 2,
  crown: 3,
  magnet: 4,
  hourglass: 5,
  cross: 6,
  censer: 7,
} as const;
export const NUM_ARTIFACTS = 7;
/** Стеля тривалості хмаринки: значення в конфігу не може її перевищити. */
export const PHRASE_MAX_MS = 30_000;
export const phraseDurationMs = () =>
  Math.max(0, Math.min(PHRASE_MAX_MS, FLOCK_CONFIG.phrases.durationMs));
export const isPhraseId = (id: unknown): id is number =>
  typeof id === 'number' && FLOCK_CONFIG.phrases.ids.includes(id);
export const isArtifactId = (id: unknown): id is number =>
  typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= NUM_ARTIFACTS;
