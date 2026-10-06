import type { CatalogCharacter, GuessLang } from "./guessTypes";

/** Нижній регістр, без діакритики й апострофів; «ё» = «е», «ї» = «і» — щоб пошук прощав друкарські варіанти. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`ʼ]/g, "")
    .replace(/ё/g, "е")
    .replace(/ї/g, "і")
    .trim();
}

/** Пошук за назвою будь-якою з трьох мов; порожній запит повертає всіх. Назви поточної мови — першими. */
export function filterCharacters(
  characters: CatalogCharacter[],
  query: string,
  lang: GuessLang,
): CatalogCharacter[] {
  const q = normalizeName(query);
  const sorted = [...characters].sort((a, b) => a.name[lang].localeCompare(b.name[lang], lang));
  if (!q) return sorted;
  return sorted.filter((c) =>
    (["ua", "ru", "en"] as const).some((l) => normalizeName(c.name[l]).includes(q)),
  );
}
