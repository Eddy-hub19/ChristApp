import { normalizeName } from "@/components/GuessCharacterMiniGame/guessSearch";
import type { CatalogCharacter, PuzzleLang } from "./puzzleTypes";

/**
 * Автодоповнення за іменем персонажа будь-якою з трьох мов (ua/ru/en), без урахування регістру й діакритики.
 * Спершу імена, що ПОЧИНАЮТЬСЯ з запиту, потім ті, де з нього починається друге слово, потім решта збігів;
 * в межах групи — за алфавітом поточної мови. Порожній запит нічого не підказує.
 */
export function suggestCharacters(
  characters: CatalogCharacter[],
  query: string,
  lang: PuzzleLang,
  limit = 8,
): CatalogCharacter[] {
  const q = normalizeName(query);
  if (!q) return [];
  const scored: Array<{ c: CatalogCharacter; rank: number }> = [];
  for (const c of characters) {
    let best = Infinity;
    for (const l of ["ua", "ru", "en"] as const) {
      const name = normalizeName(c.name[l]);
      const at = name.indexOf(q);
      if (at === -1) continue;
      const rank = at === 0 ? 0 : name[at - 1] === " " ? 1 : 2;
      best = Math.min(best, rank);
    }
    if (best < Infinity) scored.push({ c, rank: best });
  }
  scored.sort((a, b) => a.rank - b.rank || a.c.name[lang].localeCompare(b.c.name[lang], lang));
  return scored.slice(0, limit).map((s) => s.c);
}
