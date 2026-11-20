/**
 * Локальний кеш останніх повідомлень чату (IndexedDB): при вході в чат список показується одразу,
 * а з сервера запитуються лише новіші за останнє відоме повідомлення. Зберігаємо СИРІ повідомлення сервера
 * (до 200 на чат і користувача): з них відновлюється і список, і дельта-запит. Записи прив'язані до користувача,
 * а при виході з акаунта кеш стирається.
 */

export const CACHED_MESSAGES_LIMIT = 200;

/** Попередня версія кешу зберігала вже оброблені повідомлення; формат несумісний, тож база інша, стара видаляється. */
const LEGACY_DB_NAME = "christapp-chat-cache";
const DB_NAME = "christapp-chat-cache-v2";
const STORE = "rooms";

type CacheEntry<T> = {
  userId: string;
  savedAt: number;
  messages: T[];
  /** Кто до какого момента дочитал чат: { userId: ISO lastReadAt } (из RoomReadState). */
  readStates?: Record<string, string>;
  /** Закреплённые сообщения чата (RoomPinDto с сервера). */
  pins?: unknown[];
};

export function trimForCache<T>(messages: T[], limit = CACHED_MESSAGES_LIMIT): T[] {
  return messages.length > limit ? messages.slice(-limit) : messages;
}

function cacheKey(userId: string, roomId: string): string {
  return `${userId}:${roomId}`;
}

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

export async function readCachedMessages<T>(userId: string, roomId: string): Promise<T[] | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(cacheKey(userId, roomId));
      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;
        resolve(entry && entry.userId === userId && Array.isArray(entry.messages) ? entry.messages : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

export async function writeCachedMessages<T>(userId: string, roomId: string, messages: T[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = cacheKey(userId, roomId);
      const getReq = store.get(key);
      // Метки прочитанного живут в той же записи: при обновлении сообщений не затираем их.
      getReq.onsuccess = () => {
        const prev = getReq.result as CacheEntry<T> | undefined;
        const entry: CacheEntry<T> = {
          userId,
          savedAt: Date.now(),
          messages: trimForCache(messages),
          ...(prev && prev.userId === userId && prev.readStates ? { readStates: prev.readStates } : {}),
          ...(prev && prev.userId === userId && prev.pins ? { pins: prev.pins } : {}),
        };
        store.put(entry, key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Данные о прочтении из кеша: чат открывается сразу с отметками «Переглянуто». */
export async function readCachedReadStates(userId: string, roomId: string): Promise<Record<string, string> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(cacheKey(userId, roomId));
      request.onsuccess = () => {
        const entry = request.result as CacheEntry<unknown> | undefined;
        resolve(entry && entry.userId === userId && entry.readStates ? entry.readStates : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

/** Сохраняет, кто до какого момента дочитал чат (сливается с уже лежащими сообщениями этой записи). */
export async function writeCachedReadStates(userId: string, roomId: string, readStates: Record<string, string>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = cacheKey(userId, roomId);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const prev = getReq.result as CacheEntry<unknown> | undefined;
        const base: CacheEntry<unknown> =
          prev && prev.userId === userId ? prev : { userId, savedAt: Date.now(), messages: [] };
        store.put({ ...base, readStates }, key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Закреплённые сообщения из кеша: полоска над чатом видна сразу, до ответа сервера. */
export async function readCachedPins<T>(userId: string, roomId: string): Promise<T[] | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(cacheKey(userId, roomId));
      request.onsuccess = () => {
        const entry = request.result as CacheEntry<unknown> | undefined;
        resolve(entry && entry.userId === userId && Array.isArray(entry.pins) ? (entry.pins as T[]) : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

/** Сохраняет закреплённые сообщения чата (в ту же запись, что и сообщения). */
export async function writeCachedPins(userId: string, roomId: string, pins: unknown[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = cacheKey(userId, roomId);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const prev = getReq.result as CacheEntry<unknown> | undefined;
        const base: CacheEntry<unknown> =
          prev && prev.userId === userId ? prev : { userId, savedAt: Date.now(), messages: [] };
        store.put({ ...base, pins }, key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

function deleteLegacyDb() {
  try {
    if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    // не критично
  }
}

export async function clearChatMessageCache(): Promise<void> {
  deleteLegacyDb();
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
