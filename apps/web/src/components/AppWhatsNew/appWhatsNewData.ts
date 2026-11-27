/**
 * Новшества приложения (не игр). Для нового обновления достаточно ДОПИСАТЬ запись в конец `APP_WHATS_NEW`
 * (version - целое, больше предыдущей). Иконка `icon` (эмодзи) - по смыслу строки. Тексты - минимально: «Добавлены звонки», «Добавлена новая карта» (одна короткая строка на язык, без подробностей). Только то, что изменилось по виду и что добавилось; админку, исправления ошибок и внутреннее не пишем.
 */
export type AppWhatsNewLang = "ua" | "ru" | "en";

/** Одна строка обновления: тексты на трёх языках и иконка-эмодзи (необязательна: без неё показывается DEFAULT_ICON). */
export type AppWhatsNewItem = Record<AppWhatsNewLang, string> & { icon?: string };

export const DEFAULT_ICON = "✨";

export interface AppWhatsNewEntry {
  version: number;
  /** YYYY-MM-DD, только для справки. */
  date: string;
  items: AppWhatsNewItem[];
}

export const APP_WHATS_NEW: AppWhatsNewEntry[] = [
  {
    version: 1,
    date: "2026-10-22",
    items: [
      { icon: "💬", ua: "Стилі повідомлень", ru: "Стили сообщений", en: "Message styles" },
    ],
  },
  {
    version: 2,
    date: "2026-11-18",
    items: [
      { icon: "🌐", ua: "Новий сайт і домен", ru: "Новый сайт и домен", en: "New site and domain" },
    ],
  },
  {
    version: 3,
    date: "2026-11-19",
    items: [
      { icon: "🎨", ua: "Новий дизайн", ru: "Новый дизайн", en: "New design" },
      { icon: "🌲", ua: "Фон «Зелений ліс» за замовчуванням", ru: "Фон «Зелёный лес» по умолчанию", en: "“Green forest” default background" },
      { icon: "☀️", ua: "Світла тема для фонів", ru: "Светлая тема для фонов", en: "Light theme for backgrounds" },
      { icon: "🖼️", ua: "Нова заставка", ru: "Новая заставка", en: "New splash screen" },
    ],
  },
  {
    version: 5,
    date: "2026-11-21",
    items: [
      { icon: "📌", ua: "Закріплені повідомлення", ru: "Закреплённые сообщения", en: "Pinned messages" },
      { icon: "😍", ua: "Нові реакції", ru: "Новые реакции", en: "New reactions" },
      { icon: "✅", ua: "Галочки прочитання у списку чатів", ru: "Галочки прочтения в списке чатов", en: "Read ticks in the chat list" },
      { icon: "🏷️", ua: "Стікери без бульбашки", ru: "Стикеры без пузыря", en: "Stickers without a bubble" },
      { icon: "🥈", ua: "Срібний роздільник «Нещодавні»", ru: "Серебряный разделитель «Недавние»", en: "Silver “Recent” divider" },
    ],
  },
  {
    version: 6,
    date: "2026-11-21",
    items: [
      { icon: "🍭", ua: "Додано нову карту «Цукеркова країна»", ru: "Добавлена новая карта «Конфетная страна»", en: "Added the new “Candy Land” map" },
      { icon: "🍫", ua: "Шоколадна ріка і печеньки", ru: "Шоколадная река и печеньки", en: "Chocolate river and cookies" },
      { icon: "🌧️", ua: "Цукерковий дощ", ru: "Конфетный дождь", en: "Candy rain" },
      { icon: "🌊", ua: "Ріка виносить за край карти", ru: "Реку выносит за край карты", en: "The river carries cells off the map" },
      { icon: "📍", ua: "Вожака виділено на мінікарті", ru: "Вожак выделен на миникарте", en: "Boss is highlighted on the minimap" },
    ],
  },
  {
    version: 7,
    date: "2026-11-21",
    items: [
      { icon: "📞", ua: "Додано дзвінки", ru: "Добавлены звонки", en: "Added calls" },
      { icon: "🔔", ua: "Мелодії та push про дзвінки", ru: "Мелодии и push о звонках", en: "Ringtones and call push" },
      { icon: "📵", ua: "Пропущені дзвінки в чаті", ru: "Пропущенные звонки в чате", en: "Missed calls in chat" },
      { icon: "⚙️", ua: "Налаштування дзвінків у профілі", ru: "Настройки звонков в профиле", en: "Call settings in Profile" },
      { icon: "📋", ua: "Список оновлень", ru: "Список обновлений", en: "Updates list" },
    ],
  },
  {
    version: 8,
    date: "2026-11-21",
    items: [
      { icon: "🎁", ua: "Бонуси в Отарі більші", ru: "Бонусы в Отаре крупнее", en: "Bigger bonuses in Flock" },
    ],
  },
  {
    version: 9,
    date: "2026-11-22",
    items: [
      { icon: "🏝️", ua: "Додано нову карту «Острів скарбів»", ru: "Добавлена новая карта «Остров сокровищ»", en: "Added the new “Treasure Island” map" },
    ],
  },
  {
    version: 10,
    date: "2026-11-22",
    items: [
      { icon: "☁️", ua: "«Замки»: нова карта «Небесні тераси», 8 на 8", ru: "«Замки»: новая карта «Небесные террасы», 8 на 8", en: "“Castles”: new map “Sky Terraces”, 8 vs 8" },
    ],
  },
  {
    version: 11,
    date: "2026-11-24",
    items: [
      { icon: "🏛️", ua: "«Замки»: нова карта «Затонулі руїни»", ru: "«Замки»: новая карта «Затонувшие руины»", en: "“Castles”: new map “Sunken Ruins”" },
    ],
  },
];

/** С этой даты идёт «новый сайт»: при первом запуске один раз показываем все записи с неё (INTRO_VERSION и новее окно не открывает). */
export const MIGRATION_DATE = "2026-11-18";
/** Последняя версия, вошедшая в стартовое окно. Новые записи (больше) видны только в списке обновлений, окно из-за них не всплывает. */
export const INTRO_VERSION = 7;

export const APP_WHATS_NEW_TEXT: Record<AppWhatsNewLang, { title: string; ok: string; introTitle: string; listTitle: string; open: string; close: string }> = {
  ua: { title: "Що нового", ok: "Зрозуміло", introTitle: "Що змінилося на новому сайті", listTitle: "Оновлення", open: "Оновлення", close: "Закрити" },
  ru: { title: "Что нового", ok: "Понятно", introTitle: "Что изменилось на новом сайте", listTitle: "Обновления", open: "Обновления", close: "Закрыть" },
  en: { title: "What's new", ok: "Got it", introTitle: "What changed on the new site", listTitle: "Updates", open: "Updates", close: "Close" },
};

export const latestAppVersion = (entries: AppWhatsNewEntry[] = APP_WHATS_NEW) =>
  entries.reduce((m, e) => Math.max(m, e.version), 0);
