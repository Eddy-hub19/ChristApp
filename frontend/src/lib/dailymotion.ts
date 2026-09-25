/**
 * Офіційний Dailymotion Player SDK не публікує типів на npm (на відміну від @vimeo/player) —
 * тут лише мінімальний зріз API, яким користується DailymotionStage.tsx. Той самий підхід,
 * що й для YouTube в lib/youtube.ts: вантажимо офіційний script-тег, чекаємо глобальний об'єкт.
 */
export type DmPlayer = {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  load(videoId: string): void;
  destroy(): void;
  on(event: string, cb: (event: unknown) => void): void;
};

export type DmEvents = {
  VIDEO_PLAY: string;
  VIDEO_PLAYING: string;
  VIDEO_PAUSE: string;
  VIDEO_END: string;
  VIDEO_BUFFERING: string;
  VIDEO_TIMECHANGE: string;
  VIDEO_DURATIONCHANGE: string;
  VIDEO_PROGRESS: string;
  PLAYER_ERROR: string;
  APIREADY: string;
};

export type DmNamespace = {
  createPlayer(
    elementId: string,
    options: { video: string; params?: Record<string, unknown> },
  ): Promise<DmPlayer>;
  events: DmEvents;
};

declare global {
  interface Window {
    dailymotion?: DmNamespace;
    dmAsyncInit?: () => void;
  }
}

let apiPromise: Promise<DmNamespace> | null = null;

export function loadDailymotionApi(): Promise<DmNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Dailymotion API is browser-only"));
  }
  if (window.dailymotion) return Promise.resolve(window.dailymotion);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<DmNamespace>((resolve, reject) => {
    const previous = window.dmAsyncInit;
    window.dmAsyncInit = () => {
      previous?.();
      if (window.dailymotion) resolve(window.dailymotion);
      else reject(new Error("Dailymotion API failed to initialize"));
    };

    const script = document.createElement("script");
    script.src = "https://api.dmcdn.net/all.js";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("Dailymotion API failed to load"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}
