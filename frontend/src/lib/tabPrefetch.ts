import type { QueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { BIBLE_LAST_READ_STORAGE_KEY } from "@/lib/bibleReadingProgress";
import {
  bibleBooksQueryKey,
  bibleChapterTextQueryKey,
  bibleChaptersQueryKey,
  bibleStaticQueryOptions,
  bibleTranslationsQueryKey,
  fetchBibleBooksForQuery,
  fetchBibleChapterTextForQuery,
  fetchBibleChaptersForQuery,
  fetchBibleTranslationsForQuery,
  type BibleTranslationItem,
} from "@/lib/queries/bibleQueries";
import {
  getAppLangFromWindow,
  pickTranslationShortName,
} from "@/lib/bibleTranslationForLang";
import { getUserIdFromJwt } from "@/lib/jwtUser";
import {
  fetchPushStatusForQuery,
  pushStatusQueryKey,
  unreadSummaryQueryOptions,
} from "@/lib/queries/pushQueries";
import { STALE } from "@/lib/queryPolicy";
import { watchRoomsQueryOptions } from "@/lib/queries/watchRoomsQueries";
import {
  fetchSavedVersesForQuery,
  savedVersesQueryKey,
} from "@/lib/queries/versesQueries";
import { usersDirectoryQueryOptions } from "@/lib/queries/usersQueries";

/**
 * Дані першого екрана — одразу й паралельно (не чекаючи /auth/me, а потім по черзі): ключі спільні з useQuery,
 * тож запити, що вже летять, не дублюються, а свіжий кеш не перезапитується.
 */
export function prefetchAppEntryData(queryClient: QueryClient) {
  const token = getAuthToken();
  if (!token) return;
  const userId = getUserIdFromJwt(token);

  void queryClient.prefetchQuery(unreadSummaryQueryOptions(userId));
  void queryClient.prefetchQuery(usersDirectoryQueryOptions());
  void queryClient.prefetchQuery(watchRoomsQueryOptions(userId));
}

/** Prefetch при наведенні на таб «Чат». */
export function prefetchTabChatData(queryClient: QueryClient) {
  const token = getAuthToken();
  if (!token) return;

  const userId = getUserIdFromJwt(token);

  void queryClient.prefetchQuery(unreadSummaryQueryOptions(userId));
  void queryClient.prefetchQuery(usersDirectoryQueryOptions());
}

/** Prefetch при наведенні на таб «Кіношка»: список залів і запрошень. */
export function prefetchTabCinemaData(queryClient: QueryClient) {
  const token = getAuthToken();
  if (!token) return;

  void queryClient.prefetchQuery(watchRoomsQueryOptions(getUserIdFromJwt(token)));
}

/** Prefetch при наведенні на таб «Профіль». */
export function prefetchTabProfileData(queryClient: QueryClient) {
  const token = getAuthToken();
  if (!token) return;

  const userId = getUserIdFromJwt(token);

  void queryClient.prefetchQuery({
    queryKey: pushStatusQueryKey(userId),
    queryFn: fetchPushStatusForQuery,
    staleTime: STALE.slow,
  });

  void queryClient.prefetchQuery({
    queryKey: savedVersesQueryKey(),
    queryFn: fetchSavedVersesForQuery,
    staleTime: STALE.slow,
  });
}

/**
 * Prefetch Біблії до переходу на таб: переклади, список книг, список глав і текст глави
 * (ключи совпадают с BibleReader / bibleQueries).
 */
export function prefetchTabBibleData(
  queryClient: QueryClient,
  langHint?: string,
) {
  if (typeof window === "undefined") return;

  const lang = langHint ?? getAppLangFromWindow();

  void queryClient
    .prefetchQuery({
      queryKey: bibleTranslationsQueryKey,
      queryFn: fetchBibleTranslationsForQuery,
      ...bibleStaticQueryOptions,
    })
    .then(() => {
      const translations =
        (queryClient.getQueryData(bibleTranslationsQueryKey) as
          | BibleTranslationItem[]
          | undefined) ?? [];
      const translation = pickTranslationShortName(translations, lang);

      return queryClient
        .prefetchQuery({
          queryKey: bibleBooksQueryKey(translation),
          queryFn: () => fetchBibleBooksForQuery(translation),
          ...bibleStaticQueryOptions,
        })
        .then(() => {
          let bookId: string | undefined;
          let chapter = 1;
          try {
            const raw = window.localStorage.getItem(
              BIBLE_LAST_READ_STORAGE_KEY,
            );
            const parsed = raw
              ? (JSON.parse(raw) as { bookId?: string; chapter?: number })
              : null;
            if (parsed?.bookId) {
              bookId = parsed.bookId;
              chapter = Number(parsed.chapter) || 1;
            }
          } catch {
            // ігноруємо невалідний JSON
          }

          const books = queryClient.getQueryData<Array<{ id: string }>>(
            bibleBooksQueryKey(translation),
          );
          if (!bookId && books?.[0]?.id) {
            bookId = books[0].id;
            chapter = 1;
          }
          if (!bookId) return;

          void queryClient.prefetchQuery({
            queryKey: bibleChaptersQueryKey(translation, bookId),
            queryFn: () => fetchBibleChaptersForQuery(translation, bookId!),
            ...bibleStaticQueryOptions,
          });

          void queryClient.prefetchQuery({
            queryKey: bibleChapterTextQueryKey(translation, bookId, chapter),
            queryFn: () =>
              fetchBibleChapterTextForQuery(translation, bookId, chapter),
            ...bibleStaticQueryOptions,
          });
        });
    });
}
