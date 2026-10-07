import { BIBLE_BOOKS } from './bible-books';
import type { Character } from './character.types';

/** Картка персонажа для клієнта: ім'я, опис і посилання на місця в Біблії (спільна для «Вгадай персонажа» й «Пазлів»). */
export function characterCard(c: Character) {
  return {
    id: c.id,
    name: c.name,
    about: c.about,
    refs: c.refs.map((r) => {
      const book = BIBLE_BOOKS[r.book - 1];
      const tail = `${r.chapter}${r.verses ? `:${r.verses}` : ''}`;
      return {
        book: r.book,
        chapter: r.chapter,
        verses: r.verses ?? null,
        label: {
          ua: `${book.ua} ${tail}`,
          ru: `${book.ru} ${tail}`,
          en: `${book.en} ${tail}`,
        },
      };
    }),
  };
}
