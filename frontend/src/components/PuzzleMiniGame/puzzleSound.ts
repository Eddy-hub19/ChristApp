/** Звук і вібрація при збігу кусочків. Усе «best effort»: без аудіо чи вібрації (iOS) гра працює так само. */
let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** Викликається з жесту користувача (дотик/клік): браузери дозволяють звук лише після нього. */
export function unlockPuzzleAudio() {
  context();
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Короткий «клац» збігу; `own: false` — тихіше (кусочок поставив напарник). */
export function playSnap(own = true) {
  const ctx = context();
  if (!ctx) return;
  const t = ctx.currentTime;
  const v = own ? 0.12 : 0.05;
  tone(ctx, 660, t, 0.09, v);
  tone(ctx, 990, t + 0.045, 0.12, v * 0.8);
}

export function playDone() {
  const ctx = context();
  if (!ctx) return;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, t + i * 0.12, 0.35, 0.13));
}

export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // не всі браузери дозволяють
  }
}
