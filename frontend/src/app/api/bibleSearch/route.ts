import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { BIBLE_BOOKS } from "@/lib/bibleBooks";
import {
  BIBLE_SEARCH_MIN_LENGTH,
  matchesQuery,
  parseSearchQuery,
  stripVerseHtml,
  upstreamQuery,
} from "@/lib/bibleSearchCore";
import type { BibleSearchHit, BibleSearchResponse } from "@/lib/bibleSearchTypes";

/**
 * Пошук по Біблії. Тексти перекладів не зберігаються й не індексуються нами (ліцензії NRT/NKJV):
 * запит іде в той самий зовнішній API, що й читання, а тут лише фільтрація «за початком слова»,
 * ё/е·і/и-нормалізація, порційна віддача й короткий кеш відповідей у памʼяті.
 */

const PAGE_DEFAULT = 30;
const PAGE_MAX = 60;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 150;

type Matched = { hits: BibleSearchHit[]; at: number };

const cache = new Map<string, Matched>();
const inflight = new Map<string, Promise<BibleSearchHit[]>>();

const BOOK_ID_BY_NUM = new Map(BIBLE_BOOKS.map((b) => [b.num, b.id]));

function upstreamBase() {
  return (
    process.env.NEXT_PUBLIC_BIBLE_API_URL || "https://api.prayerpulse.io"
  ).replace(/\/$/, "");
}

async function loadHits(translation: string, q: string): Promise<BibleSearchHit[]> {
  const parsed = parseSearchQuery(q);
  const url = `${upstreamBase()}/bible/search/${encodeURIComponent(translation)}?search=${encodeURIComponent(upstreamQuery(parsed))}`;
  const res = await axios.get<unknown>(url, {
    validateStatus: () => true,
    timeout: 20_000,
    maxRedirects: 3,
    headers: { Accept: "application/json" },
  });
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data)) {
    if (res.status === 400) return [];
    throw new Error(`upstream ${res.status}`);
  }

  const hits: BibleSearchHit[] = [];
  for (const row of res.data as Array<Record<string, unknown>>) {
    const bookId = BOOK_ID_BY_NUM.get(Number(row.book));
    if (!bookId || typeof row.text !== "string") continue;
    const text = stripVerseHtml(row.text);
    if (!matchesQuery(text, parsed)) continue;
    hits.push({
      bookId,
      chapter: Number(row.chapter),
      verse: Number(row.verse),
      text,
    });
  }
  hits.sort(
    (a, b) =>
      bookNum(a.bookId) - bookNum(b.bookId) ||
      a.chapter - b.chapter ||
      a.verse - b.verse,
  );
  return hits;
}

const BOOK_NUM_BY_ID = new Map(BIBLE_BOOKS.map((b) => [b.id, b.num]));

function bookNum(id: string) {
  return BOOK_NUM_BY_ID.get(id) ?? 0;
}

async function getHits(translation: string, q: string): Promise<BibleSearchHit[]> {
  const key = `${translation}\u0000${parseSearchQuery(q).tokens.join(" ")}\u0000${parseSearchQuery(q).phrase ?? ""}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.hits;

  let pending = inflight.get(key);
  if (!pending) {
    pending = loadHits(translation, q)
      .then((hits) => {
        if (cache.size >= CACHE_MAX_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(key, { hits, at: Date.now() });
        return hits;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

function inScope(bookId: string, scope: string): boolean {
  if (scope === "all") return true;
  const info = BIBLE_BOOKS.find((b) => b.id === bookId);
  if (scope === "ot") return info?.testament === "old";
  if (scope === "nt") return info?.testament === "new";
  return bookId === scope;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const translation = sp.get("translation") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const scope = sp.get("scope") ?? "all";
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(sp.get("limit")) || PAGE_DEFAULT));

  if (!/^[A-Za-z0-9]{2,12}$/.test(translation) || q.length > 100) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!/^(all|ot|nt|[0-9A-Z]{3})$/.test(scope)) {
    return NextResponse.json({ error: "Bad scope" }, { status: 400 });
  }
  const parsed = parseSearchQuery(q);
  if (parsed.tokens.join("").length < BIBLE_SEARCH_MIN_LENGTH) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  try {
    const hits = await getHits(translation, q);

    const facets: Record<string, number> = {};
    for (const h of hits) facets[h.bookId] = (facets[h.bookId] ?? 0) + 1;

    const scoped = scope === "all" ? hits : hits.filter((h) => inScope(h.bookId, scope));
    const body: BibleSearchResponse = {
      total: scoped.length,
      totalAll: hits.length,
      facets,
      results: scoped.slice(offset, offset + limit),
      nextOffset: offset + limit < scoped.length ? offset + limit : null,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error("BIBLE SEARCH FAILED:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }
}
