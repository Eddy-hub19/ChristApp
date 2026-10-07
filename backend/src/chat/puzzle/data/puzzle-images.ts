import imagesJson from './images.json';
import { CHARACTERS } from '../../guess-character/data/characters';

/**
 * Кольорові картини для «Пазлів»: суспільне надбання (Public Domain / PD-Art / CC0) з Wikimedia Commons.
 * Самі файли (WebP ~1600 px) лежать у Cloudinary, папка `christapp/puzzles`; в git — лише `images.json`
 * з посиланнями. Його веде скрипт backend/scripts/puzzle-images/add-commons-image.mjs, який перевіряє
 * ліцензію, розмір і кольоровість за метаданими та пікселями.
 */
export type PuzzleImage = {
  id: string;
  /** id персонажів із «Вгадай персонажа», яких зображено на картині. */
  characterIds: string[];
  /** Посилання на WebP у Cloudinary (`https://res.cloudinary.com/…/christapp/puzzles/…`). */
  url: string;
  cloudinaryId: string;
  width: number;
  height: number;
  title: string;
  author: string;
  year: number;
  /** Як показати дату в підписі, якщо це проміжок («1886–1894»); інакше показуємо `year`. */
  dateLabel?: string;
  /** Колекція/музей, де зберігається оригінал (підпис у фіналі). */
  source: string;
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
