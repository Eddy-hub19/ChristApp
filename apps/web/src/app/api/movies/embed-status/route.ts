import { NextRequest, NextResponse } from "next/server";
import { MOVIE_EMBED_SERVERS } from "@/lib/movieEmbedServers";
import type { EmbedStatusResponse } from "@/lib/movieEmbedStatus";

export const runtime = "nodejs";

const PROBE_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, { ok: boolean; at: number }>();

/**
 * Сервер «живий», якщо домен відповідає 2xx/3xx і не забороняє вбудовування
 * (`X-Frame-Options` / `frame-ancestors`); відповідь-челендж Cloudflare вважається «живим». Це лише підказка: з нашого хоста доступність
 * може відрізнятись від доступності з телефону користувача, а 200 не гарантує, що відео заграє.
 */
async function probe(url: string): Promise<boolean> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok;

  let ok = false;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    await res.body?.cancel();
    const csp = res.headers.get("content-security-policy") ?? "";
    // Cloudflare Challenge (403/503 + cf-mitigated) на запит із дата-центру означає «домен живий»:
    // справжній браузер його проходить, тож це не привід вважати сервер впалим.
    const challenged = res.headers.get("cf-mitigated") === "challenge";
    ok = (res.status < 400 || challenged) && !res.headers.get("x-frame-options") && !/frame-ancestors\s+('none'|'self')/i.test(csp);
  } catch {
    ok = false;
  }

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(url, { ok, at: Date.now() });
  return ok;
}

/** GET /api/movies/embed-status?tmdbId=603 → які з iframe-серверів зараз відповідають. */
export async function GET(req: NextRequest): Promise<NextResponse<EmbedStatusResponse | { error: string }>> {
  const raw = req.nextUrl.searchParams.get("tmdbId") ?? "";
  if (!/^\d{1,9}$/.test(raw)) return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  const tmdbId = Number(raw);

  // Усі домени беруться з нашого конфігу (не з запиту), тож SSRF тут неможливий
  const servers = await Promise.all(
    MOVIE_EMBED_SERVERS.map(async (s) => ({ id: s.id, ok: await probe(s.buildUrl({ tmdbId })) })),
  );
  return NextResponse.json({ servers });
}
