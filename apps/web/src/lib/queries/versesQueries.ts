import { queryKeys } from "@/lib/queryKeys";
import { getSavedVerses } from "@/lib/versesApi";

export function savedVersesQueryKey() {
  return queryKeys.verses.saved();
}

export function fetchSavedVersesForQuery() {
  return getSavedVerses();
}
