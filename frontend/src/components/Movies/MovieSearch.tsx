"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryPolicy";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { ApiErrorBody, TmdbMovieSummary, TmdbSearchResponse } from "@/lib/tmdb/types";
import MovieCardSkeleton from "./MovieCardSkeleton";
import MoviePoster from "./MoviePoster";
import styles from "./Movies.module.scss";

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; results: TmdbMovieSummary[] };

async function searchMovies(
  q: string,
  lang: string,
  signal: AbortSignal,
): Promise<TmdbMovieSummary[]> {
  const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&lang=${lang}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(body?.error ?? "Search failed");
  }
  return ((await res.json()) as TmdbSearchResponse).results;
}

export default function MovieSearch() {
  const t = useTranslations("movies");
  const lang = useLocale();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce введення: запит летить, лише коли користувач на мить зупинився.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const term = query.trim();
  const enabled = debounced.length >= MIN_QUERY_LENGTH && term.length >= MIN_QUERY_LENGTH;
  // useQuery скасовує попередній запит (signal) при зміні ключа й кешує відповіді: повтор того самого пошуку миттєвий.
  const search = useQuery({
    queryKey: queryKeys.movies.search(lang, debounced),
    queryFn: ({ signal }) => searchMovies(debounced, lang, signal),
    enabled,
    staleTime: STALE.slow,
    placeholderData: undefined,
  });

  const state: SearchState =
    term.length < MIN_QUERY_LENGTH
      ? { status: "idle" }
      : search.isError
        ? { status: "error", message: search.error instanceof Error ? search.error.message : "Search failed" }
        : search.data && debounced === term
          ? { status: "done", results: search.data }
          : { status: "loading" };

  return (
    <div>
      <label className={styles.searchBox}>
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          maxLength={100}
        />
      </label>

      {state.status === "idle" && <p className={styles.hint}>{t("searchHint")}</p>}
      {state.status === "error" && (
        <p role="alert" className={styles.errorText}>
          {t("searchError")}
        </p>
      )}
      {state.status === "done" && state.results.length === 0 && <p className={styles.hint}>{t("noResults")}</p>}

      {state.status === "loading" && (
        <ul className={styles.grid} aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <MovieCardSkeleton />
            </li>
          ))}
        </ul>
      )}

      {state.status === "done" && state.results.length > 0 && (
        <ul className={styles.grid}>
          {state.results.map((movie) => (
            <li key={movie.id}>
              <Link href={`/movie/${movie.id}`} className={styles.card}>
                <MoviePoster src={tmdbImageUrl(movie.poster_path, "w342")} alt={movie.title} sizes="(max-width: 600px) 45vw, 200px" />
                <span className={styles.cardTitle}>{movie.title}</span>
                <span className={styles.cardYear}>{movie.release_date.slice(0, 4)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
