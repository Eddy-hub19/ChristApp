import type createSocket from "socket.io-client";

export type PuzzleLang = "ua" | "ru" | "en";
export type Localized = Record<PuzzleLang, string>;
export type PuzzleMode = "duel" | "solo";
export type PuzzlePhase = "lobby" | "playing" | "done";
export type SelectionMode = "random" | "byName";
export type PieceCount = 12 | 24 | 48 | 96;

export type PuzzleImage = {
  id: string;
  characterIds: string[];
  file: string;
  width: number;
  height: number;
  title: string;
  author: string;
  year: number;
  license: string;
  licenseUrl: string | null;
  commonsTitle: string;
  sourceUrl: string;
};

export type CatalogCharacter = { id: string; name: Localized; imageIds: string[] };
export type PuzzleCatalog = {
  counts: PieceCount[];
  characters: CatalogCharacter[];
  images: PuzzleImage[];
};

export type BibleRefInfo = { book: number; chapter: number; verses: string | null; label: Localized };
export type CharacterCard = { id: string; name: Localized; about: Localized; refs: BibleRefInfo[] };

export type PuzzleGroup = {
  id: number;
  pieces: number[];
  x: number;
  y: number;
  placed: boolean;
  heldBy: string | null;
};

export type PuzzleState = {
  seed: number;
  imageId: string;
  cols: number;
  rows: number;
  boardW: number;
  boardH: number;
  cw: number;
  ch: number;
  world: { minX: number; minY: number; maxX: number; maxY: number };
  startedAt: number;
  finishedAt: number | null;
  /** Від нижнього шару до верхнього. */
  groups: PuzzleGroup[];
};

/** Знімок сесії від сервера: сервер — єдине джерело істини (позиції, групи, хто що тримає). */
export type PuzzleSessionState = {
  roomId: string;
  mode: PuzzleMode;
  players: string[];
  creatorId: string;
  present: Record<string, boolean>;
  phase: PuzzlePhase;
  count: PieceCount;
  counts: PieceCount[];
  selection: { mode: SelectionMode; characterId: string; imageId: string } | null;
  puzzle: PuzzleState | null;
  reveal: {
    image: PuzzleImage;
    card: CharacterCard | null;
    elapsedMs: number;
    placedBy: Record<string, number>;
  } | null;
  serverTime: number;
};

export type PuzzleMoveEvent = { roomId: string; groupId: number; x: number; y: number; by: string };
export type PuzzleCursorEvent = { roomId: string; x: number; y: number; by: string };
export type PuzzleJoinEvent = { roomId: string; type: "join" | "done"; by: string };

/** Той самий тип, що створює `io()` у socket.io-client (так само задано GuessSocket). */
export type PuzzleSocket = ReturnType<typeof createSocket>;
