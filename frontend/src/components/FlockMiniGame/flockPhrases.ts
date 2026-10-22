/**
 * Швидкі фрази «Отари» (хмаринка над овечкою). По мережі йде лише `id`, текст кожен бачить мовою свого інтерфейсу.
 * Нова фраза = ДОПИСАТИ одну запис у кінець `PHRASES` (id - наступне число) і той самий id у
 * `FLOCK_CONFIG.phrases.ids` на сервері (flock.config.ts): без цього сервер її відкине.
 */
export type PhraseLang = "ua" | "ru" | "en";

export interface PhraseDef {
  id: number;
  emoji: string;
  text: Record<PhraseLang, string>;
}

export const PHRASES: readonly PhraseDef[] = [
  { id: 1, emoji: "⭐", text: { ua: "Зорепад був?", ru: "Звездопад был?", en: "Was there a starfall?" } },
  { id: 2, emoji: "🕊️", text: { ua: "Мир?", ru: "Мир?", en: "Truce?" } },
  { id: 3, emoji: "👍", text: { ua: "Так", ru: "Да", en: "Yes" } },
  { id: 4, emoji: "👎", text: { ua: "Ні", ru: "Нет", en: "No" } },
  { id: 5, emoji: "🙏", text: { ua: "Дякую", ru: "Спасибо", en: "Thanks" } },
  { id: 6, emoji: "🆘", text: { ua: "Допоможи!", ru: "Помоги!", en: "Help!" } },
  { id: 7, emoji: "👏", text: { ua: "Гарна гра", ru: "Хорошая игра", en: "Good game" } },
  { id: 8, emoji: "🐺", text: { ua: "Обережно, Вожак!", ru: "Осторожно, Вожак!", en: "Watch out, Alpha!" } },
];

export const phraseById = (id: number): PhraseDef | undefined => PHRASES.find((p) => p.id === id);

export const toPhraseLang = (locale: string): PhraseLang => (locale === "ru" || locale === "en" ? locale : "ua");

/** Скільки (мс) хмаринка наприкінці плавно тане. Тривалість життя задає сервер (flock.config.ts phrases.durationMs, ≤ 30 с). */
export const PHRASE_FADE_MS = 3000;
/** Верхня межа життя хмаринки на клієнті (захист від кривого часу в події): не довше за серверну стелю. */
export const PHRASE_MAX_MS = 30_000;

const HIDE_KEY = "christapp:flock:hidePhrases";

export function loadHidePhrases(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveHidePhrases(v: boolean) {
  try {
    localStorage.setItem(HIDE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}
