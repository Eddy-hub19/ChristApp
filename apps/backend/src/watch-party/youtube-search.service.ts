import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_MS = 10 * 60 * 1000;
const MAX_RESULTS = 24;
const DEFAULT_REGION = 'UA';

export type VideoSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  /** null — тривалість невідома (наприклад, лайв-трансляція). */
  durationSec: number | null;
  isShort: boolean;
};

type YoutubeErrorBody = { error?: { message?: string; errors?: { reason?: string }[] } };

/** PT1H2M3S / PT3M33S / PT45S → секунди. Порожній рядок або лайв (без duration) → null. */
function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const hours = Number(m[1] ?? 0);
  const minutes = Number(m[2] ?? 0);
  const seconds = Number(m[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

function isShortDuration(sec: number | null): boolean {
  return sec !== null && sec > 0 && sec <= 60;
}

/**
 * Проксі до YouTube Data API v3 для міні-пошуку відео в кінозалі. Ключ (YOUTUBE_API_KEY)
 * лишається тільки на сервері — у клієнтський код ніколи не потрапляє. Пошук дорогий по квоті
 * (100 одиниць на запит проти 1 для videos.list), тож кешуємо результати в пам'яті й чекаємо
 * debounce на фронтенді — самих запитів це не обмежує, лише зменшує їх кількість.
 */
@Injectable()
export class YoutubeSearchService {
  private readonly logger = new Logger(YoutubeSearchService.name);
  private readonly cache = new Map<
    string,
    { at: number; items: VideoSearchItem[] }
  >();

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('YOUTUBE_API_KEY');
  }

  async search(query: string): Promise<VideoSearchItem[]> {
    const key = `search:${query.trim().toLowerCase()}`;
    return this.cached(key, async () => {
      const searchUrl =
        `${API_BASE}/search?part=snippet&type=video&videoEmbeddable=true` +
        `&safeSearch=strict&maxResults=${MAX_RESULTS}` +
        `&q=${encodeURIComponent(query)}&key=${this.requireApiKey()}`;
      const body = await this.fetchJson<{
        items?: { id?: { videoId?: string }; snippet?: YoutubeSnippet }[];
      }>(searchUrl);
      const partial = (body.items ?? [])
        .map((item) => ({ videoId: item.id?.videoId, snippet: item.snippet }))
        .filter((item): item is { videoId: string; snippet: YoutubeSnippet | undefined } =>
          Boolean(item.videoId),
        );
      return this.withDurations(partial);
    });
  }

  async popular(region?: string): Promise<VideoSearchItem[]> {
    const defaultRegion = this.config.get<string>('YOUTUBE_SEARCH_REGION') || DEFAULT_REGION;
    const normalizedRegion = (region || defaultRegion).toUpperCase();
    const key = `popular:${normalizedRegion}`;
    return this.cached(key, async () => {
      const url =
        `${API_BASE}/videos?part=snippet,contentDetails&chart=mostPopular` +
        `&regionCode=${normalizedRegion}&maxResults=${MAX_RESULTS}` +
        `&key=${this.requireApiKey()}`;
      const body = await this.fetchJson<{
        items?: { id?: string; snippet?: YoutubeSnippet; contentDetails?: { duration?: string } }[];
      }>(url);
      return (body.items ?? [])
        .filter((item): item is { id: string; snippet?: YoutubeSnippet; contentDetails?: { duration?: string } } =>
          Boolean(item.id),
        )
        .map((item) => this.toSearchItem(item.id, item.snippet, item.contentDetails?.duration));
    });
  }

  private async cached(
    key: string,
    load: () => Promise<VideoSearchItem[]>,
  ): Promise<VideoSearchItem[]> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.items;
    const items = await load();
    this.cache.set(key, { at: Date.now(), items });
    return items;
  }

  private requireApiKey(): string {
    const key = this.apiKey;
    if (!key) {
      throw new ServiceUnavailableException({
        code: 'YOUTUBE_NOT_CONFIGURED',
        message: 'Пошук YouTube тимчасово недоступний',
      });
    }
    return key;
  }

  private async withDurations(
    partial: { videoId: string; snippet: YoutubeSnippet | undefined }[],
  ): Promise<VideoSearchItem[]> {
    if (partial.length === 0) return [];
    // Один пакетний запит на всі id одразу — videos.list коштує 1 одиницю квоти незалежно від кількості id.
    const ids = partial.map((p) => p.videoId).join(',');
    const url = `${API_BASE}/videos?part=contentDetails&id=${ids}&key=${this.requireApiKey()}`;
    const body = await this.fetchJson<{
      items?: { id?: string; contentDetails?: { duration?: string } }[];
    }>(url);
    const durationById = new Map(
      (body.items ?? [])
        .filter((i): i is { id: string; contentDetails?: { duration?: string } } => Boolean(i.id))
        .map((i) => [i.id, i.contentDetails?.duration]),
    );
    return partial.map((p) =>
      this.toSearchItem(p.videoId, p.snippet, durationById.get(p.videoId)),
    );
  }

  private toSearchItem(
    videoId: string,
    snippet: YoutubeSnippet | undefined,
    durationIso: string | undefined,
  ): VideoSearchItem {
    const durationSec = parseIsoDuration(durationIso);
    return {
      videoId,
      title: snippet?.title?.slice(0, 200) ?? '',
      channelTitle: snippet?.channelTitle?.slice(0, 100) ?? '',
      thumbnailUrl:
        snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? null,
      durationSec,
      isShort: isShortDuration(durationSec),
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      this.logger.warn(`YouTube API network error: ${String(err)}`);
      throw new ServiceUnavailableException({
        code: 'YOUTUBE_UNAVAILABLE',
        message: 'YouTube тимчасово недоступний, спробуйте пізніше',
      });
    }
    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as YoutubeErrorBody | null;
      const reason = errBody?.error?.errors?.[0]?.reason;
      this.logger.warn(
        `YouTube API ${res.status}: ${errBody?.error?.message ?? 'unknown'} (reason=${reason ?? 'n/a'})`,
      );
      const quotaExceeded = res.status === 403 && reason === 'quotaExceeded';
      throw new ServiceUnavailableException({
        code: quotaExceeded ? 'YOUTUBE_QUOTA_EXCEEDED' : 'YOUTUBE_UNAVAILABLE',
        message: quotaExceeded
          ? 'Вичерпано квоту пошуку YouTube на сьогодні'
          : 'YouTube тимчасово недоступний, спробуйте пізніше',
      });
    }
    return (await res.json()) as T;
  }
}

type YoutubeSnippet = {
  title?: string;
  channelTitle?: string;
  thumbnails?: {
    default?: { url?: string };
    medium?: { url?: string };
  };
};
