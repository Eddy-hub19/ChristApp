import type { ServerClock, WatchState } from "@/lib/watchSync";

/**
 * Спільний для всіх провайдерів набір помилок плеєра — кожен адаптер мапить свої власні коди
 * в ці (`classifyYouTubeError` у lib/youtube.ts — приклад для YouTube). Збігаються з ключами
 * cinema.errors.NOT_EMBEDDABLE/NOT_FOUND/CORS/playback(=HTML5)/generic(=INVALID) в messages/*.json.
 * CORS — окремо від HTML5: hls.js сам фетчить маніфест/сегменти через XHR (на відміну від
 * нативного <video src>, якому CORS для простого відтворення не потрібен) і саме тут
 * найчастіше ловить помилку через відсутні Access-Control-Allow-Origin на чужому сервері —
 * повідомлення "не вдалось програти" тут оманливе, людині потрібно сказати, що річ у CORS.
 */
export type StageErrorKind = "NOT_EMBEDDABLE" | "NOT_FOUND" | "HTML5" | "CORS" | "INVALID";

export type StageStatus = {
  ready: boolean;
  buffering: boolean;
  /** Браузер не дав запустити звук — граємо беззвучно, поки користувач не торкнеться «Увімкнути звук». */
  autoplayMuted: boolean;
  poorConnection: boolean;
  error: StageErrorKind | null;
};

/**
 * Єдиний контракт керування плеєром, яким користуються HostControls і WatchHall незалежно від
 * провайдера. YouTubeStage.tsx першим реалізував саме цю форму (ще до появи інших провайдерів) —
 * ця декларація лише формалізує її як спільний тип.
 */
export type PlayerAdapterHandle = {
  getCurrentTime(): number;
  getDuration(): number;
  getLoadedFraction(): number;
  /** Дії хоста: одразу застосовуються локально, а сервер отримує команду окремо. */
  localPlay(): number;
  localPause(): number;
  localSeek(sec: number): void;
  unmuteAfterGesture(): void;
};

export type PlayerAdapterProps = {
  state: WatchState;
  clock: ServerClock;
  isHost: boolean;
  volume: number;
  muted: boolean;
  onStatus: (status: StageStatus) => void;
  /** Хост натиснув на сам плеєр (не на нашу панель) — це теж команда для всіх. */
  onHostPlayerAction: (action: { type: "play" | "pause"; positionSec: number }) => void;
  onHeartbeat: (positionSec: number, isPlaying: boolean) => void;
};
