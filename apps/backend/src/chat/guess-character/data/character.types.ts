import type { TraitId, TraitValue } from './traits';

export type Lang = 'ua' | 'ru' | 'en';
export type Localized = Record<Lang, string>;

/** Місце в Біблії; `book` — номер за каноном (1 = Буття … 66 = Одкровення). */
export type BibleRef = { book: number; chapter: number; verses?: string };

/** 1 — найвідоміші, 2 — середні, 3 — менш відомі. */
export type Difficulty = 1 | 2 | 3;

/**
 * Запис персонажа у файлах даних. Щоб не писати 44 значення вручну, `yes` — ознаки «так»,
 * `unknown` — «невідомо з Біблії», усі решта — «ні». Повну таблицю збирає `resolveCharacter`,
 * а `data.spec.ts` перевіряє, що ідентифікатори існують і не повторюються.
 *
 * Правило відповідей: «ні» — Біблія про це не розповідає (або заперечує); «невідомо» —
 * лише там, де однозначної відповіді немає (спірно, залежить від тлумачення).
 */
export type CharacterDef = {
  id: string;
  difficulty: Difficulty;
  name: Localized;
  about: Localized;
  refs: BibleRef[];
  yes: readonly TraitId[];
  unknown?: readonly TraitId[];
};

export type Character = Omit<CharacterDef, 'yes' | 'unknown'> & {
  traits: Record<TraitId, TraitValue>;
};
