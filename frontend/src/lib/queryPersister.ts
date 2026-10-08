import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

/**
 * Персист кешу React Query в IndexedDB (а не в localStorage): localStorage синхронний, обмежений ~5 МБ і блокує
 * основний потік на кожному записі. Один шар на тип даних:
 *  - повідомлення чату живуть у власному IndexedDB-кеші (`chatMessageCache`, останні 50 на кімнату) — історію
 *    кімнат (`["chat","room-history",…]`) сюди НЕ пишемо, щоб не тримати одне й те саме в двох сховищах;
 *  - сюди потрапляють список чатів, довідник людей, профіль, Біблія, збережені вірші (див. `shouldPersistQuery`).
 */
const DB_NAME = "christapp-rq-cache";
const STORE = "client";
const KEY = "persisted-client";
/** Попередній сховок (localStorage) — прибираємо, щоб не займав квоту. */
const LEGACY_LOCAL_STORAGE_KEYS = ["CHRISTAPP_RQ_CACHE_V2"];

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve) => {
    try {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    } finally {
      db.close();
    }
  });
}

export function removeLegacyLocalStorageCache() {
  try {
    if (typeof window === "undefined") return;
    for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // приватний режим тощо
  }
}

export async function clearPersistedQueryClient(): Promise<void> {
  removeLegacyLocalStorageCache();
  await withStore("readwrite", (store) => store.delete(KEY));
}

/** Persister з тротлінгом запису: серія змін кешу збирається в один запис раз на `throttleMs`. */
export function createIdbPersister(throttleMs = 1500): Persister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const client = pending;
    pending = null;
    if (!client) return;
    void withStore("readwrite", (store) => store.put(client, KEY));
  };

  return {
    persistClient: (client) => {
      pending = client;
      if (!timer) timer = setTimeout(flush, throttleMs);
    },
    restoreClient: async () => {
      removeLegacyLocalStorageCache();
      const stored = await withStore<PersistedClient>("readonly", (store) =>
        store.get(KEY) as IDBRequest<PersistedClient>,
      );
      return stored ?? undefined;
    },
    removeClient: async () => {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      await clearPersistedQueryClient();
    },
  };
}
