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

/** Варіант якості для меню. `id: "auto"` — адаптивний вибір плеєра. */
export type StageQuality = { id: string; label: string };

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
  /**
   * Системний «картинка в картинці». Є лише в адаптерів із власним <video> (FILE/HLS):
   * YouTube/Vimeo/Dailymotion/iframe не дозволяють PiP зі свого плеєра — і ми його не обходимо.
   */
  isPipSupported?(): boolean;
  togglePip?(): void;
  /**
   * Вибір якості — лише там, де провайдер дає до цього надійний API (HLS/FILE і Vimeo).
   * У YouTube `setPlaybackQuality` сьогодні фактично ігнорується, у Dailymotion SDK цього не дає,
   * тож там ці методи не оголошені, а меню не показується. Порожній список (<2 пунктів) = сховати меню.
   */
  getQualities?(): StageQuality[];
  getQuality?(): string;
  setQuality?(id: string): void;
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
