export type TmdbPosterSize = "w185" | "w342" | "w500";
export type TmdbBackdropSize = "w780" | "w1280";

const BASE = "https://image.tmdb.org/t/p";

export function tmdbImageUrl(path: string | null, size: TmdbPosterSize | TmdbBackdropSize): string | null {
  return path ? `${BASE}/${size}${path}` : null;
}
