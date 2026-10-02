export type BookFormat = "pdf" | "epub";

export const BOOK_MIME: Record<BookFormat, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
};

export function bookFormatFromName(name: string): BookFormat | null {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ext === "epub" ? ext : null;
}

export function isBookFileName(name: string): boolean {
  return bookFormatFromName(name) !== null;
}

/** Назва за замовчуванням — ім'я файлу без розширення. */
export function bookTitleFromFilename(name: string): string {
  const title = name.replace(/\.(pdf|epub)$/i, "").trim();
  return title || name;
}

/** "📖 <назва>" для цитат, превʼю списку чатів і сповіщень; null, якщо це не книга. */
export function bookPreviewLabel(filename: string | null | undefined): string | null {
  const name = (filename ?? "").trim();
  if (!isBookFileName(name)) return null;
  return `📖 ${bookTitleFromFilename(name)}`;
}

/** Cloudinary міг зберегти PDF як image — для віддачі справжнього файлу потрібен raw. */
export function toRawCloudinaryUrl(url: string): string {
  if (!url.includes("res.cloudinary.com")) return url;
  if (url.includes("/image/upload/")) {
    return url.replace("/image/upload/", "/raw/upload/");
  }
  return url;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
