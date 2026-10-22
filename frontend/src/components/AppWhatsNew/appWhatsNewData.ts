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
];

export const APP_WHATS_NEW_TEXT: Record<AppWhatsNewLang, { title: string; ok: string }> = {
  ua: { title: "Що нового", ok: "Зрозуміло" },
  ru: { title: "Что нового", ok: "Понятно" },
  en: { title: "What's new", ok: "Got it" },
};

export const latestAppVersion = (entries: AppWhatsNewEntry[] = APP_WHATS_NEW) =>
  entries.reduce((m, e) => Math.max(m, e.version), 0);
