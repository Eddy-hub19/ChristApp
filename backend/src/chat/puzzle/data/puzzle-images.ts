import imagesJson from './images.json';
import { CHARACTERS } from '../../guess-character/data/characters';

/**
 * Картини для «Пазлів»: суспільне надбання (Public Domain / CC0) з Wikimedia Commons.
 * Файли лежать у frontend/public/puzzles/ (WebP ~1600 px), а `images.json` ведеться скриптом
 * backend/scripts/puzzle-images/add-commons-image.mjs, який перевіряє ліцензію в метаданих Commons.
 */
export type PuzzleImage = {
  id: string;
  /** id персонажів із «Вгадай персонажа», яких зображено на картині. */
  characterIds: string[];
  /** Шлях до файла на фронтенді, напр. `/puzzles/abraham-1-….webp`. */
  file: string;
  width: number;
  height: number;
  title: string;
  author: string;
  year: number;
  license: string;
  licenseUrl: string | null;
  commonsTitle: string;
  sourceUrl: string;
};

export const PUZZLE_IMAGES: PuzzleImage[] = (
  imagesJson as { images: PuzzleImage[] }
).images;

export function getPuzzleImage(id: unknown): PuzzleImage | undefined {
  return typeof id === 'string'
    ? PUZZLE_IMAGES.find((image) => image.id === id)
    : undefined;
}

export function imagesOfCharacter(characterId: string): PuzzleImage[] {
  return PUZZLE_IMAGES.filter((image) =>
    image.characterIds.includes(characterId),
  );
}

/** Персонажі, для яких є хоча б одна картина (лише вони доступні для вибору «За ім'ям»). */
export function charactersWithImages() {
  return CHARACTERS.filter((c) => imagesOfCharacter(c.id).length > 0);
}
