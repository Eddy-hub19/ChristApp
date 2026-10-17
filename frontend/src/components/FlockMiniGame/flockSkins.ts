export type SkinKind = "sheep" | "lamb" | "ram" | "wolf" | "dog";

/** Прикраса поверх базового вигляду (платні скіни). */
export type SkinDeco = "wreath" | "bell" | "cloud" | "gold" | "wolfwool" | "stars";

export interface Skin {
  kind: SkinKind;
  deco?: SkinDeco;
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

/** Порядок = номер скіна на сервері (NUM_SKINS = 12). Назви - у перекладах flock.skins.<id>. */
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
];

export const SKIN_COUNT = SKINS.length;

export function skinOf(id: number): Skin {
  return SKINS[((id % SKINS.length) + SKINS.length) % SKINS.length];
}
