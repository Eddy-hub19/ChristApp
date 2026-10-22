/**
 * Список новшеств «Отари». Для нового обновления достаточно ДОПИСАТЬ одну запись в конец `WHATS_NEW`
 * (version - целое, больше предыдущей). Тексты - одна строка на язык.
 */
export type WhatsNewIcon = "ruby" | "star" | "skins" | "freeze" | "boost" | "names" | "leaf" | "shield" | "trophy" | "scissors";
export type WhatsNewLang = "ua" | "ru" | "en";

export interface WhatsNewItem {
  icon: WhatsNewIcon;
  text: Record<WhatsNewLang, string>;
}

export interface WhatsNewEntry {
  version: number;
  /** YYYY-MM-DD, только для справки. */
  date: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: 1,
    date: "2026-10-18",
    items: [
      {
        icon: "ruby",
        text: {
          ua: "Рубіни: займи 1-е місце з масою 1500 і отримай 10 рубінів",
          ru: "Рубины: займи 1-е место с массой 1500 и получи 10 рубинов",
          en: "Rubies: finish 1st with a mass of 1500 and earn 10 rubies",
        },
      },
      {
        icon: "skins",
        text: {
          ua: "Нові скіни за рубіни: 6 звичайних по 20",
          ru: "Новые скины за рубины: 6 обычных по 20",
          en: "New skins for rubies: 6 regular for 20",
        },
      },
      {
        icon: "freeze",
        text: {
          ua: "Заморожування тепер триває 4 секунди",
          ru: "Заморозка теперь длится 4 секунды",
          en: "Freeze now lasts 4 seconds",
        },
      },
      {
        icon: "boost",
        text: {
          ua: "Розгін на старті: перші 20 секунд овечка бігає швидше",
          ru: "Разгон на старте: первые 20 секунд овечка бегает быстрее",
          en: "Speed boost at spawn: your sheep runs faster for the first 20 seconds",
        },
      },
      {
        icon: "names",
        text: {
          ua: "Нові імена ботів",
          ru: "Новые имена ботов",
          en: "New bot names",
        },
      },
    ],
  },
  {
    version: 2,
    date: "2026-10-19",
    items: [
      {
        icon: "skins",
        text: {
          ua: "6 нових особливих скінів по 40 рубінів: кришталева, кактус, лавова, галактична, грозова і суші",
          ru: "6 новых особенных скинов по 40 рубинов: хрустальная, кактус, лавовая, галактическая, грозовая и суши",
          en: "6 new special skins for 40 rubies each: crystal, cactus, lava, galaxy, storm and sushi",
        },
      },
    ],
  },
  {
    version: 3,
    date: "2026-10-20",
    items: [
      {
        icon: "ruby",
        text: {
          ua: "Рубіни тепер за 1500 маси",
          ru: "Рубины теперь за 1500 массы",
          en: "Rubies are now earned at 1500 mass",
        },
      },
      {
        icon: "star",
        text: {
          ua: "Зорепад: коли хтось досягає 1000, з неба падають зірки",
          ru: "Зорепад: когда кто-то достигает 1000, с неба падают звёзды",
          en: "Starfall: when someone reaches 1000, stars fall from the sky",
        },
      },
      {
        icon: "leaf",
        text: {
          ua: "Більше їжі на карті",
          ru: "Больше еды на карте",
          en: "More food on the map",
        },
      },
    ],
  },
  {
    version: 4,
    date: "2026-10-20",
    items: [
      {
        icon: "scissors",
        text: {
          ua: "Ножиці: стрижуть навколо тебе всіх, у кого більше 500 маси, наполовину",
          ru: "Ножницы: стригут вокруг тебя всех, у кого больше 500 массы, наполовину",
          en: "Scissors: shear everyone around you with more than 500 mass in half",
        },
      },
    ],
  },
  {
    version: 5,
    date: "2026-10-20",
    items: [
      {
        icon: "skins",
        text: {
          ua: "2 нові скіни по 20 рубінів: Сердечна вівця й М'ятна вівця",
          ru: "2 новых скина по 20 рубинов: Сердечная овечка и Мятная овечка",
          en: "2 new skins for 20 rubies each: Heart Sheep and Mint Sheep",
        },
      },
    ],
  },
  {
    version: 6,
    date: "2026-10-22",
    items: [
      {
        icon: "skins",
        text: {
          ua: "Артефакти: 7 предметів поверх скіна по 80 рубінів. Шапка священника, корона, магніт, взуття, годинник, хрест і кадило дають невеликі бонуси",
          ru: "Артефакты: 7 предметов поверх скина по 80 рубинов. Шапка священника, корона, магнит, обувь, часы, крест и кадило дают небольшие бонусы",
          en: "Artifacts: 7 items worn over any skin for 80 rubies each. Priest's hat, crown, magnet, sandals, hourglass, cross and censer give small bonuses",
        },
      },
    ],
  },
  {
    version: 7,
    date: "2026-10-22",
    items: [
      {
        icon: "trophy",
        text: {
          ua: "Вожак: на арені з'являється сильний темний вовк із золотою короною. Він полює на великих, але його можна з'їсти!",
          ru: "Вожак: на арене появляется сильный тёмный волк с золотой короной. Он охотится на крупных, но его можно съесть!",
          en: "The Alpha: a strong dark wolf with a golden crown now roams the arena. It hunts big players, but it can be eaten!",
        },
      },
    ],
  },
  {
    version: 8,
    date: "2026-10-23",
    items: [
      {
        icon: "trophy",
        text: {
          ua: "Рекорди дня: у лобі з'явилась таблиця найбільших овечок за добу. Скидається опівночі за часом Києва",
          ru: "Рекорды дня: в лобби появилась таблица самых больших овечек за сутки. Сбрасывается в полночь по времени Киева",
          en: "Daily records: the lobby now shows the biggest sheep of the day. It resets at midnight Kyiv time",
        },
      },
      {
        icon: "ruby",
        text: {
          ua: "Будь №1 за день три дні поспіль (з масою від 1000) і отримай 20 рубінів",
          ru: "Будь №1 за день три дня подряд (с массой от 1000) и получи 20 рубинов",
          en: "Be #1 of the day three days in a row (mass 1000+) and earn 20 rubies",
        },
      },
    ],
  },
  {
    version: 9,
    date: "2026-10-23",
    items: [
      {
        icon: "names",
        text: {
          ua: "Швидкі фрази: кнопка 💬 зліва внизу (на ПК — клавіша T). Обери готову фразу, і над твоєю овечкою зʼявиться хмаринка. Чужі фрази можна сховати",
          ru: "Быстрые фразы: кнопка 💬 слева внизу (на ПК — клавиша T). Выбери готовую фразу, и над твоей овечкой появится облачко. Чужие фразы можно скрыть",
          en: "Quick phrases: the 💬 button at the bottom left (T key on desktop). Pick a ready-made phrase and a speech bubble appears over your sheep. You can hide others' phrases",
        },
      },
    ],
  },
];

/** Короткие правила для тех, кто заходит в «Отару» впервые. */
export const WELCOME_ITEMS: WhatsNewItem[] = [
  {
    icon: "leaf",
    text: {
      ua: "Їж траву і тих, хто менший за тебе, щоб рости",
      ru: "Ешь траву и тех, кто меньше тебя, чтобы расти",
      en: "Eat grass and anyone smaller than you to grow",
    },
  },
  {
    icon: "shield",
    text: {
      ua: "Не дай себе з'їсти тим, хто більший",
      ru: "Не дай себя съесть тем, кто больше",
      en: "Don't let bigger players eat you",
    },
  },
  {
    icon: "trophy",
    text: {
      ua: "Займи 1-ше місце і отримай рубіни",
      ru: "Займи 1-е место и получи рубины",
      en: "Take 1st place and earn rubies",
    },
  },
];
