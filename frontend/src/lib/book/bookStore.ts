/**
 * Локальне сховище читалки: позиція читання (localStorage) і кеш метаданих/обкладинок (IndexedDB).
 * Усе під ключем URL файлу, тож та сама книга в різних повідомленнях ділить місце зупинки.
 */

export type BookPosition = { page?: number; offset?: number; cfi?: string };

export type BookMeta = {
  title?: string;
  author?: string;
  size?: number;
  cover?: Blob | null;
};

const POSITION_PREFIX = "christapp:book-pos:";
const DB_NAME = "christapp-books";
const STORE = "meta";

export function readBookPosition(url: string): BookPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_PREFIX + url);
    return raw ? (JSON.parse(raw) as BookPosition) : null;
  } catch {
    return null;
  }
}

export function writeBookPosition(url: string, position: BookPosition): void {
  try {
    localStorage.setItem(POSITION_PREFIX + url, JSON.stringify(position));
  } catch {
    /* сховище недоступне — просто не запамʼятовуємо */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readBookMeta(url: string): Promise<BookMeta | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(url);
      request.onsuccess = () => resolve((request.result as BookMeta | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeBookMeta(url: string, meta: BookMeta): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(meta, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
