import type createSocket from "socket.io-client";

export type GuessLang = "ua" | "ru" | "en";
export type Localized = Record<GuessLang, string>;
export type GuessLevel = 1 | 2 | 3;
export type GuessMode = "duel" | "solo";
export type GuessPhase = "lobby" | "picking" | "asking" | "roundEnd" | "matchEnd";
export type TraitAnswer = "yes" | "no" | "unknown";

export type CatalogCharacter = { id: string; difficulty: 1 | 2 | 3; name: Localized };
export type CatalogTrait = { id: string; group: string };
export type GuessCatalog = {
  characters: CatalogCharacter[];
  traits: CatalogTrait[];
  groups: string[];
  maxQuestions: number;
  rounds: number;
};

export type HistoryEntry =
  | { kind: "question"; trait: string; answer: TraitAnswer }
  | { kind: "guess"; character: string; correct: boolean };

export type BibleRefInfo = {
  book: number;
  chapter: number;
  verses: string | null;
  label: Localized;
};

export type RoundReveal = {
  round: number;
  hiderId: string | null;
  guesserId: string;
  characterId: string;
  guessed: boolean;
  attempts: number;
  points: number;
  card: { id: string; name: Localized; about: Localized; refs: BibleRefInfo[] };
};

export type MatchLogEntry = { n: number; winner: string | null; scores: Record<string, number> };

/** Знімок сесії від сервера: сервер — єдине джерело істини, таємний персонаж тут лише для загадувача. */
export type GuessSessionState = {
  roomId: string;
  mode: GuessMode;
  players: string[];
  level: GuessLevel;
  phase: GuessPhase;
  ready: Record<string, boolean>;
  present: Record<string, boolean>;
  round: number;
  rounds: number;
  maxQuestions: number;
  hiderId: string | null;
  guesserId: string | null;
  scores: Record<string, number>;
  history: HistoryEntry[];
  secretId: string | null;
  candidates: string[] | null;
  reveal: RoundReveal | null;
  results: Array<Omit<RoundReveal, "card">>;
  matchWinner: string | null;
  matches: MatchLogEntry[];
  serverTime: number;
};

/** Той самий тип, що створює `io()` у socket.io-client (так само задано SnakeSocket). */
export type GuessSocket = ReturnType<typeof createSocket>;
