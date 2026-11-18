import { clearPersistedQueryClient } from "@/lib/queryPersister";

/** Ключ localStorage попередньої версії кешу (тепер кеш у IndexedDB); лишається для сумісності імпортів. */
export const REACT_QUERY_PERSIST_KEY = "CHRISTAPP_RQ_CACHE_V2";

/** Скидання персистентного кешу RQ (IndexedDB + старий localStorage) — при logout. */
export function clearPersistedReactQueryCache() {
  void clearPersistedQueryClient();
}
