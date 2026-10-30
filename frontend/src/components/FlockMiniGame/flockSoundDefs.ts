/**
 * Реестр звуков «Отари»: каждый звук - маленький синтезатор (осцилляторы, шум, огибающие, фильтры).
 *
 * Как заменить звук готовым файлом: в записи нужного звука добавьте `file: "/sounds/flock/<имя>"` (без расширения;
 * кладите <имя>.ogg и, для старых Safari, <имя>.mp3 в public/sounds/flock/ и запишите источник/лицензию в CREDITS.md). Движок сам подгрузит его при первом включении звука и будет играть вместо синтеза;
 * если файл не загрузился - сыграет синтез. Код, который вызывает звук (playFlockSound / startFlockLoop), не меняется.
 * Для зацикленных звуков (ветер, дождь, рывок) файл должен быть бесшовной петлёй.
 */

export interface SynthEnv {
  ctx: AudioContext;
  /** Куда подключать звук (громкость голоса, панорама и общий мастер уже за ним). */
  out: AudioNode;
  /** Время старта (ctx.currentTime + задержка). */
  t: number;
  /** Множитель высоты (разброс + параметр вызова). */
  pitch: number;
  /** Общий буфер белого шума (переиспользуется). */
  noise: AudioBuffer;
}

export interface SoundDef {
  /** Играет звук и возвращает его длительность в секундах. */
  synth: (e: SynthEnv) => number;
  /** Для петель: запускает источники, подключённые к e.out, и возвращает их для остановки. */
  loop?: (e: SynthEnv) => AudioScheduledSourceNode[];
  /** Готовый файл вместо синтеза: путь от корня сайта БЕЗ расширения (грузится .ogg, если не декодируется - .mp3). Лицензии: public/sounds/flock/CREDITS.md. */
  file?: string;
  /** Базовая громкость голоса, 0..1. */
  gain: number;
  /** Не чаще раза в N мс (частые звуки). */
  minGapMs?: number;
  /** Случайный разброс высоты (±доля). */
  jitter?: number;
  /** Фоновый звук (включается отдельным переключателем). */
  ambient?: boolean;
}

// --- кирпичики ---
type Wave = OscillatorType;

/** Тон: частота f0 -> f1 (экспонента) за dur; быстрая атака и плавный спад. */
function tone(e: SynthEnv, type: Wave, f0: number, f1: number, at: number, dur: number, peak: number, attack = 0.006) {
  const o = e.ctx.createOscillator();
  const g = e.ctx.createGain();
  const t0 = e.t + at;
  o.type = type;
  o.frequency.setValueAtTime(f0 * e.pitch, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1 * e.pitch, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(e.out);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Всплеск шума через фильтр (центр f0 -> f1). */
function noiseBurst(e: SynthEnv, ftype: BiquadFilterType, f0: number, f1: number, q: number, at: number, dur: number, peak: number, attack = 0.004) {
  const src = e.ctx.createBufferSource();
  const f = e.ctx.createBiquadFilter();
  const g = e.ctx.createGain();
  const t0 = e.t + at;
  src.buffer = e.noise;
  f.type = ftype;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(e.out);
  src.start(t0, Math.random() * 0.8, dur + 0.02);
}

/** Петля шума через фильтр; возвращает источники (шум и, если есть, LFO). */
function noiseLoop(e: SynthEnv, ftype: BiquadFilterType, freq: number, q: number, lfoHz = 0, lfoDepth = 0): AudioScheduledSourceNode[] {
  const src = e.ctx.createBufferSource();
  const f = e.ctx.createBiquadFilter();
  src.buffer = e.noise;
  src.loop = true;
  f.type = ftype;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f);
  f.connect(e.out);
  src.start();
  const nodes: AudioScheduledSourceNode[] = [src];
  if (lfoHz > 0) {
    const lfo = e.ctx.createOscillator();
    const d = e.ctx.createGain();
    lfo.frequency.value = lfoHz;
    d.gain.value = lfoDepth;
    lfo.connect(d);
    d.connect(f.frequency);
    lfo.start();
    nodes.push(lfo);
  }
  return nodes;
}

/** Нота колокольчика: основной тон + обертон, длинный спад. */
function bell(e: SynthEnv, freq: number, at: number, dur: number, peak: number) {
  tone(e, "sine", freq, freq, at, dur, peak);
  tone(e, "sine", freq * 2.76, freq * 2.76, at, dur * 0.5, peak * 0.3);
}

export type SoundId =
  | "eatGrass"
  | "eatFlower"
  | "eatCell"
  | "eaten"
  | "bonus"
  | "bonusEnd"
  | "split"
  | "throw"
  | "sprint"
  | "spawnBoost"
  | "death"
  | "burn"
  | "revive"
  | "starWarn"
  | "starFall"
  | "starPick"
  | "wind"
  | "rain"
  | "scissors"
  | "pipe"
  | "freeze"
  | "bossHorn"
  | "phrase"
  | "click"
  | "coins";

export const SOUNDS: Record<SoundId, SoundDef> = {
  eatGrass: {
    file: "/sounds/flock/eat-grass",
    gain: 0.7,
    minGapMs: 60,
    jitter: 0.14,
    synth: (e) => {
      tone(e, "sine", 520, 300, 0, 0.07, 0.4);
      noiseBurst(e, "lowpass", 900, 500, 0.7, 0, 0.04, 0.08);
      return 0.08;
    },
  },
  eatFlower: {
    file: "/sounds/flock/eat-flower",
    gain: 0.7,
    minGapMs: 60,
    jitter: 0.12,
    synth: (e) => {
      tone(e, "sine", 780, 540, 0, 0.09, 0.36);
      tone(e, "triangle", 1170, 1170, 0, 0.06, 0.1);
      return 0.1;
    },
  },
  eatCell: {
    gain: 0.85,
    minGapMs: 90,
    jitter: 0.08,
    synth: (e) => {
      tone(e, "sine", 230, 105, 0, 0.24, 0.6);
      tone(e, "triangle", 340, 170, 0, 0.16, 0.25);
      noiseBurst(e, "lowpass", 500, 250, 0.7, 0, 0.1, 0.12);
      return 0.26;
    },
  },
  eaten: {
    gain: 0.8,
    minGapMs: 150,
    synth: (e) => {
      tone(e, "triangle", 280, 90, 0, 0.36, 0.5);
      tone(e, "sine", 140, 60, 0, 0.3, 0.3);
      return 0.38;
    },
  },
  bonus: {
    file: "/sounds/flock/bonus",
    gain: 0.7,
    minGapMs: 120,
    synth: (e) => {
      tone(e, "triangle", 523, 523, 0, 0.45, 0.28);
      tone(e, "triangle", 659, 659, 0.05, 0.45, 0.26);
      tone(e, "triangle", 784, 784, 0.1, 0.5, 0.26);
      tone(e, "sine", 1047, 1047, 0.15, 0.45, 0.14);
      return 0.65;
    },
  },
  bonusEnd: {
    gain: 0.55,
    minGapMs: 200,
    synth: (e) => {
      tone(e, "sine", 660, 330, 0, 0.35, 0.28);
      return 0.37;
    },
  },
  split: {
    gain: 0.7,
    minGapMs: 120,
    synth: (e) => {
      noiseBurst(e, "bandpass", 600, 1500, 1.2, 0, 0.12, 0.2);
      tone(e, "sine", 380, 720, 0, 0.1, 0.3);
      return 0.14;
    },
  },
  throw: {
    gain: 0.6,
    minGapMs: 70,
    jitter: 0.08,
    synth: (e) => {
      tone(e, "sine", 520, 240, 0, 0.1, 0.3);
      noiseBurst(e, "highpass", 2500, 2500, 0.7, 0, 0.05, 0.08);
      return 0.12;
    },
  },
  sprint: {
    gain: 0.5,
    ambient: false,
    synth: () => 0,
    loop: (e) => noiseLoop(e, "bandpass", 1100, 0.9, 7, 250),
  },
  spawnBoost: {
    gain: 0.6,
    minGapMs: 500,
    synth: (e) => {
      noiseBurst(e, "bandpass", 400, 2200, 1, 0, 0.5, 0.22, 0.12);
      tone(e, "sine", 300, 700, 0, 0.4, 0.2, 0.08);
      return 0.55;
    },
  },
  death: {
    file: "/sounds/flock/death",
    gain: 0.85,
    minGapMs: 300,
    synth: (e) => {
      tone(e, "triangle", 440, 80, 0, 0.8, 0.5, 0.01);
      tone(e, "sine", 220, 55, 0, 0.9, 0.4, 0.01);
      return 0.95;
    },
  },
  burn: {
    gain: 0.7,
    minGapMs: 120,
    synth: (e) => {
      noiseBurst(e, "bandpass", 5200, 2600, 0.8, 0, 0.65, 0.3, 0.02);
      tone(e, "sine", 180, 70, 0, 0.3, 0.2);
      return 0.7;
    },
  },
  revive: {
    file: "/sounds/flock/revive",
    gain: 0.8,
    minGapMs: 500,
    synth: (e) => {
      const notes = [392, 523, 659, 784];
      notes.forEach((f, i) => tone(e, "triangle", f, f, i * 0.09, 0.5, 0.28));
      tone(e, "sine", 1047, 1047, 0.36, 0.6, 0.15);
      return 1;
    },
  },
  starWarn: {
    file: "/sounds/flock/star-warn",
    gain: 0.75,
    minGapMs: 800,
    synth: (e) => {
      bell(e, 1319, 0, 0.9, 0.25);
      bell(e, 1760, 0.28, 1, 0.22);
      return 1.3;
    },
  },
  starFall: {
    gain: 0.5,
    minGapMs: 80,
    synth: (e) => {
      tone(e, "sine", 2200, 900, 0, 0.42, 0.1, 0.05);
      bell(e, 1976, 0.42, 0.5, 0.2);
      return 0.95;
    },
  },
  starPick: {
    file: "/sounds/flock/star-pick",
    gain: 0.8,
    minGapMs: 100,
    synth: (e) => {
      tone(e, "sine", 1568, 1568, 0, 0.45, 0.22);
      tone(e, "sine", 2093, 2093, 0.06, 0.45, 0.2);
      tone(e, "sine", 2637, 2637, 0.12, 0.5, 0.18);
      return 0.65;
    },
  },
  wind: {
    file: "/sounds/flock/wind",
    gain: 0.45,
    ambient: true,
    synth: () => 0,
    loop: (e) => noiseLoop(e, "bandpass", 380, 0.6, 0.18, 160),
  },
  rain: {
    file: "/sounds/flock/rain",
    gain: 0.22,
    ambient: true,
    synth: () => 0,
    loop: (e) => {
      const nodes = noiseLoop(e, "highpass", 1400, 0.5);
      return nodes;
    },
  },
  scissors: {
    file: "/sounds/flock/scissors",
    gain: 0.8,
    minGapMs: 150,
    synth: (e) => {
      noiseBurst(e, "highpass", 4000, 4000, 0.7, 0, 0.03, 0.4, 0.001);
      tone(e, "square", 2600, 1800, 0, 0.03, 0.08, 0.001);
      noiseBurst(e, "highpass", 4500, 4500, 0.7, 0.08, 0.03, 0.4, 0.001);
      tone(e, "square", 2800, 2000, 0.08, 0.03, 0.08, 0.001);
      return 0.14;
    },
  },
  pipe: {
    gain: 0.7,
    minGapMs: 300,
    synth: (e) => {
      tone(e, "triangle", 784, 784, 0, 0.26, 0.28, 0.03);
      tone(e, "triangle", 988, 988, 0.22, 0.34, 0.28, 0.03);
      return 0.58;
    },
  },
  freeze: {
    gain: 0.7,
    minGapMs: 200,
    synth: (e) => {
      tone(e, "sine", 2349, 2349, 0, 0.8, 0.14);
      tone(e, "sine", 3136, 3136, 0.05, 0.8, 0.12);
      tone(e, "sine", 3951, 3951, 0.11, 0.9, 0.1);
      noiseBurst(e, "highpass", 6000, 6000, 0.7, 0, 0.1, 0.06);
      return 1;
    },
  },
  bossHorn: {
    file: "/sounds/flock/boss-horn",
    gain: 0.85,
    minGapMs: 800,
    synth: (e) => {
      const f = e.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 520;
      f.connect(e.out);
      for (const hz of [98, 147]) {
        const o = e.ctx.createOscillator();
        const g = e.ctx.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(hz * e.pitch * 1.06, e.t);
        o.frequency.exponentialRampToValueAtTime(hz * e.pitch, e.t + 0.25);
        g.gain.setValueAtTime(0.0001, e.t);
        g.gain.linearRampToValueAtTime(0.3, e.t + 0.12);
        g.gain.setValueAtTime(0.3, e.t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, e.t + 1.3);
        o.connect(g);
        g.connect(f);
        o.start(e.t);
        o.stop(e.t + 1.35);
      }
      return 1.4;
    },
  },
  phrase: {
    file: "/sounds/flock/sheep",
    gain: 0.55,
    minGapMs: 400,
    synth: (e) => {
      tone(e, "sine", 880, 1040, 0, 0.1, 0.22, 0.01);
      return 0.12;
    },
  },
  click: {
    file: "/sounds/flock/click",
    gain: 0.6,
    minGapMs: 30,
    synth: (e) => {
      tone(e, "sine", 1250, 880, 0, 0.04, 0.22, 0.002);
      return 0.05;
    },
  },
  coins: {
    file: "/sounds/flock/coins",
    gain: 0.75,
    minGapMs: 200,
    synth: (e) => {
      [1568, 2093, 1568, 2637].forEach((f, i) => {
        tone(e, "triangle", f, f, i * 0.07, 0.22, 0.2, 0.002);
        tone(e, "sine", f * 2, f * 2, i * 0.07, 0.12, 0.05, 0.002);
      });
      return 0.55;
    },
  },
};
