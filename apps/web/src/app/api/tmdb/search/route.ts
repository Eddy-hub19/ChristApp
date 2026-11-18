import { NextRequest, NextResponse } from "next/server";
import { TmdbError, searchMovies } from "@/lib/server/tmdb";
import { tmdbLanguage } from "@/lib/tmdb/locale";
import type { ApiErrorBody, TmdbSearchResponse } from "@/lib/tmdb/types";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 100;
const EMPTY: TmdbSearchResponse = { page: 1, results: [], total_pages: 0, total_results: 0 };

/** GET /api/tmdb/search?q=назва&lang=ua&page=1 — пошук фільмів; ключ TMDB не покидає сервер. */
export async function GET(req: NextRequest): Promise<NextResponse<TmdbSearchResponse | ApiErrorBody>> {
  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json(EMPTY);
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Query is too long" }, { status: 400 });
  }

  const page = Math.min(500, Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1));

  try {
    const data = await searchMovies(query, tmdbLanguage(searchParams.get("lang") ?? "en"), page);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof TmdbError) {
      // Деталі конфігурації (ключ тощо) клієнту не віддаємо
      const status = e.status >= 500 ? 502 : e.status;
      console.error("[tmdb/search]", e.message);
      return NextResponse.json({ error: status === 502 ? "Search is temporarily unavailable" : e.message }, { status });
    }
    console.error("[tmdb/search]", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
