import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import MovieEmbedPlayer from "@/components/Movies/MovieEmbedPlayer";
import MoviePoster from "@/components/Movies/MoviePoster";
import { TmdbError, getMovieDetails } from "@/lib/server/tmdb";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { tmdbLanguage } from "@/lib/tmdb/locale";
import type { TmdbMovieDetails } from "@/lib/tmdb/types";
import styles from "@/components/Movies/Movies.module.scss";

interface PageProps {
  params: Promise<{ lang: string; id: string }>;
}

/** `/movie/abc` або `/movie/-1` — це 404, а не запит до TMDB. */
function parseMovieId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

/** 404 від TMDB → `notFound()`; решта помилок піднімаються до `error.tsx`. */
async function loadMovie(id: number, lang: string): Promise<TmdbMovieDetails> {
  try {
    return await getMovieDetails(id, tmdbLanguage(lang));
  } catch (e) {
    if (e instanceof TmdbError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang, id } = await params;
  const movieId = parseMovieId(id);
  if (movieId === null) return {};
  try {
    const movie = await getMovieDetails(movieId, tmdbLanguage(lang));
    return { title: movie.title, description: movie.overview || undefined };
  } catch {
    return {};
  }
}

export default async function MoviePage({ params }: PageProps) {
  const { lang, id } = await params;
  const movieId = parseMovieId(id);
  if (movieId === null) notFound();

  const [movie, t] = await Promise.all([loadMovie(movieId, lang), getTranslations("movies")]);
  const year = movie.release_date.slice(0, 4);

  return (
    <article className={styles.page}>
      <Link href="/movie" className={styles.backLink}>
        ← {t("backToSearch")}
      </Link>

      <MovieEmbedPlayer key={movie.id} tmdbId={movie.id} imdbId={movie.imdb_id} title={movie.title} />

      <div className={styles.details}>
        <div className={styles.detailsPoster}>
          <MoviePoster src={tmdbImageUrl(movie.poster_path, "w500")} alt={movie.title} sizes="(max-width: 600px) 40vw, 240px" priority />
        </div>
        <div className={styles.detailsText}>
          <h1 className={styles.movieTitle}>
            {movie.title} {year && <span className={styles.cardYear}>({year})</span>}
          </h1>
          {movie.tagline && <p className={styles.tagline}>{movie.tagline}</p>}
          <ul className={styles.meta}>
            {movie.vote_count > 0 && (
              <li>
                <Star size={14} aria-hidden /> {movie.vote_average.toFixed(1)}
              </li>
            )}
            {movie.runtime ? <li>{t("minutes", { count: movie.runtime })}</li> : null}
            {movie.genres.map((g) => (
              <li key={g.id}>{g.name}</li>
            ))}
          </ul>
          <p className={styles.overview}>{movie.overview || t("noOverview")}</p>
        </div>
      </div>
    </article>
  );
}
