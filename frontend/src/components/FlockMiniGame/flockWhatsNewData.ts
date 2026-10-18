/**
 * Список новшеств «Отари». Для нового обновления достаточно ДОПИСАТЬ одну запись в конец `WHATS_NEW`
 * (version - целое, больше предыдущей). Тексты - одна строка на язык.
 */
export type WhatsNewIcon = "ruby" | "skins" | "freeze" | "boost" | "names" | "leaf" | "shield" | "trophy";
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
          ua: "Рубіни: займи 1-е місце з масою 3000 і отримай 10 рубінів",
          ru: "Рубины: займи 1-е место с массой 3000 и получи 10 рубинов",
          en: "Rubies: finish 1st with a mass of 3000 and earn 10 rubies",
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
          ua: "8 нових особливих скінів по 40 рубінів: кришталева, кактус, грибок, лавова, галактична, грозова, робот і суші",
          ru: "8 новых особенных скинов по 40 рубинов: хрустальная, кактус, грибок, лавовая, галактическая, грозовая, робот и суши",
          en: "8 new special skins for 40 rubies each: crystal, cactus, mushroom, lava, galaxy, storm, robot and sushi",
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
