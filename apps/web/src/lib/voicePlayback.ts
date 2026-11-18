"use client";

/**
 * Глобальний менеджер голосових: один спільний <audio> на весь застосунок.
 *  - грає лише одне голосове за раз;
 *  - один і той самий елемент "розблоковується" жестом користувача, тож автопереход до наступного
 *    голосового працює і на iPhone (новий Audio без жесту Safari заблокував би);
 *  - стан (час, швидкість) живе поза React-деревом, тож не скидається при перемалюванні списку;
 *  - Media Session API: керування з екрана блокування та фонове відтворення.
 */

export type VoicePlaybackState = {
  activeId: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  error: boolean;
};

export type VoiceSource = {
  id: string;
  /** Список URL за пріоритетом (AAC/m4a першим). */
  urls: string[];
  senderId?: string;
  /** Елемент у DOM — потрібен, щоб знайти "наступне голосове" за візуальним порядком. */
  element: () => HTMLElement | null;
  title?: string;
  onStarted?: () => void;
};

export const VOICE_RATES = [1, 1.5, 2] as const;

const listeners = new Set<() => void>();
const registry = new Map<string, VoiceSource>();

let audio: HTMLAudioElement | null = null;
let state: VoicePlaybackState = {
  activeId: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  error: false,
};
let urlIndex = 0;

function emit(next: Partial<VoicePlaybackState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeVoicePlayback(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVoicePlaybackState(): VoicePlaybackState {
  return state;
}

export function registerVoice(source: VoiceSource) {
  registry.set(source.id, source);
  return () => {
    // Список перемальовується при прокрутці — не зупиняємо звук, якщо елемент лише перемонтувався.
    if (registry.get(source.id) === source) registry.delete(source.id);
  };
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  const element = new Audio();
  element.preload = "auto";
  element.setAttribute("playsinline", "");
  element.addEventListener("timeupdate", () => {
    emit({ currentTime: element.currentTime });
  });
  element.addEventListener("loadedmetadata", () => {
    if (element.duration === Infinity) {
      // Chrome-webm без метаданих про тривалість: змушуємо браузер порахувати її.
      const restore = () => {
        element.removeEventListener("timeupdate", restore);
        element.currentTime = 0;
        emit({ duration: finiteDuration(element.duration) });
      };
      element.addEventListener("timeupdate", restore);
      element.currentTime = 1e101;
      return;
    }
    emit({ duration: finiteDuration(element.duration) });
  });
  element.addEventListener("durationchange", () => {
    const duration = finiteDuration(element.duration);
    if (duration) emit({ duration });
  });
  element.addEventListener("play", () => emit({ playing: true, error: false }));
  element.addEventListener("pause", () => emit({ playing: false }));
  element.addEventListener("ended", handleEnded);
  element.addEventListener("error", handleError);
  audio = element;
  return element;
}

function handleError() {
  const source = state.activeId ? registry.get(state.activeId) : undefined;
  if (source && urlIndex + 1 < source.urls.length) {
    urlIndex += 1;
    const element = getAudio();
    element.src = source.urls[urlIndex];
    void element.play().catch(() => emit({ playing: false, error: true }));
    return;
  }
  emit({ playing: false, error: true });
}

function nextInChain(current: VoiceSource): VoiceSource | null {
  const currentEl = current.element();
  if (!currentEl) return null;
  const candidates = [...registry.values()]
    .filter((source) => source.id !== current.id)
    .map((source) => ({ source, el: source.element() }))
    .filter(
      (entry): entry is { source: VoiceSource; el: HTMLElement } =>
        entry.el !== null &&
        Boolean(
          currentEl.compareDocumentPosition(entry.el) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
    )
    .sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    );
  const next = candidates[0]?.source;
  // "Підряд" лише від того самого співрозмовника.
  if (next && next.senderId === current.senderId) return next;
  return null;
}

function handleEnded() {
  const current = state.activeId ? registry.get(state.activeId) : undefined;
  emit({ playing: false, currentTime: 0 });
  if (!current) return;
  const next = nextInChain(current);
  if (next) {
    void playVoice(next);
  } else {
    emit({ activeId: null });
  }
}

function updateMediaSession(source: VoiceSource) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: source.title ?? "Voice message",
      artist: "Christ App",
    });
    navigator.mediaSession.setActionHandler("play", () => void audio?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio?.pause());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (audio && typeof details.seekTime === "number") {
        audio.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const current = state.activeId ? registry.get(state.activeId) : undefined;
      const next = current ? nextInChain(current) : null;
      if (next) void playVoice(next);
    });
  } catch {
    // не всі браузери підтримують усі дії
  }
}

export async function playVoice(source: VoiceSource, startAt?: number) {
  const element = getAudio();
  registry.set(source.id, source);
  const switching = state.activeId !== source.id;
  if (switching) {
    element.pause();
    urlIndex = 0;
    element.src = source.urls[0];
    emit({
      activeId: source.id,
      currentTime: 0,
      duration: 0,
      error: false,
    });
    element.playbackRate = state.rate;
  }
  if (typeof startAt === "number") {
    element.currentTime = startAt;
  }
  updateMediaSession(source);
  try {
    await element.play();
    source.onStarted?.();
  } catch {
    emit({ playing: false, error: !switching });
  }
}

export function pauseVoice() {
  audio?.pause();
}

export function toggleVoice(source: VoiceSource) {
  if (state.activeId === source.id && state.playing) {
    pauseVoice();
  } else {
    void playVoice(source);
  }
}

export function seekVoice(source: VoiceSource, seconds: number) {
  if (state.activeId === source.id) {
    getAudio().currentTime = Math.max(0, seconds);
    emit({ currentTime: seconds });
  } else {
    void playVoice(source, seconds);
  }
}

export function cycleVoiceRate() {
  const index = VOICE_RATES.indexOf(state.rate as (typeof VOICE_RATES)[number]);
  const next = VOICE_RATES[(index + 1) % VOICE_RATES.length];
  if (audio) audio.playbackRate = next;
  emit({ rate: next });
  return next;
}
