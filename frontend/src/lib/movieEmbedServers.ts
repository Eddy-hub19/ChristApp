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
 * Незалежні iframe-балансери за tmdbId. Порядок = порядок фолбеку.
 * Це сторонні сервіси: вони можуть змінити формат посилань або зникнути —
 * тому список у одному місці, а плеєр не залежить від кількості елементів.
 */
export const MOVIE_EMBED_SERVERS: readonly MovieEmbedServer[] = [
  { id: "vidsrc", label: "VidSrc", buildUrl: ({ tmdbId }) => `https://vidsrc.cc/v2/embed/movie/${tmdbId}` },
  { id: "embedsu", label: "Embed.su", buildUrl: ({ tmdbId }) => `https://embed.su/embed/movie/${tmdbId}` },
  { id: "autoembed", label: "AutoEmbed", buildUrl: ({ tmdbId }) => `https://player.autoembed.cc/embed/movie/${tmdbId}` },
];
