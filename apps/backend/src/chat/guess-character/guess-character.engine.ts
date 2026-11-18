import { CHARACTERS, getCharacter } from './data/characters';
import type { Character, Difficulty } from './data/character.types';
import { TRAIT_IDS, type TraitId, type TraitValue } from './data/traits';

export const MAX_QUESTIONS = 10;
export const ROUNDS_PER_MATCH = 4;
export const LEVELS = [1, 2, 3] as const;
export type Level = (typeof LEVELS)[number];
/** Підказка зі списком персонажів, що ще підходять, — лише на легкому рівні. */
export const HINT_LEVEL: Level = 1;

export type HistoryEntry =
  | { kind: 'question'; trait: TraitId; answer: TraitValue }
  | { kind: 'guess'; character: string; correct: boolean };

export function isTraitId(value: unknown): value is TraitId {
  return (
    typeof value === 'string' &&
    (TRAIT_IDS as readonly string[]).includes(value)
  );
}

export function isLevel(value: unknown): value is Level {
  return (
    typeof value === 'number' && (LEVELS as readonly number[]).includes(value)
  );
}

/** Рівень 1 — лише найвідоміші, 2 — до середніх включно, 3 — усі. */
export function poolForLevel(level: Level): Character[] {
  return CHARACTERS.filter((c) => c.difficulty <= (level as Difficulty));
}

/** Відповідь дає таблиця ознак — без участі людини. */
export function answerFor(character: Character, trait: TraitId): TraitValue {
  return character.traits[trait];
}

/** Персонажі пулу, чиї ознаки збігаються з усіма отриманими відповідями. */
export function candidatesFor(
  pool: Character[],
  history: HistoryEntry[],
): Character[] {
  return pool.filter((c) =>
    history.every(
      (h) => h.kind !== 'question' || c.traits[h.trait] === h.answer,
    ),
  );
}

/** Очки за раунд: чим менше спроб (питань і здогадок разом), тим більше; без відгадки — 0. */
export function pointsFor(attempts: number, guessed: boolean): number {
  return guessed ? Math.max(1, MAX_QUESTIONS + 1 - attempts) : 0;
}

export function pickRandom(pool: Character[], rng: () => number): Character {
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

export { getCharacter };
