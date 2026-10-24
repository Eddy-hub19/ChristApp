export type SkinKind = "sheep" | "lamb" | "ram" | "wolf" | "dog";

/** Прикраса поверх базового вигляду (платні скіни). */
export type SkinDeco = "wreath" | "bell" | "cloud" | "gold" | "wolfwool" | "stars" | "angel" | "rainbow" | "frost" | "sun" | "david" | "polar"
  // «особливі» (24..33), статичні
  | "crystal" | "cactus" | "mushroom" | "lava" | "galaxy" | "storm" | "robot" | "sushi" | "leaves" | "candy"
  // платные обычные (34, 35), статичные
  | "hearts" | "mint"
  // преміум-ряд 2 (анімовані, шари-спрайти)
  | "phoenix" | "moon" | "bloom" | "newyear" | "butterfly" | "thunder"
  // «Вожак» (36): бот-босс, вне NUM_SKINS - игрок его выбрать не может
  | "alpha";

/** Легка анімація преміум-скіна: кілька готових кадрів шару-спрайта (без обчислень на кадр). */
export interface SkinAnim {
  /** Кількість кадрів (2-6). */
  frames: number;
  /** Кадрів за секунду. */
  fps: number;
}

export interface Skin {
  kind: SkinKind;
  deco?: SkinDeco;
  /** Анімація (лише преміум). */
  anim?: SkinAnim;
  /** Колір вовни для "вовка в овечій шкурі". */
  wool?: string;
  /** Основний колір шерсті/хутра. */
  fur: string;
  /** Світліший відблиск. */
  light: string;
  /** Колір мордочки. */
  face: string;
  /** Акцент (щічки, язик, ріг). */
  accent: string;
}

/** Порядок = номер скіна на сервері (NUM_SKINS = 41: 0-11 безкоштовні (+ 37-40 нові вовки), 12-17 платні, 18-23 преміум, 24-33 особливі, 34-35 платні (звичайні, у тому ж ряду лобі, що й 12-17)). Назви - у перекладах flock.skins.<id>. */
export const SKINS: Skin[] = [
  { kind: "sheep", fur: "#f6f1e7", light: "#ffffff", face: "#3b3532", accent: "#f2a7b3" },
  { kind: "sheep", fur: "#f7c6d3", light: "#ffe4ec", face: "#4a3440", accent: "#f08aa4" },
  { kind: "sheep", fur: "#bcd8f5", light: "#e3f1ff", face: "#33404f", accent: "#f2a7b3" },
  { kind: "sheep", fur: "#fbe69a", light: "#fff6cf", face: "#4a4128", accent: "#f2a7b3" },
  { kind: "sheep", fur: "#bfeacb", light: "#e5f9ea", face: "#2f4a3b", accent: "#f2a7b3" },
  { kind: "sheep", fur: "#d9c8f2", light: "#efe6fb", face: "#413552", accent: "#f2a7b3" },
  { kind: "lamb", fur: "#fff3df", light: "#ffffff", face: "#d9a58a", accent: "#ffa3a8" },
  { kind: "ram", fur: "#ece0c8", light: "#fbf4e4", face: "#4b3a30", accent: "#9b7a52" },
  { kind: "wolf", fur: "#8c929c", light: "#b4bac4", face: "#d3d6db", accent: "#f3d65c" },
  { kind: "wolf", fur: "#3a3d45", light: "#5a5e68", face: "#7b7f89", accent: "#f0a43a" },
  { kind: "dog", fur: "#b97a45", light: "#d99a63", face: "#f4e7d3", accent: "#f07d8c" },
  { kind: "sheep", fur: "#f9c89a", light: "#ffe3c8", face: "#4a3a2c", accent: "#f2a7b3" },
  // --- платні (12..17), по 20 рубінів ---
  { kind: "sheep", deco: "wreath", fur: "#f6f1e7", light: "#ffffff", face: "#3b3532", accent: "#f2a7b3" },
  { kind: "ram", deco: "bell", fur: "#f3e8d2", light: "#fff8e8", face: "#4b3a30", accent: "#c79a5b" },
  { kind: "lamb", deco: "cloud", fur: "#dcecff", light: "#ffffff", face: "#8aa3c4", accent: "#ff9fb0" },
  { kind: "sheep", deco: "gold", fur: "#f2c344", light: "#fff0a8", face: "#5a3d12", accent: "#ffd86b" },
  { kind: "wolf", deco: "wolfwool", wool: "#f6f1e7", fur: "#6f7580", light: "#9aa0ab", face: "#cfd3d9", accent: "#f3d65c" },
  { kind: "sheep", deco: "stars", fur: "#27305e", light: "#4a57a0", face: "#c9cdf2", accent: "#ffd86b" },
  // --- преміум (18..23), по 60 рубінів, з легкою анімацією ---
  { kind: "lamb", deco: "angel", anim: { frames: 4, fps: 6 }, fur: "#fffaf0", light: "#ffffff", face: "#e8b9a0", accent: "#ffb3c0" },
  { kind: "sheep", deco: "rainbow", anim: { frames: 8, fps: 5 }, fur: "#fbf6f0", light: "#ffffff", face: "#3e3a45", accent: "#f2a7b3" },
  { kind: "sheep", deco: "frost", anim: { frames: 4, fps: 3 }, fur: "#cfe6fb", light: "#f3faff", face: "#3d5a78", accent: "#ffb6c5" },
  { kind: "ram", deco: "sun", anim: { frames: 4, fps: 5 }, fur: "#f7e3a6", light: "#fff6d2", face: "#5a3d12", accent: "#e0a41f" },
  { kind: "lamb", deco: "david", anim: { frames: 2, fps: 3 }, fur: "#fff1d6", light: "#ffffff", face: "#d9a58a", accent: "#ffa3a8" },
  { kind: "wolf", deco: "polar", anim: { frames: 3, fps: 3 }, fur: "#e3ebf4", light: "#ffffff", face: "#c3d5e8", accent: "#5cd6ff" },
  // --- особливі (24..33), по 40 рубінів, статичні ---
  { kind: "sheep", deco: "crystal", fur: "#eceaf6", light: "#ffffff", face: "#2b2326", accent: "#f6a9c0" },
  { kind: "sheep", deco: "cactus", fur: "#86b48a", light: "#b5d9b3", face: "#1f2a23", accent: "#f6a9c0" },
  { kind: "sheep", deco: "mushroom", fur: "#f6ead8", light: "#ffffff", face: "#3a2620", accent: "#f2a0a8" },
  { kind: "sheep", deco: "lava", fur: "#4b3532", light: "#7a5242", face: "#17110f", accent: "#f6a9a0" },
  { kind: "sheep", deco: "galaxy", fur: "#2a2c80", light: "#4d54b8", face: "#d8d4f5", accent: "#f6a9d0" },
  { kind: "sheep", deco: "storm", fur: "#e9ecf2", light: "#ffffff", face: "#232630", accent: "#f6a9c0" },
  { kind: "sheep", deco: "robot", fur: "#e4dfd2", light: "#ffffff", face: "#1d2030", accent: "#ff9db0" },
  { kind: "sheep", deco: "sushi", fur: "#f8f5ea", light: "#ffffff", face: "#2c2321", accent: "#f6a9b0" },
  { kind: "sheep", deco: "leaves", fur: "#f1d9a8", light: "#fff0cc", face: "#3a2618", accent: "#f0a070" },
  { kind: "sheep", deco: "candy", fur: "#fff1f4", light: "#ffffff", face: "#17151a", accent: "#ff8fb0" },
  // --- платні звичайні (34, 35), по 20 рубінів, статичні; в лобі стоять у ряду з 12..17 ---
  { kind: "sheep", deco: "hearts", fur: "#2b2326", light: "#40343a", face: "#17110f", accent: "#f6a6b8" },
  { kind: "sheep", deco: "mint", fur: "#bfe6dc", light: "#e4f6f1", face: "#1f2c2b", accent: "#f6a6b8" },
  // --- «Вожак» (36): тёмный волк с золотой короной, красные глаза ---
  { kind: "wolf", deco: "alpha", fur: "#24262e", light: "#454958", face: "#6c707c", accent: "#ff3b3b" },
  // --- нові безкоштовні вовки (37..40), статичні ---
  { kind: "wolf", fur: "#8a5a3b", light: "#b07a54", face: "#e3cdb2", accent: "#f3d65c" },
  { kind: "wolf", fur: "#eceff3", light: "#ffffff", face: "#d4dae2", accent: "#8fc9f2" },
  { kind: "wolf", fur: "#c4642b", light: "#e68b50", face: "#f1d9bd", accent: "#f3d65c" },
  { kind: "wolf", fur: "#6f8aa8", light: "#9fb6cf", face: "#cfdbe8", accent: "#f3d65c" },
];

/**
 * Преміум-ряд 2 (6 скінів з анімацією, 2-6 кадрів): намальовано, але НЕ підключено до SKINS/лобі/сервера,
 * доки не схвалено контактний лист (docs/img/flock-premium-row2.png).
 */
export const NEW_PREMIUM_SKINS: Skin[] = [
  { kind: "sheep", deco: "phoenix", anim: { frames: 4, fps: 6 }, fur: "#ffe7c4", light: "#fff6e3", face: "#4a2616", accent: "#ff8a3d" },
  { kind: "sheep", deco: "moon", anim: { frames: 4, fps: 3 }, fur: "#dfe6fb", light: "#ffffff", face: "#2b2f55", accent: "#ffe27a" },
  { kind: "sheep", deco: "bloom", anim: { frames: 6, fps: 4 }, fur: "#fff3f7", light: "#ffffff", face: "#4a3140", accent: "#f48fb1" },
  { kind: "sheep", deco: "newyear", anim: { frames: 4, fps: 3 }, fur: "#eef5ff", light: "#ffffff", face: "#2a3a4f", accent: "#ff6b6b" },
  { kind: "sheep", deco: "butterfly", anim: { frames: 4, fps: 6 }, fur: "#f3ecff", light: "#ffffff", face: "#3b2f52", accent: "#ff9ad5" },
  { kind: "ram", deco: "thunder", anim: { frames: 4, fps: 5 }, fur: "#8e9ab4", light: "#c7d0e4", face: "#262b3a", accent: "#ffd23f" },
];

export const SKIN_COUNT = SKINS.length;
/** Скин «Вожака» (бот-босс); в лобби его нет. */
export const BOSS_SKIN = 36;

export function skinOf(id: number): Skin {
  return SKINS[((id % SKINS.length) + SKINS.length) % SKINS.length];
}

/** Менший за цей екранний радіус (px) персонаж малюється без анімації: різницю не видно, а кеш і CPU економляться. */
export const ANIM_MIN_PX = 14;

/**
 * Номер кадру анімації у момент `time` (секунди). Без анімації - 0: у скіна її нема, увімкнено «зменшити рух»
 * або персонаж замалий. Кадри циклічні, тож цикл безшовний.
 */
export function animFrame(skin: Skin, time: number, opts: { reduceMotion?: boolean; rPx?: number } = {}): number {
  const a = skin.anim;
  if (!a || opts.reduceMotion) return 0;
  if (opts.rPx !== undefined && opts.rPx < ANIM_MIN_PX) return 0;
  return Math.floor(Math.max(0, time) * a.fps) % a.frames;
}
