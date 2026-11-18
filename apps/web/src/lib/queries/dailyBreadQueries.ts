import { queryKeys } from "@/lib/queryKeys";
import { fetchRandomVerse } from "@/lib/bibleApi";

export type DailyBreadVerse = {
  book: string;
  chapter: number;
  verse: string | number;
  text: string;
};

export const dailyBreadQueryKey = (translation: string) =>
  queryKeys.bible.dailyBread(translation);

export async function fetchDailyBreadForQuery(
  translation: string,
): Promise<DailyBreadVerse | null> {
  return fetchRandomVerse(translation);
}
