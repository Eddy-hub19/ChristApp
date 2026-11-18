import { clearChatMessageCache } from "@/lib/chatMessageCache";
import { clearPersistedQueryClient } from "@/lib/queryPersister";

/** Кеші Service Worker, які можуть містити дані користувача (статика/оболонка не чіпаємо). */
const USER_SW_CACHE_PREFIXES = ["christapp-api-swr", "christapp-runtime"];

async function clearServiceWorkerUserCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => USER_SW_CACHE_PREFIXES.some((p) => key.startsWith(p)))
      .map((key) => caches.delete(key)),
  );
}

/**
 * Стирає всі локальні кеші, прив'язані до користувача: персист React Query (IndexedDB), кеш повідомлень чату
 * та API/runtime-кеші Service Worker. Викликається з єдиного `logout` (ручний вихід І завершення сесії по 401),
 * щоб наступний користувач цього пристрою не побачив чужі дані. Помилки одного шару не блокують інші.
 */
export async function clearUserCaches(): Promise<void> {
  await Promise.allSettled([
    clearPersistedQueryClient(),
    clearChatMessageCache(),
    clearServiceWorkerUserCaches(),
  ]);
}
