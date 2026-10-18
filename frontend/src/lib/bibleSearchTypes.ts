export type BibleSearchHit = {
  bookId: string;
  chapter: number;
  verse: number;
  /** Чистий текст вірша (без HTML). */
  text: string;
};

export type BibleSearchScope = "all" | "ot" | "nt" | (string & {});

export type BibleSearchResponse = {
  /** Скільки віршів у поточному фільтрі. */
  total: number;
  /** Скільки всього (без фільтра) — для лічильників і порожніх фільтрів. */
  totalAll: number;
  /** Кількість збігів за книгами (без фільтра). */
  facets: Record<string, number>;
  results: BibleSearchHit[];
  nextOffset: number | null;
};
