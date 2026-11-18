export interface MovieEmbedIds {
  tmdbId: number;
  imdbId?: string | null;
}

export interface MovieEmbedServer {
  id: string;
  /** Підпис на кнопці перемикання. */
  label: string;
  /** Пряме посилання на сам плеєр (не на сторінку сайту). */
  buildUrl: (ids: MovieEmbedIds) => string;
}

/**
 * Незалежні iframe-балансери за tmdbId. Порядок = пріоритет і порядок фолбеку: стабільніші першими.
 * Це сторонні сервіси: вони можуть змінити формат посилань або зникнути —
 * тому список у одному місці, а плеєр не залежить від кількості елементів.
 */
export const MOVIE_EMBED_SERVERS: readonly MovieEmbedServer[] = [
  { id: "vidsrc", label: "VidSrc", buildUrl: ({ tmdbId }) => `https://vidsrc.sh/embed/movie/${tmdbId}` },
  { id: "vidlink", label: "VidLink", buildUrl: ({ tmdbId }) => `https://vidlink.pro/movie/${tmdbId}` },
  { id: "2embed", label: "2Embed", buildUrl: ({ tmdbId }) => `https://www.2embed.cc/embed/${tmdbId}` },
  // Найагресивніший Cloudflare Challenge — тому останній; `tmdb=1` обовʼязковий (інакше video_id читається як IMDb)
  { id: "multiembed", label: "MultiEmbed", buildUrl: ({ tmdbId }) => `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1` },
];
