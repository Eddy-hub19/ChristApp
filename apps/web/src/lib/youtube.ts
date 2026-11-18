/**
 * YouTube: розбір посилань і завантаження офіційного IFrame Player API.
 * Відео ніколи не качаємо напряму — лише через вбудований плеєр YouTube.
 */

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

export type ParsedYouTubeLink = {
  videoId: string;
  /** Таймкод із посилання (`t=1h2m3s`, `t=90`, `start=90`, `#t=1m`), секунди. */
  startSec: number;
};

export type YouTubeLinkError = "EMPTY" | "NOT_YOUTUBE" | "NO_VIDEO_ID";

export function isValidYouTubeVideoId(value: string): boolean {
  return VIDEO_ID_RE.test(value);
}

/** `90`, `90s`, `1m30s`, `1h2m3s`, `01:30`, `1:02:03` → секунди. */
export function parseYouTubeTimecode(raw: string | null | undefined): number {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return 0;

  if (/^\d+(\.\d+)?$/.test(value)) return Math.floor(Number(value));

  if (/^\d+(:\d{1,2}){1,2}$/.test(value)) {
    return value
      .split(":")
      .map(Number)
      .reduce((total, part) => total * 60 + part, 0);
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match[0]) return 0;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

/**
 * Витягує videoId з будь-якого поширеного формату посилань:
 * watch?v=, youtu.be/, shorts/, embed/, live/, v/, m./music./nocookie, а також «голий» id.
 */
export function parseYouTubeLink(
  input: string,
): { ok: true; value: ParsedYouTubeLink } | { ok: false; error: YouTubeLinkError } {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "EMPTY" };

  if (isValidYouTubeVideoId(raw)) {
    return { ok: true, value: { videoId: raw, startSec: 0 } };
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "NOT_YOUTUBE" };
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return { ok: false, error: "NOT_YOUTUBE" };

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const startSec = parseYouTubeTimecode(
    url.searchParams.get("t") ??
      url.searchParams.get("start") ??
      hashParams.get("t"),
  );

  const segments = url.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;

  if (host.endsWith("youtu.be")) {
    candidate = segments[0] ?? null;
  } else if (segments[0] === "watch" || segments.length === 0) {
    candidate = url.searchParams.get("v");
  } else if (["shorts", "embed", "live", "v", "e"].includes(segments[0])) {
    candidate = segments[1] ?? null;
  } else if (segments[0] === "attribution_link") {
    // youtube.com/attribution_link?u=/watch%3Fv%3D...
    const inner = url.searchParams.get("u");
    if (inner) return parseYouTubeLink(`https://www.youtube.com${inner}`);
  }

  if (!candidate || !isValidYouTubeVideoId(candidate)) {
    return { ok: false, error: "NO_VIDEO_ID" };
  }
  return { ok: true, value: { videoId: candidate, startSec } };
}

export function youTubeThumbnailUrl(
  videoId: string,
  quality: "mq" | "hq" | "maxres" = "hq",
): string {
  const file =
    quality === "maxres"
      ? "maxresdefault.jpg"
      : quality === "mq"
        ? "mqdefault.jpg"
        : "hqdefault.jpg";
  return `https://i.ytimg.com/vi/${videoId}/${file}`;
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// ================= IFrame Player API =================

/** Стани плеєра з документації IFrame API. */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** Коди помилок `onError`. 101/150 — власник заборонив вбудовування. */
export type YouTubePlayerErrorKind = "NOT_EMBEDDABLE" | "NOT_FOUND" | "HTML5" | "INVALID";

export function classifyYouTubeError(code: number): YouTubePlayerErrorKind {
  if (code === 101 || code === 150 || code === 153) return "NOT_EMBEDDABLE";
  if (code === 100) return "NOT_FOUND";
  if (code === 5) return "HTML5";
  return "INVALID";
}

export type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoLoadedFraction(): number;
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId?: string;
      width?: string | number;
      height?: string | number;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
        onError?: (event: { data: number; target: YTPlayer }) => void;
        onAutoplayBlocked?: (event: { target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is browser-only"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("YouTube IFrame API failed to load"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}
