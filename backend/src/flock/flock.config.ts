/**
 * Усі числа "Отари" в одному місці: частота, бонуси, боти, ліміти.
 * Одиниці: відстань - світові одиниці, час - мс, швидкість - од/с.
 */
/** Бонус скіна (усі поля необов'язкові; частки - 0.1 = 10%). Рахується сервером за обраним скіном; клієнт передбачає лише швидкість і розгін. */
export interface SkinPerk {
  /** Радіус підбору їжі. */
  foodReach?: number;
  /** Розпад маси повільніший. */
  decaySlow?: number;
  /** Швидкість. */
  speed?: number;
  /** Тривалість підібраних бонусів. */
  bonusDuration?: number;
  /** Розгін на старті: додаток до speedBonus (п.п.) і до тривалості (мс). */
  spawnBoostBonus?: number;
  spawnBoostMs?: number;
  /** Маса від їжі. */
  foodMass?: number;
  /** Маса від трави й квітів (kind 0, 1). */
  grassFlowerMass?: number;
  /** Щит після входу/відродження довший (мс). */
  shieldBonusMs?: number;
  /** «Прискорення» горить менше. */
  sprintBurnLess?: number;
  /** Заморозка на цьому гравці коротша. */
  freezeLess?: number;
  /** Калюжі «Дощу» уповільнюють слабше. */
  puddleLess?: number;
}

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
    eagle: 10_000,
    pipe: 10_000,
  },
  /**
   * Бонус «Сопілка пастуха» (kind pipe): поки діє, усі клітини гравців і ботів у радіусі radiusCells × радіус клітини
   * власника, що МЕНШІ за його клітину, плавно тягнуться до нього зі швидкістю pullFraction × їхньої власної швидкості
   * (тому ціль, що активно тікає, вириветься). Не діє на тих, хто на паузі чи під стартовим щитом, на «Вожака», чудовиськ
   * і біля лави (береговий запас). Рідкісний: на полі не більше одного, spawnChance - шанс чергового бонуса.
   */
  pipe: {
    radiusCells: 3.5,
    pullFraction: 0.6,
    spawnChance: 0.06,
  },
  /**
   * Подія «Вітер» (карти зі списку maps; на «Вулкані» вимкнено, щоб не зносило в лаву): раз на interval, триває duration;
   * за warnMs до початку всім показується «Вітер!» зі стрілкою. Дме в один бік; усім клітинам (гравці, боти, чудовиська)
   * додається снос: strength × швидкість клітини стартової маси / (1 + маса / massHalf) - великі зносить слабше.
   * Не зносить на паузі, під стартовим щитом і всередині куща; їжа й бонуси не рухаються. «Зорепад» і вітер не йдуть разом.
   */
  wind: {
    maps: [0, 1, 2] as readonly number[],
    intervalMinMs: 180_000,
    intervalMaxMs: 300_000,
    durationMinMs: 15_000,
    durationMaxMs: 20_000,
    warnMs: 3000,
    strength: 0.25,
    massHalf: 600,
  },
  /**
   * Зміна карт: нова арена бере карту за вагами FLOCK_MAPS, але не ту ж, що була попередньою. Арена, що живе довше
   * rotateMs, нових гравців більше не приймає (вони потрапляють на нову арену з іншою картою); тих, хто вже грає, не чіпаємо.
   */
  mapRotation: {
    rotateMs: 30 * 60_000,
  },
  /**
   * Бонус «Орлиний зір»: гравець бачить більше карти. Сервер шле йому область ×viewMultiplier, клієнт відсуває
   * камеру в zoom разів (плавно); після кінця область тримається ще graceMs, поки камера повертається.
   * spawnChance - шанс, що черговий бонус на полі - «Орлиний зір». Боти бачать свій звичайний радіус.
   */
  eagle: {
    spawnChance: 0.1,
    viewMultiplier: 1.4,
    zoom: 1.4,
    graceMs: 1500,
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
  /**
   * «Прискорення» (кнопка / Shift): поки утримується, швидкість +speedBonus, а за це горить burnPerSec від маси за секунду
   * (згоріла маса зникає, їжею не сиплеться). Не працює, якщо загальна маса менша за minTotalMass, і ніколи не опускає її
   * нижче max(startMass, floorMass). Ботам недоступне. Підсумковий множник швидкості з усіма бонусами
   * (розгін × «Прискорення» × башмаки × рив​ок) не перевищує maxSpeedMultiplier (і ніколи не менший за той, що був без ривка).
   */
  sprint: {
    speedBonus: 0.25,
    burnPerSec: 0.015,
    minTotalMass: 40,
    floorMass: 30,
    maxSpeedMultiplier: 2.2,
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
    triggerMass: 1500,
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
    maxPerPlayerLife: 1,
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

  /**
   * Подія «Дощ» (лише карти зі списку maps - «Гай»): раз на intervalMin..MaxMs, триває durationMin..MaxMs; на цей час
   * з'являється puddlesMin..Max калюж (випадково, не в центрі й не під живими гравцями). Калюжа уповільнює клітину на
   * slowFraction; коли дощ скінчився, калюжі підсихають ще dryMs (уповільнення лінійно слабшає до 0).
   * «Зорепад» не стартує під час дощу (відкладається до його кінця), дощ не стартує під час зорепаду.
   */
  rain: {
    maps: [1] as readonly number[],
    intervalMinMs: 120_000,
    intervalMaxMs: 240_000,
    durationMinMs: 40_000,
    durationMaxMs: 60_000,
    puddlesMin: 8,
    puddlesMax: 12,
    puddleRadiusMin: 95,
    puddleRadiusMax: 160,
    slowFraction: 0.2,
    dryMs: 20_000,
    /** Радіус навколо центру світу без калюж. */
    centerClear: 450,
    edgeMargin: 220,
    /** Мінімальний проміжок між краями калюж і до клітин живих людей на мить початку. */
    gap: 100,
  },

  /**
   * «Лавові чудовиська» (лише карти з лавою): орда з min..max істот, що нападають на найближчу людину. Швидші за гравця
   * тієї ж маси на speedMultiplier - 1, маса невелика, ділитися не вміють, лави не бояться й ходять по ній. Їх можна з'їсти
   * (звичайна маса), мертві відроджуються в лаві через respawnMs. Не нападають на новачків (botGraceMs), щит, привида й паузу;
   * рубінів за них нема, у таблиці лідерів їх нема. При високому навантаженні регулятор прибирає їх ПЕРВИМИ (ботів не чіпає),
   * повертає після lowEvalsToReturn спокійних оцінок; capByHumans - жорсткий ліміт за числом людей (від 6 людей - не більше 4).
   */
  monsters: {
    enabled: true,
    min: 6,
    max: 10,
    name: 'Магма',
    massMin: 60,
    massMax: 90,
    /** Стеля маси: надлишок після з'їдених гравців зникає, щоб орда не обростала. */
    ceilMass: 160,
    speedMultiplier: 1.2,
    respawnMs: 20_000,
    /** Раз на скільки тіків думає (боти - botThinkEvery = 5). */
    thinkEvery: 8,
    aggroRadius: 900,
    capByHumans: [[6, 4]] as readonly (readonly [number, number])[],
    lowEvalsToReturn: 6,
  },

  /**
   * Режим «Звужуване коло» (окрема арена, кнопка «Режими» в лобі). Раунд: warmupMs тиші, далі стадії: holdMs чекаємо,
   * shrinkMs коло звужується до radius (центр випадковий, на початку коло майже покриває світ). Клітина ПОЗА колом
   * втрачає масу: max(маса × outsideLossPerSec, outsideMinLossPerSec) за секунду; менше за dieBelowMass - зникає.
   * Раунд кінчається, коли лишився один живий (разом із ботами) чи жодної людини, або по таймеру (після останнього
   * звуження ще finalHoldMs): переможець - останній живий або найбільший за масою. Людині-переможцю - winReward рубінів
   * (у межах того ж добового ліміту арени), далі endHoldMs показуємо підсумки й стартує новий раунд. Світ без лави й дощу.
   */
  circle: {
    enabled: true,
    maxArenas: 1,
    /** Карти, на яких може бути режим (без лави й дощу). */
    maps: [0, 2] as readonly number[],
    warmupMs: 24_000,
    startRadius: 2500,
    /** Центр не ближче до краю світу, ніж centerMargin (щоб круг лишався в межах карти). */
    centerMargin: 1000,
    stages: [
      { holdMs: 19_200, shrinkMs: 40_000, radius: 1150 },
      { holdMs: 16_000, shrinkMs: 32_000, radius: 700 },
      { holdMs: 12_800, shrinkMs: 24_000, radius: 380 },
      { holdMs: 9_600, shrinkMs: 19_200, radius: 150 },
    ] as readonly { holdMs: number; shrinkMs: number; radius: number }[],
    finalHoldMs: 16_000,
    outsideLossPerSec: 0.084,
    outsideMinLossPerSec: 4.2,
    dieBelowMass: 8,
    endHoldMs: 10_000,
    winReward: 5,
  },

  /**
   * Режим «Замки» (окрема арена, кнопка «Режими»): два замки в протилежних кутах карти «Лес и озеро», річка по діагоналі
   * з трьома мостами. Гравець краде один камінь із чужого сховища (стоїть біля кристала stealHoldMs), несе у свою базу:
   * замок суперника втрачає damagePerStone HP, команда +1 очко; castleHp / damagePerStone доставок руйнують замок. Захисник,
   * що торкнувся злодія на території своєї команди, змушує його впустити камінь; злодій оживає в замку через respawnMs.
   * Усі гравці однакової маси й швидкості, без поїдання, ділення, кидка, їжі, бонусів. Кущі ховають від ворога, поки він
   * не ближче bushRevealRadius (на воді не ховають).
   */
  teamMode: {
    enabled: true,
    /** Скільки арен режиму одночасно (окремо від maxArenas звичайних). */
    maxArenas: 1,
    /** Номер карти режиму (FLOCK_MAPS, поза випадковим вибором звичайної арени). */
    mapId: 4,
    /** Формат: teamSize на teamSize (боти добивають до нього); людей у команді не більше maxTeamSize (4 на 4). */
    teamSize: 3,
    maxTeamSize: 4,
    /** Нова сторона не може випереджати іншу за людьми на balanceGap і більше. */
    balanceGap: 2,
    /** Відлік до початку бою від моменту, коли набралось потрібне число людей; startMinHumansEachTeam: 0 - досить однієї людини в арені. */
    countdownMs: 20_000,
    startMinHumansEachTeam: 0,
    /** Тривалість матчу (по таймеру перемагає команда з більшою шкодою замку) і пауза з підсумками до нового матчу. */
    matchMs: 10 * 60_000,
    endHoldMs: 15_000,
    castleHp: 100,
    damagePerStone: 20,
    /** Камінів у сховищі замка (стільки ж доставок руйнує замок). */
    stonesPerCastle: 5,
    stealHoldMs: 1500,
    /** Радіус сховища навколо центру замка (де краде злодій) і радіус зони бази (де доставляють). */
    stealRadius: 170,
    baseRadius: 400,
    /** Несучий камінь повільніший на 15%; у воді (поза мостом) повільніше на 40%. */
    carrySlow: 0.15,
    waterSlow: 0.4,
    /** Однакові для всіх: маса клітини й швидкість (од/с). */
    playerMass: 30,
    playerSpeed: 200,
    /** Радіус огляду (однаковий для всіх, не залежить від маси). */
    viewRadius: 620,
    respawnMs: 5000,
    respawnShieldMs: 3000,
    /** Камінь, що впустили, лежить; свій повертається сам через lyingReturnMs (захисник - одразу, торкнувшись). */
    lyingReturnMs: 20_000,
    /** Запас на дотик клітин (світові одиниці). */
    touchMargin: 12,
    /** Ворог, що в кущі, видимий лише ближче за цей радіус. */
    bushRevealRadius: 260,
    /** Скільки тіків між розсилками стану матчу `cm` (10 Гц / 2 = 5 Гц). */
    stateEveryTicks: 2,
    /** Розкладка карти: річка (діагональ), мости (частки довжини осі), замки й кущі-укриття. */
    map: {
      riverHalfWidth: 170,
      bridgeWidth: 330,
      bridgeOver: 40,
      bridgeAt: [0.2, 0.5, 0.8] as readonly number[],
      /** Овечий замок (лівий нижній кут); вовчий - дзеркально через центр світу. */
      sheepCastle: { x: 480, y: 2920 },
      bushesPerSide: 14,
      bushRadiusMin: 90,
      bushRadiusMax: 140,
      /** Мінімум між краєм куща й річкою / базою замка (світові одиниці). */
      bushRiverGap: 80,
      bushBaseGap: 120,
      bushGap: 60,
      seed: 20261104,
    },
    bots: {
      /** Частка ботів команди, що йдуть красти (решта захищають); завжди хоч один захисник, якщо в команді 2+ ботів. */
      thiefShare: 0.5,
      /** Захисник тримається в цих межах від замка, поки ворога нема. */
      guardRadius: 520,
      /** Захисник помічає злодія з каменем на своїй території в цьому радіусі. */
      noticeRadius: 420,
    },
    /** Нагорода переможцям: лише сервер, через журнал рубінів (TEAM_WIN), поза добовим лімітом арени. */
    reward: 30,
    /** Матч зараховується до нагороди лише якщо тривав не менше. */
    minMatchMs: 120_000,
    /** Не AFK: за матч не менше стількох дій (зміна напрямку/сили) і пройдена відстань не менше стількох одиниць. */
    afkMinActions: 20,
    afkMinMoveDist: 600,
    /** Оплачуваних перемог на добу (доба за Києвом). */
    dailyWinLimit: 5,
    /** Матч «проти ботів» (живого суперника не було ≥ botOnlyEnemyHumanMs): нагород лише botOnlyRewardLimit за період. */
    botOnlyRewardLimit: 3,
    /** 'day' - лічильник скидається опівночі за Києвом, 'lifetime' - назавжди. */
    botOnlyRewardPeriod: 'day' as 'day' | 'lifetime',
    botOnlyEnemyHumanMs: 60_000,
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
    skinPrice: 50,
    /** Вартість преміум-скіна (з анімацією) - окремо від звичайних платних. */
    premiumSkinPrice: 200,
    /** Перший номер платних скінів у старій нумерації (безкоштовні задає FREE_SKIN_IDS). */
    freeSkins: 12,
    /** Скіни з номерами >= premiumFrom - преміум (дорожчі, з анімацією). */
    premiumFrom: 18,
    /** Вартість «особливого» скіна (ряд 24-33, без анімації) - окремо від звичайних і преміум. */
    specialSkinPrice: 150,
    /** Скіни з номерами >= specialFrom - «особливі» (статичні, окремий ряд у лобі). */
    specialFrom: 24,
    /** Разова нагорода за повну колекцію преміум-скінів, що зараз у продажу (без HIDDEN_SKINS); поза dailyLimit. */
    premiumCollectionReward: 300,
  },

  // --- Швидкі фрази (хмаринка над овечкою; тексти й емодзі - на клієнті, по мережі лише id) ---
  phrases: {
    /** Допустимі id фраз. Нова фраза = дописати id сюди й запис у клієнтський flockPhrases.ts. */
    ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as readonly number[],
    /** Скільки висить хмаринка (мс); не більше 30 с (див. PHRASE_MAX_MS). */
    durationMs: 30_000,
    /** Не частіше однієї фрази на гравця за цей час (мс). */
    cooldownMs: 3_000,
    /** Свій текст: вимикач цілком (true - працює), довжина, і ліміти суворіші за готові фрази: пауза між і за хвилину. */
    customEnabled: true,
    customMaxLen: 40,
    customCooldownMs: 5_000,
    customPerMinute: 10,
    /** Скільки останніх своїх текстів тримає пам'ять сервера для адмінки (без БД; після перезапуску порожньо). */
    customLogSize: 100,
  },

  // --- «Рекорди дня» і нагорода за серію днів на 1-му місці (доба за rubies.dailyTimeZone) ---
  dailyRecords: {
    /**
     * Нагорода за кожну ЗАКРИТУ добу поспіль на 1-му місці (поза rubies.dailyLimit): день N серії = streakRewards[N-1].
     * Після останнього елемента серія починається заново (довжина циклу = streakRewards.length).
     */
    streakRewards: [10, 20, 30] as readonly number[],
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

  /**
   * Карта «Вулкан»: горизонтальна річка лави посередині на всю ширину й кілька мостів (випадково при створенні арени).
   * Клітина, чий центр у лаві поза мостом, гине («згоріла»; маса нікому). Новачок на стартовому щиті, гравець на паузі й
   * після «Хреста» в лаві не гинуть (їх виштовхує до берега); «Привид» і бонус «Щит» від лави не рятують.
   */
  lava: {
    /** Товщина річки: частка висоти світу. */
    riverFraction: 0.09,
    /** Кількість мостів (випадково від min до max) і ширина (світові одиниці; пройде й велика овечка). */
    bridgesMin: 4,
    bridgesMax: 6,
    bridgeWidth: 440,
    /** Мінімальний проміжок між мостами й від країв світу. */
    bridgeGap: 260,
    edgeMargin: 180,
    /** Відступ від лави (від краю), у який не потрапляють їжа, кущі, бонуси, зірки й точки появи. */
    clearMargin: 40,
    /** Швидкість виштовхування захищеної клітини на берег (світових одиниць за с). */
    pushOutSpeed: 420,
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
    /** Мінімальна маса появи (коли живих гравців немає або лідер менший). */
    startMass: 2000,
    /** Поява: маса = маса найкращого ЖИВОГО гравця * leaderSpawnMultiplier (не менше startMass і не більше maxMass). */
    leaderSpawnMultiplier: 1.2,
    /** Стеля маси: лідер * leaderCeilMultiplier, але не вище maxMass (з'їдене зверху пропадає), щоб не захопив арену. */
    leaderCeilMultiplier: 1.6,
    /** Абсолютна стеля маси Вожака (раніше 2600; піднято, щоб він лишався більшим за лідера й коли той виріс). */
    maxMass: 8000,
    /** Як часто (мс) перераховується стеля за поточним лідером. */
    ceilRefreshMs: 1000,
    /** Повідомлення «Вожак з'їв лідера» (один раз усім на арені). */
    leaderEatMessage: { enabled: true },
    /**
     * Розпад: тане лише маса клітини ВИЩЕ decayFromMass і пропорційно цьому надлишку (decayPerSec за секунду),
     * тож маса м'яко сповзає до ~decayFromMass і не обвалюється миттєво; тримається в межах decayFromMass..maxMass.
     */
    decayFromMass: 1800,
    /** Таяння рахується від маси появи: поріг = маса появи * decayFromFraction (замість абсолютного decayFromMass). */
    decayFromFraction: 0.9,
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

  // --- бонуси «особливих» скінів (малі; сервер рахує при вході на арену за обраним скіном, боти їх не мають) ---
  skinPerks: {
    /** 24 «Кришталева»: радіус підбору їжі +10%. */
    24: { foodReach: 0.1 },
    /** 25 «Кактус»: розпад маси на 15% повільніший. */
    25: { decaySlow: 0.15 },
    /** 27 «Лавова»: швидкість +5% (підсумок під maxSpeedHard). */
    27: { speed: 0.05 },
    /** 28 «Галактична»: підібрані бонуси діють на 15% довше. */
    28: { bonusDuration: 0.15 },
    /** 29 «Грозова»: розгін на старті сильніший на 10 п.п. і довший на 3 с. */
    29: { spawnBoostBonus: 0.1, spawnBoostMs: 3000 },
    /** 32 «Осіння»: +8% маси від їжі. */
    32: { foodMass: 0.08 },
    /** 33 «Цукерка»: +10% маси від трави й квітів. */
    33: { grassFlowerMass: 0.1 },
    /** 48 «Медова»: радіус підбору +8% і розпад на 8% повільніший. */
    48: { foodReach: 0.08, decaySlow: 0.08 },
    /** 49 «Небесна»: щит після входу й відродження на 2 с довший. */
    49: { shieldBonusMs: 2000 },
    /** 53 «Ягідна»: «Прискорення» горить на 20% менше. */
    53: { sprintBurnLess: 0.2 },
    /** 54 «Зимова»: заморозка на тобі на 25% коротша. */
    54: { freezeLess: 0.25 },
    /** 55 «Какао»: калюжі «Дощу» уповільнюють удвічі слабше. */
    55: { puddleLess: 0.5 },
  } as Record<number, SkinPerk>,

  // --- артефакти (надягаються поверх скіна, купуються за рубіни, 1 надітий; бонус рахує сервер за надітим) ---
  artifacts: {
    /** Ціна кожного артефакта в рубінах - окремо від цін скінів. */
    price: 350,
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
export type ThornStyle = 'bush' | 'autumn' | 'fir' | 'charred';

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
  /** Вага при випадковому виборі карти арени (рівні ваги - рівна ймовірність). */
  weight: number;
  /** На карті є річка лави (C.lava): геометрія й мости створюються разом з ареною. */
  lava?: boolean;
  /** Карта режиму «Замки»: не бере участі у випадковому виборі звичайної арени. */
  team?: boolean;
}

/**
 * Види карт: арена при створенні випадково (рівноймовірно) бере одну з них. Новий вид = ще один запис тут
 * + палітра з таким id на клієнті (flockMaps.ts).
 */
export const FLOCK_MAPS: readonly FlockMapDef[] = [
  { id: 0, name: 'meadow', layout: 'scatter', thornStyle: 'bush', thorns: {}, weight: 1 },
  { id: 1, name: 'grove', layout: 'scatter', thornStyle: 'autumn', thorns: {}, weight: 1 },
  { id: 2, name: 'frost', layout: 'scatter', thornStyle: 'fir', thorns: {}, weight: 1 },
  { id: 3, name: 'volcano', layout: 'scatter', thornStyle: 'charred', thorns: {}, weight: 1, lava: true },
  /** «Ліс і озеро»: лише режим «Замки» (кущі й річка задаються flock.castles.ts). */
  { id: 4, name: 'lake', layout: 'scatter', thornStyle: 'bush', thorns: {}, weight: 0, team: true },
];

/**
 * Числа для экрана «Про гру» в лобби: уходят клиенту в ответе /flock/me (config.game), чтобы тексты не расходились с игрой.
 * Новое число для описания - дописать сюда и сослаться на него путём из flockInfoData.ts на клиенте.
 */
export function clientGameConfig() {
  const c = FLOCK_CONFIG;
  return {
    bonusDurations: { ...c.bonusDurations },
    lava: { riverFraction: c.lava.riverFraction, bridgesMin: c.lava.bridgesMin, bridgesMax: c.lava.bridgesMax, bridgeWidth: c.lava.bridgeWidth },
    eagle: { zoom: c.eagle.zoom, zoomPct: Math.round((c.eagle.zoom - 1) * 100), viewMultiplier: c.eagle.viewMultiplier, spawnChance: c.eagle.spawnChance },
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
    circle: {
      warmupMs: c.circle.warmupMs,
      stages: c.circle.stages.length,
      outsideLossPerSec: c.circle.outsideLossPerSec,
      outsideMinLossPerSec: c.circle.outsideMinLossPerSec,
      winReward: c.circle.winReward,
      endHoldMs: c.circle.endHoldMs,
      totalMs: c.circle.warmupMs + c.circle.stages.reduce((a, st) => a + st.holdMs + st.shrinkMs, 0) + c.circle.finalHoldMs,
    },
    castles: {
      hp: c.teamMode.castleHp,
      damage: c.teamMode.damagePerStone,
      deliverToWin: Math.ceil(c.teamMode.castleHp / c.teamMode.damagePerStone),
      matchMs: c.teamMode.matchMs,
      minMatchMs: c.teamMode.minMatchMs,
      countdownMs: c.teamMode.countdownMs,
      teamSize: c.teamMode.teamSize,
      maxTeamSize: c.teamMode.maxTeamSize,
      stealHoldMs: c.teamMode.stealHoldMs,
      carrySlowPct: Math.round(c.teamMode.carrySlow * 100),
      waterSlowPct: Math.round(c.teamMode.waterSlow * 100),
      respawnMs: c.teamMode.respawnMs,
      respawnShieldMs: c.teamMode.respawnShieldMs,
      lyingReturnMs: c.teamMode.lyingReturnMs,
      bushRevealRadius: c.teamMode.bushRevealRadius,
      reward: c.teamMode.reward,
      dailyWinLimit: c.teamMode.dailyWinLimit,
      botOnlyRewardLimit: c.teamMode.botOnlyRewardLimit,
      speed: c.teamMode.playerSpeed,
      mass: c.teamMode.playerMass,
      afkMinActions: c.teamMode.afkMinActions,
    },
    monsters: { min: c.monsters.min, max: c.monsters.max, speedPct: Math.round((c.monsters.speedMultiplier - 1) * 100), respawnMs: c.monsters.respawnMs, capHumans6: c.monsters.capByHumans[0]?.[1] ?? c.monsters.max, capFromHumans: c.monsters.capByHumans[0]?.[0] ?? 6, massMin: c.monsters.massMin, massMax: c.monsters.massMax },
    sprint: { ...c.sprint },
    rain: {
      intervalMinMs: c.rain.intervalMinMs,
      intervalMaxMs: c.rain.intervalMaxMs,
      durationMinMs: c.rain.durationMinMs,
      durationMaxMs: c.rain.durationMaxMs,
      puddlesMin: c.rain.puddlesMin,
      puddlesMax: c.rain.puddlesMax,
      slowFraction: c.rain.slowFraction,
      dryMs: c.rain.dryMs,
    },
    pipe: { ...c.pipe, durationMs: c.bonusDurations.pipe },
    wind: {
      intervalMinMs: c.wind.intervalMinMs,
      intervalMaxMs: c.wind.intervalMaxMs,
      durationMinMs: c.wind.durationMinMs,
      durationMaxMs: c.wind.durationMaxMs,
      warnMs: c.wind.warnMs,
      strengthPct: Math.round(c.wind.strength * 100),
    },
    mapRotation: { rotateMin: Math.round(c.mapRotation.rotateMs / 60_000) },
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
      leaderSpawnMultiplier: c.boss.leaderSpawnMultiplier,
      leaderCeilMultiplier: c.boss.leaderCeilMultiplier,
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
      premiumCollectionReward: c.rubies.premiumCollectionReward,
    },
    skinPerks: Object.fromEntries(Object.entries(c.skinPerks).map(([k, v]) => [k, { ...v }])),
    dailyRecords: {
      streakRewards: [...c.dailyRecords.streakRewards],
      streakDays: c.dailyRecords.streakRewards.length,
      streakFirstReward: c.dailyRecords.streakRewards[0],
      streakLastReward: c.dailyRecords.streakRewards[c.dailyRecords.streakRewards.length - 1],
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
      customEnabled: c.phrases.customEnabled,
      customMaxLen: c.phrases.customMaxLen,
      customCooldownMs: c.phrases.customCooldownMs,
      customPerMinute: c.phrases.customPerMinute,
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
 * 36 - «Вожак» (поза вибором), 37-40 нові безкоштовні вовки, 41-46 другий ряд преміум (анімовані). Групи задано явними списками.
 */
export const EXTRA_PAID_FROM = 34;
export const NUM_SKINS = 57;
/** Нові «особливі» скіни в кінці нумерації: 48 «Медова овечка», 49 «Небесна овечка» (47 зарезервовано під MONSTER_SKIN). */
export const NEW_SPECIAL_SKIN_IDS: readonly number[] = [48, 49, 53, 54, 55];
/** Скін «Вожака»: гравець обрати не може, у лобі його нема (номер у діапазоні, але зарезервований). */
export const BOSS_SKIN = 36;
/** Скін «Лавового чудовиська»: поза NUM_SKINS, гравець його вибрати не може (клієнт малює темне створіння з вогняними тріщинами). */
export const MONSTER_SKIN = 47;
/**
 * Скіни «Вожака» за картою арени (поза NUM_SKINS, у лобі й випадкових пулах їх нема; по мережі валідні):
 * 36 - луг (map 0), 50 - гай (1), 51 - мороз (2), 52 - вулкан (3).
 */
export const BOSS_SKINS: readonly number[] = [BOSS_SKIN, 50, 51, 52];
export const isBossSkin = (id: number) => BOSS_SKINS.includes(id);
export const bossSkinForMap = (mapId: number) => BOSS_SKINS[mapId] ?? BOSS_SKIN;
/** Перший номер платних скінів у старій нумерації (лише для зворотної сумісності; безкоштовні - FREE_SKIN_IDS). */
export const FREE_SKINS = FLOCK_CONFIG.rubies.freeSkins;
/**
 * Безкоштовні скіни: явний список. Ботам дістаються лише вони (випадковий з цього списку).
 * Порядок = розкладка лобі: 6 овечок (0-5), ряд вовків (8, 9 і нові 37-40).
 */
export const FREE_SKIN_IDS: readonly number[] = [
  0, 1, 2, 3, 4, 5, 8, 9, 37, 38, 39, 40,
];
/**
 * Зняті безкоштовні скіни (третій ряд лобі): 6 «Ягня», 7 «Баран», 10 «Собака», 11 «Персикова вівця». Нумерація не змінюється,
 * спрайти лишаються в коді, id зарезервовані: не обираються, не купуються й не потрапляють на арену (замість них - скін 0).
 * Дзеркало для клієнта - REMOVED_SKIN_IDS у frontend/src/lib/rubies.ts.
 */
export const REMOVED_SKINS: readonly number[] = [6, 7, 10, 11];
export const isRemovedSkin = (id: number) => REMOVED_SKINS.includes(id);
export const isFreeSkin = (id: number) => FREE_SKIN_IDS.includes(id);
/** Режим «Замки»: безкоштовні скіни сторін (1 - «Вівці», 2 - «Вовки»); платні, особливі й артефакти там вимкнені. */
export const TEAM_SHEEP = 1;
export const TEAM_WOLF = 2;
export const TEAM_FREE_SKINS: Record<number, readonly number[]> = {
  [TEAM_SHEEP]: [0, 1, 2, 3, 4, 5],
  [TEAM_WOLF]: [8, 9, 37, 38, 39, 40],
};
export const teamSkinAllowed = (team: number, skin: number) =>
  (TEAM_FREE_SKINS[team] ?? []).includes(skin) && isFreeSkin(skin);
/** Скін, який гравець узагалі може обрати (не «Вожак», у межах нумерації). */
export const isSelectableSkin = (id: number) =>
  Number.isInteger(id) &&
  id >= 0 &&
  id < NUM_SKINS &&
  id !== MONSTER_SKIN &&
  !isBossSkin(id) &&
  !isRemovedSkin(id);
export const isPaidSkin = (id: number) => isSelectableSkin(id) && !isFreeSkin(id);
/** Преміум-скіни (з анімацією, premiumSkinPrice): явний список. */
export const PREMIUM_SKIN_IDS: readonly number[] = [
  18, 19, 20, 21, 22, 23, 41, 42, 43, 44, 45, 46, 56,
];
export const PREMIUM_FROM = FLOCK_CONFIG.rubies.premiumFrom;
export const SPECIAL_FROM = FLOCK_CONFIG.rubies.specialFrom;
export const isPremiumSkin = (id: number) => PREMIUM_SKIN_IDS.includes(id);
export const isSpecialSkin = (id: number) =>
  (id >= SPECIAL_FROM && id < EXTRA_PAID_FROM) || NEW_SPECIAL_SKIN_IDS.includes(id);
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
 * 24 «Кришталева вівця», 26 «Вівця-грибок» (27 «Лавова вівця» знову в продажу), 30 «Вівця-робот», 31 «Вівця-суші».
 * Нумерація не змінюється; дзеркало для клієнта - HIDDEN_SKIN_IDS у frontend/src/lib/rubies.ts (до завантаження профілю).
 * Покупки на момент зняття (2026-10-24, читання БД): 13 - 1, 23 - 1, 24 - 1, 27 - 2, 31 - 2: спрайти лишаються в коді.
 */
export const HIDDEN_SKINS: readonly number[] = [13, 16, 22, 23, 24, 26, 30, 31];
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

/** Бонус скіна для гравця-людини (боти - undefined). */
export const skinPerkOf = (skin: number): SkinPerk | undefined => FLOCK_CONFIG.skinPerks[skin];

/** Преміум-скіни, що зараз у продажу (колекція для нагороди). */
export const premiumCollectionIds = (): number[] => PREMIUM_SKIN_IDS.filter((id) => !isHiddenSkin(id));
