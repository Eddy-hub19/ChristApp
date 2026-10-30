/**
 * Звуковой движок «Отари» (Web Audio). Реестр звуков - в flockSoundDefs.ts: чтобы заменить синтез готовым файлом,
 * достаточно указать `file` у записи; вызывающий код (playFlockSound / startFlockLoop) не меняется.
 *
 * - Один AudioContext, создаётся и разблокируется первым касанием/кликом (iOS/Safari); до этого звуки молча пропускаются.
 * - Не больше MAX_VOICES одновременных голосов, у каждого звука свой минимальный интервал и разброс высоты.
 * - Чужие звуки затухают с расстоянием до камеры (дальше радиуса обзора не играем) и панорамируются по горизонтали.
 * - Не играет при скрытой вкладке, на паузе игры и пока игра закрыта (контекст приостанавливается).
 */
import { SOUNDS, type SoundId, type SynthEnv } from "./flockSoundDefs";

const PREFIX = "christapp:flock:sound";
const MAX_VOICES = 8;
const MAX_LOOPS = 3;
const NOISE_SECONDS = 2;

export interface FlockSoundSettings {
  enabled: boolean;
  /** 0..1 */
  volume: number;
  /** Фоновые звуки (ветер, дождь). */
  ambient: boolean;
  /** Музыка в лобби. */
  music: boolean;
}

export const DEFAULT_SOUND_SETTINGS: FlockSoundSettings = { enabled: true, volume: 0.35, ambient: true, music: true };

let settings: FlockSoundSettings | null = null;
const listeners = new Set<() => void>();

function loadSettings(): FlockSoundSettings {
  const s = { ...DEFAULT_SOUND_SETTINGS };
  try {
    const en = localStorage.getItem(`${PREFIX}:enabled`);
    const vol = localStorage.getItem(`${PREFIX}:volume`);
    const amb = localStorage.getItem(`${PREFIX}:ambient`);
    const mus = localStorage.getItem(`${PREFIX}:music`);
    if (mus !== null) s.music = mus !== "0";
    if (en !== null) s.enabled = en !== "0";
    if (amb !== null) s.ambient = amb !== "0";
    if (vol !== null && vol !== "" && Number.isFinite(Number(vol))) s.volume = Math.min(1, Math.max(0, Number(vol)));
  } catch {
    /* приватный режим */
  }
  return s;
}

/** Снимок настроек (стабилен между вызовами, пока они не менялись) - для useSyncExternalStore. */
export function getFlockSoundSettings(): FlockSoundSettings {
  if (typeof window === "undefined") return DEFAULT_SOUND_SETTINGS;
  if (!settings) settings = loadSettings();
  return settings;
}

export function subscribeFlockSound(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setFlockSoundSettings(patch: Partial<FlockSoundSettings>) {
  const next = { ...getFlockSoundSettings(), ...patch };
  next.volume = Math.min(1, Math.max(0, next.volume));
  settings = next;
  try {
    localStorage.setItem(`${PREFIX}:enabled`, next.enabled ? "1" : "0");
    localStorage.setItem(`${PREFIX}:volume`, String(Math.round(next.volume * 100) / 100));
    localStorage.setItem(`${PREFIX}:ambient`, next.ambient ? "1" : "0");
    localStorage.setItem(`${PREFIX}:music`, next.music ? "1" : "0");
  } catch {
    /* ignore */
  }
  applyMaster();
  if (!next.enabled) stopAllLoops();
  else void loadFiles().then(syncMusic);
  syncMusic();
  listeners.forEach((fn) => fn());
}

// --- контекст ---
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let running = false;
let paused = false;
let voices = 0;
const lastAt = new Map<SoundId, number>();
const buffers = new Map<SoundId, AudioBuffer>();
const failed = new Set<SoundId>();
let filesLoading = false;
const listener = { x: 0, y: 0, r: 700 };

function applyMaster() {
  if (!ctx || !master) return;
  const s = getFlockSoundSettings();
  master.gain.setTargetAtTime(s.enabled ? Math.pow(s.volume, 1.5) : 0, ctx.currentTime, 0.02);
}

function audible() {
  return Boolean(ctx && ctx.state === "running" && running && !paused && typeof document !== "undefined" && !document.hidden && getFlockSoundSettings().enabled);
}

/** Создаёт контекст (только из обработчика жеста пользователя) и возобновляет его. */
export function unlockFlockSound() {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyMaster();
      // «прогрев» iOS: тихий пустой буфер внутри жеста
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
    }
    if (running && !document.hidden && ctx.state !== "running") void ctx.resume().then(syncMusic).catch(() => undefined);
    void loadFiles().then(syncMusic);
  } catch {
    /* звук недоступен */
  }
}

/** Слушает первое касание/клик/клавишу, пока игра открыта; возвращает отписку. */
export function installFlockSoundUnlock(): () => void {
  const events = ["pointerdown", "touchend", "click", "keydown"] as const;
  const onGesture = () => {
    unlockFlockSound();
    if (ctx && ctx.state === "running") off();
  };
  const off = () => events.forEach((e) => window.removeEventListener(e, onGesture, true));
  events.forEach((e) => window.addEventListener(e, onGesture, true));
  return off;
}

/** Игра открыта (true) или закрыта (false): в закрытом состоянии контекст приостанавливается. */
export function setFlockSoundRunning(on: boolean) {
  running = on;
  if (!ctx) return;
  if (on) {
    if (typeof document !== "undefined" && !document.hidden) void ctx.resume().then(syncMusic).catch(() => undefined);
  } else {
    stopAllLoops();
    void ctx.suspend().catch(() => undefined);
  }
}

/** Пауза игры (связь потеряна): звуки не играют. */
export function setFlockSoundPaused(on: boolean) {
  paused = on;
  if (on) stopAllLoops();
  else syncMusic();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) {
      stopAllLoops();
      void ctx.suspend().catch(() => undefined);
    } else if (running) void ctx.resume().then(syncMusic).catch(() => undefined);
  });
}

/** Камера игры: расстояние чужих звуков считается от неё. */
export function setFlockSoundListener(x: number, y: number, r: number) {
  listener.x = x;
  listener.y = y;
  listener.r = Math.max(1, r);
}

function getNoise(): AudioBuffer {
  if (noise) return noise;
  const c = ctx as AudioContext;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * NOISE_SECONDS), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

// --- готовые файлы: ленивая загрузка при первом включении звука; не загрузился - играет синтез ---
async function loadFiles() {
  if (!ctx || filesLoading || !getFlockSoundSettings().enabled) return;
  const c = ctx;
  const todo = (Object.keys(SOUNDS) as SoundId[]).filter((id) => SOUNDS[id].file && !buffers.has(id) && !failed.has(id));
  if (!todo.length) return;
  filesLoading = true;
  try {
    for (const id of todo) {
      try {
        let buf: AudioBuffer | null = null;
        // .ogg не везде декодируется (старый Safari) - тогда пробуем .mp3; нет ни того ни другого - играет синтез
        for (const ext of [".ogg", ".mp3"]) {
          try {
            const res = await fetch(`${SOUNDS[id].file}${ext}`);
            if (!res.ok) continue;
            const data = await res.arrayBuffer();
            buf = await new Promise<AudioBuffer>((ok, bad) => c.decodeAudioData(data, ok, bad));
            break;
          } catch {
            /* пробуем следующий формат */
          }
        }
        if (!buf) throw new Error("no file");
        buffers.set(id, buf);
      } catch {
        failed.add(id);
      }
    }
  } finally {
    filesLoading = false;
    syncMusic();
  }
}

let musicWanted = false;

/** Музыка лобби: on - должна играть (если звук и «Музыка» включены, файл загружен); плавно входит и выходит. */
export function setFlockMusic(on: boolean) {
  musicWanted = on;
  syncMusic();
}

function syncMusic() {
  if (musicWanted && audible() && getFlockSoundSettings().music && buffers.has("melody")) startFlockLoop("melody");
  else stopFlockLoop("melody");
}

export interface PlayOptions {
  /** Позиция источника; без неё (или при self) звук играет на полной громкости. */
  x?: number;
  y?: number;
  self?: boolean;
  /** Задержка, мс (например, звон падающей звезды в момент приземления). */
  delayMs?: number;
  /** Дополнительный множитель высоты. */
  pitch?: number;
}

export function playFlockSound(id: SoundId, o?: PlayOptions) {
  if (!audible()) return;
  const c = ctx as AudioContext;
  const def = SOUNDS[id];
  if (voices >= MAX_VOICES) return;
  const nowMs = performance.now();
  if (def.minGapMs && nowMs - (lastAt.get(id) ?? -1e9) < def.minGapMs) return;

  let gain = def.gain;
  let pan = 0;
  if (o && o.x !== undefined && o.y !== undefined && !o.self) {
    const d = Math.hypot(o.x - listener.x, o.y - listener.y);
    if (d >= listener.r) return;
    const k = 1 - d / listener.r;
    gain *= k * k;
    pan = Math.max(-1, Math.min(1, (o.x - listener.x) / listener.r)) * 0.7;
    if (gain < 0.01) return;
  }
  lastAt.set(id, nowMs);

  const pitch = (o?.pitch ?? 1) * (1 + (Math.random() - 0.5) * 2 * (def.jitter ?? 0));
  const t = c.currentTime + Math.max(0, (o?.delayMs ?? 0) / 1000);
  const out = c.createGain();
  out.gain.value = gain;
  let tail: AudioNode = out;
  if (pan !== 0 && typeof c.createStereoPanner === "function") {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    out.connect(p);
    tail = p;
  }
  tail.connect(master as GainNode);

  let dur = 0.3;
  const buf = buffers.get(id);
  if (buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    src.connect(out);
    src.start(t);
    dur = buf.duration / pitch;
  } else {
    const env: SynthEnv = { ctx: c, out, t, pitch, noise: getNoise() };
    dur = def.synth(env);
  }
  voices++;
  setTimeout(() => {
    voices = Math.max(0, voices - 1);
    try {
      out.disconnect();
    } catch {
      /* ignore */
    }
  }, (dur + (o?.delayMs ?? 0) / 1000 + 0.15) * 1000);
}

// --- зацикленные звуки: рывок, ветер, дождь ---
interface LoopHandle {
  gain: GainNode;
  stop: () => void;
}
const loops = new Map<SoundId, LoopHandle>();

/** Запускает (или меняет громкость) петлю; level 0..1. Фоновые петли требуют включённых «Фонових звуків». */
export function startFlockLoop(id: SoundId, level = 1) {
  const def = SOUNDS[id];
  if (!audible() || !(def.loop || def.music)) return;
  if (def.ambient && !getFlockSoundSettings().ambient) {
    stopFlockLoop(id);
    return;
  }
  const c = ctx as AudioContext;
  const target = def.gain * level;
  const cur = loops.get(id);
  if (cur) {
    cur.gain.gain.setTargetAtTime(target, c.currentTime, 0.15);
    return;
  }
  if (loops.size >= MAX_LOOPS) return;
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(master as GainNode);
  g.gain.setTargetAtTime(target, c.currentTime, 0.2);
  const buf = buffers.get(id);
  const nodes: AudioScheduledSourceNode[] = [];
  if (buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    src.start();
    nodes.push(src);
  } else if (def.loop) {
    const handle = def.loop({ ctx: c, out: g, t: c.currentTime, pitch: 1, noise: getNoise() });
    nodes.push(...handle);
  }
  loops.set(id, {
    gain: g,
    stop: () => {
      const now = c.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.12);
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            /* ignore */
          }
        }
        try {
          g.disconnect();
        } catch {
          /* ignore */
        }
      }, 700);
    },
  });
}

export function stopFlockLoop(id: SoundId) {
  const h = loops.get(id);
  if (!h) return;
  loops.delete(id);
  h.stop();
}

export function stopAllLoops() {
  for (const id of Array.from(loops.keys())) stopFlockLoop(id);
}
