import { Injectable, Logger } from '@nestjs/common';
import { YOUTUBE_VIDEO_ID_RE, type WatchProvider } from './watch-party.state';
import { checkEmbeddable, safeFetchContentType, safeFetchJson } from './url-safety';

const VIMEO_ID_RE = /^\d{6,12}$/;
const DAILYMOTION_ID_RE = /^[A-Za-z0-9]{6,14}$/;
const FILE_EXTENSIONS: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m3u8': 'application/vnd.apple.mpegurl',
};
const CACHE_MS = 10 * 60 * 1000;

export type ResolvedVideo =
  | {
      ok: true;
      provider: WatchProvider;
      /** YOUTUBE/VIMEO/DAILYMOTION — id відео. FILE/IFRAME/MANUAL — повний URL. */
      videoId: string;
      title: string | null;
      thumbnailUrl: string | null;
    }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_EMBEDDABLE' | 'INVALID_VIDEO' | 'UNSAFE_URL' };

type OembedResponse = { title?: unknown; thumbnail_url?: unknown };

/**
 * Визначає провайдера за посиланням і повертає нормалізовані метадані. НЕ кидає винятків —
 * мережеві/SSRF-помилки перетворюються на `{ ok: false, code: 'NOT_FOUND' | 'UNSAFE_URL' }`,
 * щоб виклик завжди повертав керований результат для DTO-валідації чи прев'ю в UI.
 */
@Injectable()
export class VideoResolverService {
  private readonly logger = new Logger(VideoResolverService.name);
  private readonly cache = new Map<string, { at: number; result: ResolvedVideo }>();

  async resolveLink(rawInput: string): Promise<ResolvedVideo> {
    const input = rawInput.trim();
    if (!input) return { ok: false, code: 'INVALID_VIDEO' };

    const cached = this.cache.get(input);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;

    const result = await this.resolveUncached(input);
    this.cache.set(input, { at: Date.now(), result });
    return result;
  }

  private async resolveUncached(input: string): Promise<ResolvedVideo> {
    // "Голий" YouTube videoId (як і раніше приймали в DTO) — без URL.
    if (YOUTUBE_VIDEO_ID_RE.test(input)) {
      return this.resolveYoutube(input);
    }

    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return { ok: false, code: 'INVALID_VIDEO' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, code: 'INVALID_VIDEO' };
    }
    // http-посилання на https-сторінці браузер однаково заблокує (mixed content) — краще
    // сказати про це одразу, ніж дати "не вдалось" без пояснення.
    if (url.protocol === 'http:') {
      this.logger.debug(`resolveLink: http (mixed-content risk) url=${input}`);
    }

    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
      const videoId = extractYoutubeId(url, host);
      if (!videoId) return { ok: false, code: 'INVALID_VIDEO' };
      return this.resolveYoutube(videoId);
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const videoId = extractVimeoId(url);
      if (!videoId) return { ok: false, code: 'INVALID_VIDEO' };
      return this.resolveVimeo(videoId);
    }

    if (host === 'dailymotion.com' || host === 'dai.ly') {
      const videoId = extractDailymotionId(url, host);
      if (!videoId) return { ok: false, code: 'INVALID_VIDEO' };
      return this.resolveDailymotion(videoId);
    }

    const extMatch = /\.(mp4|webm|m3u8)(?:$|[?#])/i.exec(url.pathname);
    if (extMatch) {
      return this.resolveFile(url.toString());
    }
    // Розширення не видно з посилання (напр. підписаний URL із токеном у query) — питаємо сервер.
    const contentType = await safeFetchContentType(url.toString());
    if (contentType && Object.values(FILE_EXTENSIONS).some((t) => contentType.startsWith(t))) {
      return this.resolveFile(url.toString());
    }

    return this.resolveGeneric(url.toString());
  }

  private async resolveYoutube(videoId: string): Promise<ResolvedVideo> {
    if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) return { ok: false, code: 'INVALID_VIDEO' };
    const oembed = await safeFetchJson<OembedResponse>(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`,
      )}`,
    );
    if (!oembed) {
      // oEmbed 401/403 у YouTube означає "не вбудовується", 404 — "нема". Без деталей статусу
      // тут (safeFetchJson їх не віддає) — вважаємо відео відсутнім, requireEmbeddableVideo()
      // у watch-party.service.ts і так робить точнішу перевірку перед фактичним стартом кімнати.
      return { ok: false, code: 'NOT_FOUND' };
    }
    return {
      ok: true,
      provider: 'YOUTUBE',
      videoId,
      title: typeof oembed.title === 'string' ? oembed.title.slice(0, 200) : null,
      thumbnailUrl:
        typeof oembed.thumbnail_url === 'string' ? oembed.thumbnail_url.slice(0, 1024) : null,
    };
  }

  private async resolveVimeo(videoId: string): Promise<ResolvedVideo> {
    if (!VIMEO_ID_RE.test(videoId)) return { ok: false, code: 'INVALID_VIDEO' };
    const oembed = await safeFetchJson<OembedResponse>(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}`,
    );
    if (!oembed) return { ok: false, code: 'NOT_FOUND' };
    return {
      ok: true,
      provider: 'VIMEO',
      videoId,
      title: typeof oembed.title === 'string' ? oembed.title.slice(0, 200) : null,
      thumbnailUrl:
        typeof oembed.thumbnail_url === 'string' ? oembed.thumbnail_url.slice(0, 1024) : null,
    };
  }

  private async resolveDailymotion(videoId: string): Promise<ResolvedVideo> {
    if (!DAILYMOTION_ID_RE.test(videoId)) return { ok: false, code: 'INVALID_VIDEO' };
    const oembed = await safeFetchJson<OembedResponse>(
      `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(
        `https://www.dailymotion.com/video/${videoId}`,
      )}`,
    );
    if (!oembed) return { ok: false, code: 'NOT_FOUND' };
    return {
      ok: true,
      provider: 'DAILYMOTION',
      videoId,
      title: typeof oembed.title === 'string' ? oembed.title.slice(0, 200) : null,
      thumbnailUrl:
        typeof oembed.thumbnail_url === 'string' ? oembed.thumbnail_url.slice(0, 1024) : null,
    };
  }

  /**
   * Викликається, лише коли розширення вже видно з посилання АБО content-type уже перевірено
   * в resolveUncached() — тут повторного мережевого запиту не робимо. Сам файл однаково
   * спробує програти клієнтський <video>/hls.js — тут лише прев'ю, не гарантія відтворюваності.
   */
  private resolveFile(url: string): ResolvedVideo {
    return { ok: true, provider: 'FILE', videoId: url, title: null, thumbnailUrl: null };
  }

  /**
   * Не YouTube/Vimeo/Dailymotion/файл — перевіряємо, чи дозволяє сторінка вбудовування
   * (X-Frame-Options/CSP). Дозволяє — IFRAME (показуємо вбудованим), ні або перевірка не
   * вдалася — MANUAL (лише прев'ю-картка й посилання "Відкрити"). Обидва — ручна синхронізація.
   */
  private async resolveGeneric(url: string): Promise<ResolvedVideo> {
    const check = await checkEmbeddable(url);
    const provider: WatchProvider = check?.embeddable ? 'IFRAME' : 'MANUAL';
    let title: string | null = null;
    try {
      title = new URL(url).hostname;
    } catch {
      title = null;
    }
    return { ok: true, provider, videoId: url, title, thumbnailUrl: null };
  }
}

function extractYoutubeId(url: URL, host: string): string | null {
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
  }
  if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/')) {
    const id = url.pathname.split('/')[2];
    return id && YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
  }
  const v = url.searchParams.get('v');
  if (v && YOUTUBE_VIDEO_ID_RE.test(v)) return v;
  return null;
}

function extractVimeoId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  // player.vimeo.com/video/123 або vimeo.com/123 чи vimeo.com/channels/x/123
  const last = segments[segments.length - 1];
  return last && VIMEO_ID_RE.test(last) ? last : null;
}

function extractDailymotionId(url: URL, host: string): string | null {
  if (host === 'dai.ly') {
    const id = url.pathname.slice(1).split('/')[0];
    return id && DAILYMOTION_ID_RE.test(id) ? id : null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const videoIdx = segments.indexOf('video');
  const id = videoIdx >= 0 ? segments[videoIdx + 1] : segments[segments.length - 1];
  // Ідентифікатори Dailymotion самі часто зустрічають повний slug типу "x7ab3c4-title" —
  // беремо частину до першого дефіса, якщо основний regex не збігся.
  if (!id) return null;
  if (DAILYMOTION_ID_RE.test(id)) return id;
  const short = id.split('_')[0];
  return DAILYMOTION_ID_RE.test(short) ? short : null;
}
