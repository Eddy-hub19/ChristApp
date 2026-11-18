import { foldText } from "@/lib/bibleBooks";

/** API відхиляє запити коротші за 3 символи. */
export const BIBLE_SEARCH_MIN_LENGTH = 3;

export type ParsedQuery = {
  /** Слова (згорнуті): кожне має бути початком якогось слова вірша. */
  tokens: string[];
  /** Ті самі слова без згортання (лише нижній регістр) — саме їх шукаємо в API, бо воно порівнює дослівно. */
  rawTokens: string[];
  /** Фраза в лапках (згорнута): має зустрічатися підряд, з початку слова. */
  phrase: string | null;
};

const WORD_RE = /[\p{L}\p{N}'’ʼ`ʹ]+/gu;

export function parseSearchQuery(raw: string): ParsedQuery {
  const q = raw.trim();
  const quoted = /^["«“„](.+?)["»”]?$/u.exec(q);
  const body = quoted ? quoted[1] : q;
  const rawTokens = body.toLowerCase().match(WORD_RE) ?? [];
  const tokens = foldText(body).match(WORD_RE) ?? [];
  const phrase = quoted && tokens.length > 0 ? tokens.join(" ") : null;
  return { tokens, rawTokens, phrase };
}

export function isSearchable(raw: string): boolean {
  const { tokens } = parseSearchQuery(raw);
  return tokens.length > 0 && tokens.join("").length >= BIBLE_SEARCH_MIN_LENGTH;
}

/** Рядок для запиту до API: фраза — як є, інакше найдовше слово (решту відфільтруємо самі). */
export function upstreamQuery(parsed: ParsedQuery): string {
  if (parsed.phrase) return parsed.rawTokens.join(" ");
  const longest = [...parsed.rawTokens].sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length >= BIBLE_SEARCH_MIN_LENGTH) return longest;
  return parsed.rawTokens.join(" ");
}

type Range = [number, number];

/** Діапазони збігів у вихідному тексті (довжина згорнутого рядка = довжині оригіналу). */
export function findMatchRanges(text: string, parsed: ParsedQuery): Range[] {
  const folded = foldText(text);
  const ranges: Range[] = [];

  if (parsed.phrase) {
    const phrase = parsed.phrase;
    // Слова фрази в тексті можуть бути розділені будь-якою пунктуацією.
    const words = [...folded.matchAll(WORD_RE)].map((w) => ({
      start: w.index ?? 0,
      value: w[0],
    }));
    const target = phrase.split(" ");
    for (let i = 0; i + target.length <= words.length; i++) {
      let ok = true;
      for (let j = 0; j < target.length; j++) {
        const w = words[i + j].value;
        const t = target[j];
        // Усі слова, крім останнього, мають збігатися повністю; останнє — за початком.
        if (j < target.length - 1 ? w !== t : !w.startsWith(t)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const last = words[i + target.length - 1];
        ranges.push([
          words[i].start,
          last.start + target[target.length - 1].length,
        ]);
      }
    }
    return ranges;
  }

  for (const w of folded.matchAll(WORD_RE)) {
    const start = w.index ?? 0;
    for (const t of parsed.tokens) {
      if (w[0].startsWith(t)) {
        ranges.push([start, start + t.length]);
        break;
      }
    }
  }
  return ranges;
}

export function matchesQuery(text: string, parsed: ParsedQuery): boolean {
  if (parsed.phrase) return findMatchRanges(text, parsed).length > 0;
  const folded = foldText(text);
  const words = folded.match(WORD_RE) ?? [];
  return parsed.tokens.every((t) => words.some((w) => w.startsWith(t)));
}

export type HighlightSegment = { text: string; hit: boolean };

export function highlightSegments(
  text: string,
  parsed: ParsedQuery,
): HighlightSegment[] {
  const ranges = findMatchRanges(text, parsed).sort((a, b) => a[0] - b[0]);
  const out: HighlightSegment[] = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    if (s > pos) out.push({ text: text.slice(pos, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
  return out;
}

/** Прибирає HTML-розмітку, яку API додає до тексту (<mark>, <i>, Strong-номери тощо). */
export function stripVerseHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
