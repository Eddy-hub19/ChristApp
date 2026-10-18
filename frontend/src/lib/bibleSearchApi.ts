import axios from "axios";
import type {
  BibleSearchResponse,
  BibleSearchScope,
} from "@/lib/bibleSearchTypes";

export const BIBLE_SEARCH_PAGE_SIZE = 30;

export async function fetchBibleSearch(params: {
  translation: string;
  q: string;
  scope: BibleSearchScope;
  offset: number;
  signal?: AbortSignal;
}): Promise<BibleSearchResponse> {
  const res = await axios.get<BibleSearchResponse>("/api/bibleSearch", {
    params: {
      translation: params.translation,
      q: params.q,
      scope: params.scope,
      offset: params.offset,
      limit: BIBLE_SEARCH_PAGE_SIZE,
    },
    signal: params.signal,
  });
  return res.data;
}
