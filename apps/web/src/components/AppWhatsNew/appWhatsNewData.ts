/**
 * Новшества приложения (не игр). Для нового обновления достаточно ДОПИСАТЬ запись в конец `APP_WHATS_NEW`
 * (version - целое, больше предыдущей). Тексты - одна строка на язык.
 */
export type AppWhatsNewLang = "ua" | "ru" | "en";

export interface AppWhatsNewEntry {
  version: number;
  /** YYYY-MM-DD, только для справки. */
  date: string;
  items: Record<AppWhatsNewLang, string>[];
}

export const APP_WHATS_NEW: AppWhatsNewEntry[] = [
  {
    version: 1,
    date: "2026-10-22",
    items: [
      {
        ua: "Стилі повідомлень: у профілі в розділі «Вигляд повідомлень» обери свій стиль бульбашок — Агнєць, Голуб миру, Лев Юди або Виноградна лоза. Інші люди бачитимуть його у чаті; чужі стилі можна вимкнути там само.",
        ru: "Стили сообщений: в профиле в разделе «Вид сообщений» выбери свой стиль пузырей — Агнец, Голубь мира, Лев Иуды или Виноградная лоза. Другие люди увидят его в чате; чужие стили можно отключить там же.",
        en: "Message styles: pick your bubble style in Profile under “Message appearance” — Lamb, Dove of peace, Lion of Judah or Grapevine. Others will see it in chat; you can turn off other people's styles there too.",
      },
    ],
  },
  {
    version: 2,
    date: "2026-11-18",
    items: [
      { ua: "Новий сайт і новий домен: публічна сторінка, новий екран входу, повідомлення про переїзд", ru: "Новый сайт и новый домен: публичная страница, новый экран входа, уведомление о переезде", en: "New site and domain: public landing page, new sign-in screen, migration notice" },
      { ua: "Адмінка: розсилка push-сповіщень усім користувачам", ru: "Админка: рассылка push-уведомлений всем пользователям", en: "Admin: push notification broadcast to all users" },
    ],
  },
  {
    version: 3,
    date: "2026-11-19",
    items: [
      { ua: "Новий дизайн (v2): «Зелений ліс» — фон застосунку за замовчуванням", ru: "Новый дизайн (v2): «Зелёный лес» — фон приложения по умолчанию", en: "New design (v2): “Green forest” is the default app background" },
      { ua: "Картки «Отара» і «Кіношка» у списку чатів перероблено", ru: "Карточки «Отара» и «Киношка» в списке чатов переделаны", en: "“Flock” and “Cinema” cards in the chat list redesigned" },
      { ua: "Поверхні й поля вводу підлаштовуються під обраний фон", ru: "Поверхности и поля ввода подстраиваются под выбранный фон", en: "Surfaces and input fields follow the chosen background" },
      { ua: "Світла тема для фонів «Ліс», «Ніч» і «Пустеля»", ru: "Светлая тема для фонов «Лес», «Ночь» и «Пустыня»", en: "Light theme for the Forest, Night and Desert backgrounds" },
      { ua: "Екран вибору фону чату показує лише фони застосунку з профілю", ru: "Экран выбора фона чата показывает только фоны приложения из профиля", en: "Chat background screen shows only the app backgrounds from the profile" },
      { ua: "Заставка PWA: зелений фон з овечкою, кеш iOS скинуто", ru: "Заставка PWA: зелёный фон с овечкой, кэш iOS сброшен", en: "PWA splash: green backdrop with the sheep, iOS cache reset" },
      { ua: "Фото профілю заповнює весь круг; при помилці завантаження аватара показується справжня причина", ru: "Фото профиля заполняет весь круг; при ошибке загрузки аватара показывается реальная причина", en: "Profile photo fills the whole circle; a failed avatar upload shows the real reason" },
    ],
  },
  {
    version: 4,
    date: "2026-11-20",
    items: [
      { ua: "«Новий чат»: суцільна підкладка за списком людей", ru: "«Новый чат»: сплошная подложка за списком людей", en: "“New chat”: solid backdrop behind the people list" },
    ],
  },
  {
    version: 5,
    date: "2026-11-21",
    items: [
      { ua: "Список чатів: у аватарок більше не обрізається лівий край на сенсорних екранах", ru: "Список чатов: у аватарок больше не обрезается левый край на сенсорных экранах", en: "Chat list: avatars no longer lose their left edge on touch screens" },
      { ua: "Запуск PWA без білого спалаху: заставка з овечкою завантажується заздалегідь", ru: "Запуск PWA без белой вспышки: заставка с овечкой подгружается заранее", en: "PWA launch without a white flash: the splash sheep is preloaded" },
      { ua: "Шапка чату показує лише імʼя; кнопка стікерів вирівняна з іконками вводу; стікери надсилаються без бульбашки", ru: "Шапка чата показывает только имя; кнопка стикеров выровнена с иконками ввода; стикеры отправляются без пузыря", en: "Chat header shows only the name; sticker button aligned with the composer icons; stickers are sent without a bubble" },
      { ua: "Позначка «прочитано» зберігається після виходу з чату, перезапуску й перепідключення", ru: "Отметка «прочитано» сохраняется после выхода из чата, перезапуска и переподключения", en: "The “seen” mark survives leaving the chat, restarts and reconnects" },
      { ua: "Галочки прочитання біля мого останнього повідомлення у списку чатів", ru: "Галочки прочтения у моего последнего сообщения в списке чатов", en: "Read ticks next to my last message in the chat list" },
      { ua: "Закріплені повідомлення: до 3 у чаті, смуга над стрічкою", ru: "Закреплённые сообщения: до 3 в чате, плашка над лентой", en: "Pinned messages: up to 3 per chat, with a bar above the list" },
      { ua: "Реакції: швидкий ряд із 6 нещодавніх емодзі, повний вибір, компактне групування", ru: "Реакции: быстрый ряд из 6 недавних эмодзи, полный выбор, компактная группировка", en: "Reactions: quick row of 6 recent emoji, full picker, compact grouping" },
      { ua: "Прибрано виділення тексту по всій сторінці (синє підсвічування й системне меню)", ru: "Убрано выделение текста по всей странице (синяя подсветка и системное меню)", en: "Removed page-wide text selection (blue highlight and the system callout)" },
      { ua: "Картки у списку чатів: «Грати в Отару» (англ.), запрошення тим, хто повернувся, на нову карту, «Дивитися разом»", ru: "Карточки в списке чатов: «Играть в Отару» (англ.), приглашение вернувшимся на новую карту, «Смотреть вместе»", en: "Chat list cards: “Play Flock” in English, returning players are invited to the new map, “Watch together”" },
      { ua: "Запрошення в Отару в чаті: картка з овечкою-геймером на зеленій панелі", ru: "Приглашение в Отару в чате: карточка с овечкой-геймером на зелёной панели", en: "Flock invite in chat: a card with the gamer lamb on a green panel" },
      { ua: "«Нещодавні» у списку чатів: тонкий срібний роздільник", ru: "«Недавние» в списке чатов: тонкий серебряный разделитель", en: "“Recent” in the chat list: a thin silver divider" },
    ],
  },
  {
    version: 6,
    date: "2026-11-21",
    items: [
      { ua: "Отара, карта «Цукеркова країна»: карамельні калюжі сповільнюють на 30%, липка карамель на 45%, мармеладні кущі ховають меншу клітину", ru: "Отара, карта «Конфетная страна»: карамельные лужи замедляют на 30%, липкая карамель на 45%, мармеладные кусты прячут меньшую клетку", en: "Flock, “Candy Land” map: caramel puddles slow you by 30%, sticky caramel by 45%, jelly bushes hide a smaller cell" },
      { ua: "«Цукеркова країна»: шоколадна ріка зносить овечок, на плавучих печеньках течії нема", ru: "«Конфетная страна»: шоколадная река сносит овечек, на плавающих печеньках течения нет", en: "“Candy Land”: a chocolate river carries sheep away, floating cookies are free of the current" },
      { ua: "«Цукеркова країна»: раз на 10 хвилин цукерковий дощ замість зорепаду — місця падіння підсвічуються за 3 с, удар розкидає овечок", ru: "«Конфетная страна»: раз в 10 минут конфетный дождь вместо звездопада — места падения подсвечиваются за 3 с, удар разбрасывает овечек", en: "“Candy Land”: a candy rain every 10 minutes instead of the star fall — landing spots light up 3 s ahead, the impact scatters sheep" },
      { ua: "«Цукеркова країна»: біля краю світу, де ріка виходить з карти, нема загорожі — винесені за межу овечки гинуть", ru: "«Конфетная страна»: у края мира, где река выходит из карты, нет забора — унесённые за границу овечки гибнут", en: "“Candy Land”: no fence where the river leaves the map — sheep swept past the edge die" },
      { ua: "Отара: Вожак на мінікарті отримав свій колір, а імʼя — кольорову обвідку", ru: "Отара: Вожак на миникарте получил свой цвет, а имя — цветную обводку", en: "Flock: the boss has its own colour on the minimap and a coloured outline on its name" },
    ],
  },
  {
    version: 7,
    date: "2026-11-21",
    items: [
      { ua: "Дзвінки: мелодія гудка й вхідного дзвінка, екран вхідного на будь-якій сторінці застосунку", ru: "Звонки: мелодия гудка и входящего звонка, экран входящего на любой странице приложения", en: "Calls: ringback and ringtone melodies, the incoming-call screen on any page of the app" },
      { ua: "Дзвінки: push «дзвонить вам» з кнопками «Відповісти» і «Відхилити», повтори, скасування, push про пропущений", ru: "Звонки: push «звонит вам» с кнопками «Ответить» и «Отклонить», повторы, отмена, push о пропущенном", en: "Calls: “is calling you” push with Answer and Decline, repeats, cancel, missed-call push" },
      { ua: "Пропущений дзвінок записується в чат системним рядком; у профілі перемикачі «Дзвінки» і «Звук дзвінка»", ru: "Пропущенный звонок записывается в чат системной строкой; в профиле переключатели «Звонки» и «Звук звонка»", en: "A missed call is logged in the chat as a system line; Profile has “Calls” and “Call sound” switches" },
      { ua: "Список оновлень: значок у шапці списку чатів поруч із кнопкою адмінки", ru: "Список обновлений: значок в шапке списка чатов рядом с кнопкой админки", en: "Updates list: an icon in the chat list header next to the admin button" },
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
