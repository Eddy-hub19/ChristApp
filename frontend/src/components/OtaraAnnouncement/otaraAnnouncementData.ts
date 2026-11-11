/**
 * Вікно-оголошення про оновлення «Отари» при вході в застосунок. Для НОВОГО оновлення достатньо ДОПИСАТИ запис в кінець
 * `OTARA_ANNOUNCEMENTS`: `version` - ціле, більше за попередню (нова версія знову показує вікно); `gameVersion` - версія «Що нового»
 * самої гри (flockWhatsNewData.ts), яку гравець бачить у лобі: хто її вже бачив, вікно не отримує. Показувати лише те, що вже в main.
 */
export type AnnouncementLang = "ua" | "ru" | "en";
export type AnnouncementText = Record<AnnouncementLang, string>;

/** Іконка пункту (ім'я з components/icons/game). */
export type AnnouncementIcon = "quests" | "arena" | "shield" | "emerald";

export interface OtaraAnnouncement {
  version: number;
  /** Версія «Що нового» гри (flockWhatsNewData.ts), що відповідає цьому оновленню. */
  gameVersion: number;
  /** Куди веде кнопка «Заходь» (шлях без мови). */
  target: string;
  title: AnnouncementText;
  subtitle: AnnouncementText;
  items: { icon: AnnouncementIcon; text: AnnouncementText }[];
}

export const OTARA_ANNOUNCEMENTS: OtaraAnnouncement[] = [
  {
    version: 1,
    gameVersion: 29,
    target: "/games/flock",
    title: { ua: "Оновлення «Отари»!", ru: "Обновление «Отары»!", en: "A new “Flock” update!" },
    subtitle: { ua: "Заходь, бігом дивитися!", ru: "Заходи, скорее смотреть!", en: "Jump in and take a look!" },
    items: [
      {
        icon: "quests",
        text: {
          ua: "Смарагди й щоденні завдання: три завдання на день, нагороди рубінами та смарагдами",
          ru: "Изумруды и ежедневные задания: три задания в день, награды рубинами и изумрудами",
          en: "Emeralds and daily quests: three quests a day, rewarded with rubies and emeralds",
        },
      },
      {
        icon: "arena",
        text: {
          ua: "Нова карта «Арена»: збирай стріли й б’ий тигра разом з іншими вівцями",
          ru: "Новая карта «Арена»: собирай стрелы и бей тигра вместе с другими овцами",
          en: "New “Colosseum” map: collect arrows and take down the tiger together with other sheep",
        },
      },
      {
        icon: "shield",
        text: {
          ua: "Артефакт «Щит»: колючки більше не рвуть твою овечку",
          ru: "Артефакт «Щит»: колючки больше не рвут твою овечку",
          en: "The Shield artifact: thorns no longer pop your sheep",
        },
      },
      {
        icon: "emerald",
        text: {
          ua: "Легендарні скіни за смарагди — скоро в продажу",
          ru: "Легендарные скины за изумруды — скоро в продаже",
          en: "Legendary skins for emeralds — on sale soon",
        },
      },
    ],
  },
];

export const ANNOUNCEMENT_UI: Record<AnnouncementLang, { cta: string; later: string; close: string }> = {
  ua: { cta: "Заходь", later: "Пізніше", close: "Закрити" },
  ru: { cta: "Заходи", later: "Позже", close: "Закрыть" },
  en: { cta: "Let’s go", later: "Later", close: "Close" },
};

export const latestAnnouncement = (list: OtaraAnnouncement[] = OTARA_ANNOUNCEMENTS): OtaraAnnouncement | null =>
  list.reduce<OtaraAnnouncement | null>((m, e) => (!m || e.version > m.version ? e : m), null);
