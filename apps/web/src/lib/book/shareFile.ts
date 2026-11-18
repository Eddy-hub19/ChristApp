import { BOOK_MIME, type BookFormat } from "./bookFile";

const fileCache = new Map<string, Promise<File>>();
const FILE_CACHE_LIMIT = 3;

/** Завантажує книгу як File із правильним іменем і MIME (кеш на кілька останніх, щоб Share не чекав мережу). */
export function fetchBookFile(url: string, filename: string, format: BookFormat): Promise<File> {
  const cached = fileCache.get(url);
  if (cached) return cached;
  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    })
    .then((blob) => new File([blob], filename, { type: BOOK_MIME[format] }));
  fileCache.set(url, promise);
  promise.catch(() => fileCache.delete(url));
  while (fileCache.size > FILE_CACHE_LIMIT) {
    const oldest = fileCache.keys().next().value;
    if (oldest === undefined) break;
    fileCache.delete(oldest);
  }
  return promise;
}

/** Чи вміє браузер ділитися файлами через системне меню (iOS: "Книги", "Файли" тощо). */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([""], "x.pdf", { type: BOOK_MIME.pdf })] });
  } catch {
    return false;
  }
}

export function downloadFile(file: File): void {
  const href = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

export type ShareResult = "shared" | "downloaded" | "cancelled" | "blocked";

/**
 * Web Share з файлом (пріоритет, особливо в iOS PWA); якщо недоступний — звичайне завантаження.
 * Файл краще передати вже завантаженим: iOS вимагає виклику share у межах жесту користувача.
 */
export async function shareOrDownloadBook(file: File): Promise<ShareResult> {
  if (canShareFiles() && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Жест користувача вже минув (довге завантаження): файл у кеші, другий тап поділиться миттєво.
      if (error instanceof DOMException && error.name === "NotAllowedError") return "blocked";
      // Інші збої Web Share — падаємо на завантаження.
    }
  }
  downloadFile(file);
  return "downloaded";
}
