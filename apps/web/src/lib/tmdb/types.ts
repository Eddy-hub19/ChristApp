/** Підмножина відповідей TMDB, яку реально використовує застосунок. */

export interface TmdbMovieSummary {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  /** ISO-дата `YYYY-MM-DD` або порожній рядок, якщо дата невідома. */
  release_date: string;
  vote_average: number;
  vote_count: number;
}

export interface TmdbSearchResponse {
  page: number;
  results: TmdbMovieSummary[];
  total_pages: number;
  total_results: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbMovieDetails extends TmdbMovieSummary {
  /** IMDb id (`tt1234567`) — потрібен деяким балансерам. */
  imdb_id: string | null;
  runtime: number | null;
  tagline: string;
  genres: TmdbGenre[];
}

/** Форма помилки, яку віддають наші API-роути. */
export interface ApiErrorBody {
  error: string;
}
