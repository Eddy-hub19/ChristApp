/**
 * Посилання з картки персонажа на місце в читалці Біблії. `book` — номер книги за каноном
 * (1 = Буття … 66 = Одкровення), як і в `backend/.../data/bible-books.ts`.
 * Читалка бере книгу за id з Bible API (`/bible/[book]?chapter=&verse=`).
 */
export function bibleHref(ref: { book: number; chapter: number; verses: string | null }): string {
  const params = new URLSearchParams({ chapter: String(ref.chapter) });
  const firstVerse = ref.verses?.match(/\d+/)?.[0];
  if (firstVerse) params.set("verse", firstVerse);
  return `/bible/${ref.book}?${params.toString()}`;
}
