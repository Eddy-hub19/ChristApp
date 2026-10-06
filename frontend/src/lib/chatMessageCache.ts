/**
 * Локальний кеш останніх повідомлень чату (IndexedDB): при вході в чат список показується одразу,
 * а свіжа історія підтягується у фоні. Записи прив'язані до користувача, а при виході з акаунта кеш стирається.
 */

export const CACHED_MESSAGES_LIMIT = 50;

const DB_NAME = "christapp-chat-cache";
const STORE = "rooms";

type CacheEntry<T> = { userId: string; savedAt: number; messages: T[] };

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
      const entry: CacheEntry<T> = { userId, savedAt: Date.now(), messages: trimForCache(messages) };
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry, cacheKey(userId, roomId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function clearChatMessageCache(): Promise<void> {
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
