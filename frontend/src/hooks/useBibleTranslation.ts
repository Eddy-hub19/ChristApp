"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  bibleBooksQueryKey,
  bibleStaticQueryOptions,
  bibleTranslationsQueryKey,
  fetchBibleBooksForQuery,
  fetchBibleTranslationsForQuery,
  type BibleTranslationItem,
} from "@/lib/queries/bibleQueries";
import { pickTranslationShortName } from "@/lib/bibleTranslationForLang";

export type BibleBookItem = { id: string; bookid?: number; name: string; chapters: number };

/** Переклад за мовою інтерфейсу + список книг цього перекладу (кеш React Query спільний із читалкою). */
export function useBibleTranslation() {
  const lang = useLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: translations = [], isFetched: translationsFetched } = useQuery({
    queryKey: bibleTranslationsQueryKey,
    queryFn: fetchBibleTranslationsForQuery,
    enabled: mounted,
    ...bibleStaticQueryOptions,
  });

  const translation = pickTranslationShortName(
    translations as BibleTranslationItem[],
    lang,
  );

  const { data: books = [], isLoading: booksLoading } = useQuery({
    queryKey: bibleBooksQueryKey(translation),
    queryFn: () => fetchBibleBooksForQuery(translation) as Promise<BibleBookItem[]>,
    enabled: mounted && translationsFetched && Boolean(translation),
    ...bibleStaticQueryOptions,
  });

  /** Поки список перекладів не прийшов, `translation` — лише запасний код; запити на ньому не робимо. */
  const ready = mounted && translationsFetched;

  return { lang, translation, ready, books: books as BibleBookItem[], booksLoading };
}
