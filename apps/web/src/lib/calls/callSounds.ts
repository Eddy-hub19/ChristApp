/**
 * Мелодии звонка (пока приложение открыто): исходящий гудок у звонящего и входящий рингтон у получателя.
 * Пока звук - синтез Web Audio (две-три мягкие ноты и пауза в петле). Реестр подменяемый: позже сюда можно
 * зарегистрировать проигрыватель обычного аудиофайла (`registerCallSound`), остальной код не изменится.
 *
 * Правила: аудио разблокируется первым касанием в приложении (до этого воспроизведение молча пропускается),
 * не играем при скрытой вкладке, останавливаемся при любом завершении звонка, громкость умеренная.
 * Любая ошибка звука проглатывается: экран входящего звонка показывается независимо от звука.
 */

export type CallSoundKind = "outgoing" | "incoming";

export interface CallSoundPlayer {
  /** Запускает петлю (повторный вызов - no-op). */
  start(): void;
  stop(): void;
}

export type CallSoundFactory = (audio: CallAudio) => CallSoundPlayer;

/** Что фабрике нужно от окружения: готовый (разблокированный) контекст или null. */
export interface CallAudio {
  context(): AudioContext | null;
}

const MASTER_GAIN = 0.55;

type Note = { freq: number; at: number; len: number; gain: number };

/** Одна «фраза» мелодии и период петли (мс): пауза = период минус длина фразы. */
const MELODIES: Record<CallSoundKind, { notes: Note[]; periodMs: number }> = {
  // входящий: три восходящие ноты (ми-соль-до), тёплая пауза
  incoming: {
    notes: [
      { freq: 659.25, at: 0, len: 0.34, gain: 0.2 },
      { freq: 783.99, at: 0.22, len: 0.34, gain: 0.2 },
      { freq: 1046.5, at: 0.44, len: 0.55, gain: 0.22 },
    ],
    periodMs: 2600,
  },
  // исходящий гудок: две ровные ноты (ре-ля) и длинная пауза, как «ожидание ответа»
  outgoing: {
    notes: [
      { freq: 587.33, at: 0, len: 0.42, gain: 0.16 },
      { freq: 880, at: 0.5, len: 0.42, gain: 0.16 },
    ],
    periodMs: 3400,
  },
};

function playNote(ctx: AudioContext, master: GainNode, note: Note, startAt: number) {
  // мягкий тембр: синус + тихая октава треугольником, плавная атака и затухание
  const t0 = startAt + note.at;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(note.gain, t0 + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.len);
  gain.connect(master);
  for (const [type, mult, level] of [["sine", 1, 1], ["triangle", 2, 0.18]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = level;
    osc.type = type;
    osc.frequency.setValueAtTime(note.freq * mult, t0);
    osc.connect(g);
    g.connect(gain);
    osc.start(t0);
    osc.stop(t0 + note.len + 0.05);
  }
}

/** Стандартный синтезатор: петля из фраз по `MELODIES[kind]`. */
export function createSynthPlayer(kind: CallSoundKind): CallSoundFactory {
  return (audio) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let master: GainNode | null = null;
    const phrase = () => {
      const ctx = audio.context();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended") void ctx.resume();
        if (!master) {
          master = ctx.createGain();
          master.gain.value = MASTER_GAIN;
          master.connect(ctx.destination);
        }
        const now = ctx.currentTime + 0.02;
        for (const note of MELODIES[kind].notes) playNote(ctx, master, note, now);
      } catch {
        // звук недоступен: экран звонка работает и без него
      }
    };
    return {
      start() {
        if (timer !== null) return;
        phrase();
        timer = setInterval(phrase, MELODIES[kind].periodMs);
      },
      stop() {
        if (timer !== null) clearInterval(timer);
        timer = null;
        try {
          master?.disconnect();
        } catch {
          // ignore
        }
        master = null;
      },
    };
  };
}

const registry: Record<CallSoundKind, CallSoundFactory> = {
  incoming: createSynthPlayer("incoming"),
  outgoing: createSynthPlayer("outgoing"),
};

/** Подменяет проигрыватель звука (например, на файл с лицензией CC0). `null` возвращает синтез по умолчанию. */
export function registerCallSound(kind: CallSoundKind, factory: CallSoundFactory | null) {
  registry[kind] = factory ?? createSynthPlayer(kind);
}

// ---------- разблокировка аудио первым касанием ----------

let ctx: AudioContext | null = null;
let unlockInstalled = false;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

const audio: CallAudio = {
  // контекст отдаём только после первого касания: до него браузер всё равно не разрешит звук
  context: () => (unlocked ? ctx : null),
};
let unlocked = false;

/** Вешает одноразовые слушатели первого касания/клавиши: после них звук разрешён. Безопасно звать повторно. */
export function installCallAudioUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const events = ["pointerdown", "touchend", "keydown", "click"] as const;
  const unlock = () => {
    const c = ensureContext();
    if (c) {
      void c.resume().catch(() => undefined);
      unlocked = true;
    }
    for (const e of events) window.removeEventListener(e, unlock, true);
  };
  for (const e of events) window.addEventListener(e, unlock, { capture: true, passive: true });
}

// ---------- управление петлёй ----------

let current: { kind: CallSoundKind; player: CallSoundPlayer } | null = null;
let wanted: CallSoundKind | null = null;
let visibilityBound = false;

function applyVisibility() {
  if (!current && wanted && document.visibilityState === "visible") begin(wanted);
  else if (current && document.visibilityState !== "visible") end();
}

function begin(kind: CallSoundKind) {
  if (current) return;
  try {
    const player = registry[kind](audio);
    current = { kind, player };
    player.start();
  } catch {
    current = null;
  }
}

function end() {
  const c = current;
  current = null;
  try {
    c?.player.stop();
  } catch {
    // ignore
  }
}

/** Запускает мелодию в петле. Скрытая вкладка или не разблокированное аудио: молча пропускаем (повторно не запускаем из тишины сами). */
export function startCallSound(kind: CallSoundKind) {
  if (typeof document === "undefined") return;
  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener("visibilitychange", applyVisibility);
  }
  if (current?.kind === kind) return;
  end();
  wanted = kind;
  if (document.visibilityState !== "visible" || !unlocked) return;
  begin(kind);
}

/** Останавливает любую мелодию звонка (ответ, отказ, отмена, таймаут, закрытие). */
export function stopCallSound() {
  wanted = null;
  end();
}
