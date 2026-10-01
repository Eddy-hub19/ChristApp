import "server-only";
import type { TmdbMovieDetails, TmdbSearchResponse } from "@/lib/tmdb/types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT_MS = 10_000;

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

/**
 * Ключ лишається тільки на сервері. Підтримуємо обидва формати з кабінету TMDB:
 * v4 «API Read Access Token» (JWT, іде в Authorization) і v3 «API Key» (32 hex, іде в query).
 */
function authFor(): { headers: Record<string, string>; query: Record<string, string> } {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) throw new TmdbError("TMDB_API_KEY is not configured", 500);
  return key.startsWith("eyJ")
    ? { headers: { Authorization: `Bearer ${key}` }, query: {} }
    : { headers: {}, query: { api_key: key } };
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
  revalidateSeconds: number,
): Promise<T> {
  const auth = authFor();
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries({ ...params, ...auth.query })) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", ...auth.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: revalidateSeconds },
    });
  } catch {
    throw new TmdbError("TMDB is unreachable", 502);
  }

  if (res.status === 404) throw new TmdbError("Not found", 404);
  if (res.status === 401) throw new TmdbError("TMDB rejected the API key", 500);
  if (!res.ok) throw new TmdbError(`TMDB error ${res.status}`, 502);
  return (await res.json()) as T;
}

export function searchMovies(query: string, language: string, page = 1): Promise<TmdbSearchResponse> {
  return tmdbGet<TmdbSearchResponse>(
    "/search/movie",
    { query, language, page: String(page), include_adult: "false" },
    300,
  );
}

export function getMovieDetails(id: number, language: string): Promise<TmdbMovieDetails> {
  return tmdbGet<TmdbMovieDetails>(`/movie/${id}`, { language }, 3600);
}
