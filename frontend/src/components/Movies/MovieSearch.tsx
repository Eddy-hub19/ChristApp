"use client";

import { useEffect, useState } from "react";
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

export default function MovieSearch() {
  const t = useTranslations("movies");
  const lang = useLocale();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });

  // Пошук «на льоту» з debounce; попередній запит скасовується, щоб стара відповідь не перезаписала нову
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&lang=${lang}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
          throw new Error(body?.error ?? "Search failed");
        }
        const data = (await res.json()) as TmdbSearchResponse;
        setState({ status: "done", results: data.results });
      } catch (e) {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: e instanceof Error ? e.message : "Search failed" });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, lang]);

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
