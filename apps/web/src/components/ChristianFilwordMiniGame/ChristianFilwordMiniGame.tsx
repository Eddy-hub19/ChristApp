"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import styles from "./ChristianFilwordMiniGame.module.scss";

type ChristianFilwordMiniGameProps = {
  open: boolean;
  onClose: () => void;
};

type WordEntry = {
  word: string;
  clue: string;
};

type Point = {
  row: number;
  col: number;
};

type Direction = {
  dr: number;
  dc: number;
};

type GeneratedPuzzle = {
  grid: string[][];
  entries: WordEntry[];
};

const DESKTOP_GRID_SIZE = 12;
const MOBILE_GRID_SIZE = 8;

const WORDS_RU: WordEntry[] = [
  { word: "ЛЮБОВЬ", clue: "Главная заповедь и сущность Бога." },
  {
    word: "ПУСТЫНЯ",
    clue: "Место, где произошло чудо умножения хлебов и рыб.",
  },
  { word: "МОЛИТВА", clue: "Тихий разговор человека с Создателем." },
  { word: "МАННА", clue: "Хлеб, сошедший с небес для израильтян." },
  {
    word: "ПАСТЫРЬ",
    clue: "Тот, кто ведет стадо и заботится о каждой овечке.",
  },
  { word: "АНГЕЛ", clue: "Вестник Божий, приносящий благую весть." },
  { word: "БЫТИЕ", clue: "Первая книга Библии о начале всего." },
  {
    word: "БЛАГОДАТЬ",
    clue: "Дар Божий, который дается даром, а не по заслугам.",
  },
  { word: "ГОЛУБЬ", clue: "Символ мира, прилетевший к Ною после потопа." },
  { word: "СИНАЙ", clue: "Гора, на которой Моисей получил скрижали Завета." },
];
const WORDS_UA: WordEntry[] = [
  { word: "ЛЮБОВ", clue: "Головна заповідь і суть Бога." },
  { word: "ПУСТЕЛЯ", clue: "Місце, де сталося чудо розмноження хлібів і риби." },
  { word: "МОЛИТВА", clue: "Тиха розмова людини зі Створителем." },
  { word: "МАННА", clue: "Хліб, що зійшов з неба для ізраїльтян." },
  { word: "ПАСТИР", clue: "Той, хто веде стадо й дбає про кожну овечку." },
  { word: "АНГЕЛ", clue: "Вісник Божий, що приносить добру новину." },
  { word: "БУТТЯ", clue: "Перша книга Біблії про початок усього." },
  { word: "БЛАГОДАТЬ", clue: "Дар Божий, що даний задарма, а не за заслуги." },
  { word: "ГОЛУБ", clue: "Символ миру, що прилетів до Ноя після потопу." },
  { word: "СІНАЙ", clue: "Гора, на якій Мойсей отримав скрижалі Завіту." },
];

const WORDS_EN: WordEntry[] = [
  { word: "LOVE", clue: "The greatest commandment and the nature of God." },
  { word: "DESERT", clue: "Where the miracle of the loaves and fishes took place." },
  { word: "PRAYER", clue: "A quiet conversation between a person and the Creator." },
  { word: "MANNA", clue: "Bread that came down from heaven for the Israelites." },
  { word: "SHEPHERD", clue: "One who leads the flock and cares for every sheep." },
  { word: "ANGEL", clue: "God's messenger who brings good news." },
  { word: "GENESIS", clue: "The first book of the Bible, about the beginning of everything." },
  { word: "GRACE", clue: "God's gift, given freely and not for merit." },
  { word: "DOVE", clue: "A symbol of peace that flew to Noah after the flood." },
  { word: "SINAI", clue: "The mountain where Moses received the tablets of the Covenant." },
];


const DIRECTIONS: Direction[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: -1 },
  { dr: 1, dc: -1 },
];

const ALPHABETS: Record<"ru" | "ua" | "en", string[]> = {
  ru: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ".split(""),
  ua: "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ".split(""),
  en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
};
const WORDS: Record<"ru" | "ua" | "en", WordEntry[]> = { ru: WORDS_RU, ua: WORDS_UA, en: WORDS_EN };
/** Алфавит текущей генерации (задаётся в generatePuzzle: генерация синхронная). */
let fillAlphabet = ALPHABETS.ru;

function keyOf(point: Point) {
  return `${point.row}:${point.col}`;
}

function shuffled<T>(items: T[]) {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = clone[i];
    clone[i] = clone[j];
    clone[j] = temp;
  }
  return clone;
}

function isStraightLine(start: Point, end: Point) {
  const dr = end.row - start.row;
  const dc = end.col - start.col;
  return dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
}

function lineFromPoints(start: Point, end: Point, gridSize: number): Point[] {
  let dr = Math.sign(end.row - start.row);
  let dc = Math.sign(end.col - start.col);
  let length =
    Math.max(Math.abs(end.row - start.row), Math.abs(end.col - start.col)) + 1;

  if (!isStraightLine(start, end)) {
    // Снапимся к ближайшему из 8 направлений: угол вокруг старта, длина по проекции.
    const vr = end.row - start.row;
    const vc = end.col - start.col;
    const step = Math.round(Math.atan2(vr, vc) / (Math.PI / 4));
    dr = Math.round(Math.sin((step * Math.PI) / 4));
    dc = Math.round(Math.cos((step * Math.PI) / 4));
    const steps = Math.max(
      0,
      Math.round((vr * dr + vc * dc) / (dr * dr + dc * dc)),
    );
    length = steps + 1;
  }

  const points: Point[] = [];
  for (let i = 0; i < length; i += 1) {
    const row = start.row + dr * i;
    const col = start.col + dc * i;
    if (row < 0 || col < 0 || row >= gridSize || col >= gridSize) break;
    points.push({ row, col });
  }
  return points;
}

const NO_CELLS: ReadonlySet<string> = new Set();

function canPlaceWord(
  grid: string[][],
  gridSize: number,
  word: string,
  row: number,
  col: number,
  direction: Direction,
) {
  for (let i = 0; i < word.length; i += 1) {
    const r = row + direction.dr * i;
    const c = col + direction.dc * i;
    if (r < 0 || c < 0 || r >= gridSize || c >= gridSize) {
      return false;
    }
    const existing = grid[r][c];
    if (existing !== "" && existing !== word[i]) {
      return false;
    }
  }
  return true;
}

function placeWord(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  direction: Direction,
) {
  for (let i = 0; i < word.length; i += 1) {
    const r = row + direction.dr * i;
    const c = col + direction.dc * i;
    grid[r][c] = word[i];
  }
}

function fillGridWithRandomLetters(grid: string[][], gridSize: number) {
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (!grid[row][col]) {
        grid[row][col] =
          fillAlphabet[Math.floor(Math.random() * fillAlphabet.length)];
      }
    }
  }
}

function tryGenerateGrid(
  gridSize: number,
  entries: WordEntry[],
): string[][] | null {
  const grid = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => ""),
  );

  const words = [...entries]
    .map((entry) => entry.word)
    .sort((left, right) => right.length - left.length);

  for (const word of words) {
    let placed = false;

    for (let attempt = 0; attempt < 360 && !placed; attempt += 1) {
      const direction =
        DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const row = Math.floor(Math.random() * gridSize);
      const col = Math.floor(Math.random() * gridSize);

      if (!canPlaceWord(grid, gridSize, word, row, col, direction)) {
        continue;
      }

      placeWord(grid, word, row, col, direction);
      placed = true;
    }

    if (!placed) {
      return null;
    }
  }

  fillGridWithRandomLetters(grid, gridSize);
  return grid;
}

function generatePuzzle(gridSize: number, words: WordEntry[], alphabet: string[]): GeneratedPuzzle {
  fillAlphabet = alphabet;
  const eligibleEntries = words.filter(
    (entry) => entry.word.length <= gridSize,
  );

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const randomizedEntries = shuffled(eligibleEntries);
    const grid = tryGenerateGrid(gridSize, randomizedEntries);
    if (grid) {
      return {
        grid,
        entries: randomizedEntries,
      };
    }
  }

  // Fallback без рекурсии: уменьшаем количество слов, чтобы гарантировать старт игры.
  for (let keep = eligibleEntries.length - 1; keep >= 1; keep -= 1) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const reducedEntries = shuffled(eligibleEntries).slice(0, keep);
      const grid = tryGenerateGrid(gridSize, reducedEntries);
      if (grid) {
        return {
          grid,
          entries: reducedEntries,
        };
      }
    }
  }

  const emptyGrid = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => ""),
  );
  fillGridWithRandomLetters(emptyGrid, gridSize);

  return {
    grid: emptyGrid,
    entries: [],
  };
}

export default function ChristianFilwordMiniGame({
  open,
  onClose,
}: ChristianFilwordMiniGameProps) {
  const [seed, setSeed] = useState(0);
  const [selectedPath, setSelectedPath] = useState<Point[]>([]);
  const [found, setFound] = useState<{
    puzzle: GeneratedPuzzle | null;
    words: ReadonlySet<string>;
    cells: ReadonlySet<string>;
  }>({ puzzle: null, words: NO_CELLS, cells: NO_CELLS });
  const [flash, setFlash] = useState<{
    kind: "found" | "miss";
    keys: ReadonlySet<string>;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [gridSize, setGridSize] = useState(DESKTOP_GRID_SIZE);
  const t = useTranslations("filword");
  const locale = useLocale();
  const lang: "ru" | "ua" | "en" = locale === "ru" || locale === "en" ? locale : "ua";
  const words = WORDS[lang];

  const dragActiveRef = useRef(false);
  const backdropDownRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const lastVibrationSelectionLenRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const applyGridSize = () => {
      setGridSize(mediaQuery.matches ? MOBILE_GRID_SIZE : DESKTOP_GRID_SIZE);
    };

    applyGridSize();
    mediaQuery.addEventListener("change", applyGridSize);
    return () => {
      mediaQuery.removeEventListener("change", applyGridSize);
    };
  }, []);

  const puzzle = useMemo<GeneratedPuzzle>(() => {
    if (!open) {
      return {
        grid: Array.from({ length: gridSize }, () =>
          Array.from({ length: gridSize }, () => ""),
        ),
        entries: words.filter((entry) => entry.word.length <= gridSize),
      };
    }
    return generatePuzzle(gridSize, words, ALPHABETS[lang]);
  }, [gridSize, open, seed, words, lang]);

  const grid = puzzle.grid;
  const puzzleEntries = puzzle.entries;
  // Прогресс привязан к конкретной сгенерированной сетке: новая сетка → пусто.
  const foundWords = found.puzzle === puzzle ? found.words : NO_CELLS;
  const foundCells = found.puzzle === puzzle ? found.cells : NO_CELLS;

  const unresolvedWords = useMemo(
    () =>
      puzzleEntries
        .map((entry) => entry.word)
        .filter((word) => !foundWords.has(word)),
    [foundWords, puzzleEntries],
  );

  const progress =
    puzzleEntries.length > 0 ? foundWords.size / puzzleEntries.length : 0;

  const selectedWord = useMemo(
    () =>
      selectedPath.map((point) => grid[point.row]?.[point.col] ?? "").join(""),
    [grid, selectedPath],
  );

  useEffect(() => {
    if (!open) {
      dragActiveRef.current = false;
      startPointRef.current = null;
      setSelectedPath([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const showFlash = (kind: "found" | "miss", keys: ReadonlySet<string>) => {
    setFlash({ kind, keys });
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 450);
    if (typeof window.navigator?.vibrate === "function") {
      window.navigator.vibrate(kind === "found" ? [18, 40, 18] : 40);
    }
  };

  const resetGame = () => {
    setConfirmReset(false);
    setFlash(null);
    setSelectedPath([]);
    startPointRef.current = null;
    dragActiveRef.current = false;
    setSeed((prev) => prev + 1);
  };

  const vibrateLight = () => {
    if (typeof window === "undefined") return;
    if (typeof window.navigator?.vibrate !== "function") return;
    window.navigator.vibrate(10);
  };

  const maybeVibrateForCorrectPrefix = (wordCandidate: string) => {
    const nextLen = wordCandidate.length;
    if (nextLen <= lastVibrationSelectionLenRef.current) {
      return;
    }

    const hasPrefix = unresolvedWords.some(
      (word) => word.startsWith(wordCandidate) || word.endsWith(wordCandidate),
    );
    if (!hasPrefix) {
      return;
    }

    lastVibrationSelectionLenRef.current = nextLen;
    vibrateLight();
  };

  const updatePathFromClientPoint = (clientX: number, clientY: number) => {
    if (typeof document === "undefined") {
      return;
    }

    const element = document.elementFromPoint(clientX, clientY);
    const cellElement = element?.closest<HTMLButtonElement>(
      "[data-filword-cell='1']",
    );
    if (!cellElement) {
      return;
    }

    const row = Number(cellElement.dataset.row);
    const col = Number(cellElement.dataset.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return;
    }

    updatePath({ row, col });
  };

  const updatePath = (endPoint: Point) => {
    const startPoint = startPointRef.current;
    if (!startPoint) {
      return;
    }

    const nextPath = lineFromPoints(startPoint, endPoint, gridSize);
    setSelectedPath(nextPath);

    const nextWord = nextPath
      .map((point) => grid[point.row]?.[point.col] ?? "")
      .join("");
    maybeVibrateForCorrectPrefix(nextWord);
  };

  const completeSelection = () => {
    dragActiveRef.current = false;
    startPointRef.current = null;
    lastVibrationSelectionLenRef.current = 0;

    if (!selectedPath.length) {
      return;
    }

    const candidate = selectedPath
      .map((point) => grid[point.row]?.[point.col] ?? "")
      .join("");
    const reverse = candidate.split("").reverse().join("");

    const matchedWord = unresolvedWords.find(
      (word) => word === candidate || word === reverse,
    );
    if (!matchedWord) {
      // Одиночная клетка (простой тап) — не промах.
      if (selectedPath.length > 1) {
        showFlash("miss", new Set(selectedPath.map((point) => keyOf(point))));
      }
      setSelectedPath([]);
      return;
    }

    const pathKeys = selectedPath.map((point) => keyOf(point));
    setFound((prev) => {
      const base =
        prev.puzzle === puzzle
          ? prev
          : { puzzle, words: NO_CELLS, cells: NO_CELLS };
      const words = new Set(base.words);
      words.add(matchedWord);
      const cells = new Set(base.cells);
      for (const key of pathKeys) cells.add(key);
      return { puzzle, words, cells };
    });
    showFlash("found", new Set(pathKeys));
    setSelectedPath([]);
  };

  if (!open) {
    return null;
  }

  const selectedCellKeys = new Set(selectedPath.map((point) => keyOf(point)));
  const isWon =
    puzzleEntries.length > 0 && foundWords.size >= puzzleEntries.length;
  const isEmpty = puzzleEntries.length === 0;

  return (
    <div
      className={styles.overlay}
      onPointerMove={(event) => {
        if (!dragActiveRef.current) {
          return;
        }
        updatePathFromClientPoint(event.clientX, event.clientY);
      }}
      onPointerUp={completeSelection}
      onPointerCancel={completeSelection}
      onPointerDown={(event) => {
        backdropDownRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Закрываем только если и нажатие, и отпускание были на самом фоне.
        if (event.target === event.currentTarget && backdropDownRef.current) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
    >
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
      >
        <div className={styles.topRow}>
          <p className={styles.title}>{t("title")}</p>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>
            {t("found", { found: foundWords.size, total: puzzleEntries.length })}
          </span>
          {confirmReset ? (
            <span className={styles.confirmGroup} role="group" aria-label={t("resetConfirm")}>
              <span className={styles.confirmText}>{t("resetConfirm")}</span>
              <button type="button" className={styles.resetButton} onClick={resetGame}>
                {t("yes")}
              </button>
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => setConfirmReset(false)}
              >
                {t("no")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => {
                if (foundWords.size > 0 && !isWon) setConfirmReset(true);
                else resetGame();
              }}
            >
              {t("newGrid")}
            </button>
          )}
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.max(3, progress * 100)}%` }}
          />
        </div>

        {isWon ? (
          <div className={styles.banner} role="status">
            <p className={styles.bannerTitle}>{t("won")}</p>
            <button type="button" className={styles.resetButton} onClick={resetGame}>
              {t("playAgain")}
            </button>
          </div>
        ) : null}
        {isEmpty ? (
          <div className={styles.banner} role="status">
            <p className={styles.bannerTitle}>{t("empty")}</p>
            <button type="button" className={styles.resetButton} onClick={resetGame}>
              {t("newGrid")}
            </button>
          </div>
        ) : null}

        <div className={styles.grid}>
          <div
            className={styles.gridSizer}
            style={{
              gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
            }}
          >
            {grid.map((rowLetters, rowIndex) =>
              rowLetters.map((letter, colIndex) => {
                const point = { row: rowIndex, col: colIndex };
                const key = keyOf(point);
                const isSelected = selectedCellKeys.has(key);
                const isFound = foundCells.has(key);
                const flashClass =
                  flash?.keys.has(key)
                    ? flash.kind === "found"
                      ? ` ${styles.cellPop}`
                      : ` ${styles.cellMiss}`
                    : "";

                return (
                  <button
                    key={key}
                    type="button"
                    data-filword-cell="1"
                    data-row={rowIndex}
                    data-col={colIndex}
                    className={`${styles.cell}${isSelected ? ` ${styles.cellSelected}` : ""}${isFound ? ` ${styles.cellFound}` : ""}${flashClass}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      dragActiveRef.current = true;
                      startPointRef.current = point;
                      lastVibrationSelectionLenRef.current = 0;
                      setSelectedPath([point]);
                      maybeVibrateForCorrectPrefix(letter);
                    }}
                    onPointerEnter={() => {
                      if (!dragActiveRef.current) {
                        return;
                      }
                      updatePath(point);
                    }}
                  >
                    {letter}
                  </button>
                );
              }),
            )}
          </div>
        </div>

        <p className={styles.selectionPreview}>
          {t("selection", { word: selectedWord || "—" })}
        </p>

        <div className={styles.clues}>
          {puzzleEntries.map((entry, index) => {
            const isFound = foundWords.has(entry.word);
            const hiddenMask = "•".repeat(entry.word.length);
            return (
              <div
                key={entry.word}
                className={`${styles.clueItem}${isFound ? ` ${styles.clueFound}` : ""}`}
              >
                <span className={styles.clueIndex}>{index + 1}.</span>
                <span className={styles.clueText}>{entry.clue}</span>
                <span
                  className={`${styles.clueWord}${!isFound ? ` ${styles.clueWordHidden}` : ""}`}
                >
                  {isFound ? entry.word : hiddenMask}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
