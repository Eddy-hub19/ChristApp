/**
 * Єдине місце, де описано, які вкладення приймає чат на клієнті (дзеркало backend/src/messages/upload-policy.ts).
 * Щоб додати новий тип (наприклад, PDF/EPUB-рідер чи архів) — додайте запис у `FILE_ATTACHMENT_TYPES`
 * (MIME + розширення) і, якщо потрібен окремий ендпоїнт, новий `kind` у `classifyAttachment`.
 */

export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_VOICE_BYTES = 8 * 1024 * 1024;
/** Голосове коротше за цю тривалість (мс) скасовується як випадковий дотик. */
export const MIN_VOICE_DURATION_MS = 1000;
export const IMAGE_MAX_SIDE_PX = 2048;
/** Скільки файлів можна вибрати за раз. */
export const MAX_FILES_PER_PICK = 10;

export type AttachmentKind = "image" | "file";

type AttachmentType = { mime: string; exts: string[] };

export const IMAGE_ATTACHMENT_TYPES: AttachmentType[] = [
  { mime: "image/jpeg", exts: ["jpg", "jpeg"] },
  { mime: "image/png", exts: ["png"] },
  { mime: "image/webp", exts: ["webp"] },
  { mime: "image/gif", exts: ["gif"] },
  { mime: "image/heic", exts: ["heic"] },
  { mime: "image/heif", exts: ["heif"] },
];

export const FILE_ATTACHMENT_TYPES: AttachmentType[] = [
  // Книги (PDF/EPUB) — окрема задача (рідер) розширює саме ці рядки.
  { mime: "application/pdf", exts: ["pdf"] },
  { mime: "application/epub+zip", exts: ["epub"] },
  { mime: "audio/mpeg", exts: ["mp3"] },
  { mime: "audio/mp3", exts: [] },
  { mime: "audio/x-m4a", exts: ["m4a"] },
  { mime: "audio/m4a", exts: [] },
  { mime: "audio/mp4", exts: [] },
  { mime: "application/zip", exts: ["zip"] },
  { mime: "application/x-zip-compressed", exts: [] },
  { mime: "application/x-rar-compressed", exts: ["rar"] },
  { mime: "application/vnd.rar", exts: [] },
  { mime: "application/x-7z-compressed", exts: ["7z"] },
  { mime: "application/gzip", exts: ["gz"] },
  { mime: "application/msword", exts: ["doc"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    exts: ["docx"],
  },
  { mime: "application/vnd.ms-excel", exts: ["xls"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    exts: ["xlsx"],
  },
  { mime: "application/vnd.ms-powerpoint", exts: ["ppt"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    exts: ["pptx"],
  },
  { mime: "text/plain", exts: ["txt"] },
  { mime: "text/csv", exts: ["csv"] },
];

/** Значення для `<input type="file" accept>`. */
export const ATTACHMENT_ACCEPT = [...IMAGE_ATTACHMENT_TYPES, ...FILE_ATTACHMENT_TYPES]
  .flatMap((entry) => [entry.mime, ...entry.exts.map((ext) => `.${ext}`)])
  .join(",");

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function matches(types: AttachmentType[], mime: string, ext: string): boolean {
  return types.some(
    (entry) => (mime && entry.mime === mime) || (ext && entry.exts.includes(ext)),
  );
}

/** Визначає тип вкладення за MIME, а якщо ОС його не повідомила — за розширенням. */
export function classifyAttachment(file: File): AttachmentKind | null {
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  const ext = fileExtension(file.name);
  if (matches(IMAGE_ATTACHMENT_TYPES, mime, ext)) return "image";
  if (matches(FILE_ATTACHMENT_TYPES, mime, ext)) return "file";
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** `very-long-report-name.docx` → `very-lon…ame.docx`: розширення завжди видно. */
export function truncateMiddle(name: string, max = 34): string {
  if (name.length <= max) return name;
  const ext = fileExtension(name);
  const tail = ext ? `.${ext}` : "";
  const base = tail ? name.slice(0, -tail.length) : name;
  const keepTail = Math.min(6, Math.max(0, base.length - 1));
  const keepHead = Math.max(1, max - tail.length - keepTail - 1);
  return `${base.slice(0, keepHead)}…${base.slice(base.length - keepTail)}${tail}`;
}

export type FileIconKind = "archive" | "doc" | "sheet" | "slides" | "text" | "audio" | "book" | "generic";

export function fileIconKind(name: string): FileIconKind {
  switch (fileExtension(name)) {
    case "zip":
    case "rar":
    case "7z":
    case "gz":
      return "archive";
    case "doc":
    case "docx":
      return "doc";
    case "xls":
    case "xlsx":
    case "csv":
      return "sheet";
    case "ppt":
    case "pptx":
      return "slides";
    case "txt":
      return "text";
    case "mp3":
    case "m4a":
      return "audio";
    case "pdf":
    case "epub":
      return "book";
    default:
      return "generic";
  }
}

const FILE_ICON_EMOJI: Record<FileIconKind, string> = {
  archive: "🗜",
  doc: "📝",
  sheet: "📊",
  slides: "📽",
  text: "📄",
  audio: "🎵",
  book: "📖",
  generic: "📎",
};

export function fileIconEmoji(name: string): string {
  return FILE_ICON_EMOJI[fileIconKind(name)];
}

/**
 * Голосові з Chrome/Android — webm/opus, який Safari на iPhone відтворює не завжди.
 * Cloudinary перекодовує «на льоту» за розширенням у URL, тож для будь-якого (і старого) голосового
 * віддаємо AAC/m4a — він грає всюди.
 */
export function playableVoiceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith("res.cloudinary.com") &&
      parsed.pathname.includes("/video/upload/")
    ) {
      parsed.pathname = parsed.pathname.replace(/\.[a-z0-9]+$/i, "") + ".m4a";
      return parsed.toString();
    }
  } catch {
    // не абсолютний URL — повертаємо як є
  }
  return url;
}

/** Ім'я файлу голосового з розширенням, що відповідає реальному формату запису. */
export function voiceFileName(mimeType: string): string {
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "voice.m4a";
  if (mime.includes("ogg")) return "voice.ogg";
  return "voice.webm";
}

function cloudinaryTransform(url: string, transform: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith("res.cloudinary.com") &&
      parsed.pathname.includes("/image/upload/")
    ) {
      parsed.pathname = parsed.pathname.replace(
        "/image/upload/",
        `/image/upload/${transform}/`,
      );
      return parsed.toString();
    }
  } catch {
    // не абсолютний URL
  }
  return url;
}

/** Мініатюра для пузиря (швидше, ніж оригінал до 2048px). */
export function imageThumbUrl(url: string, width = 720): string {
  return cloudinaryTransform(url, `c_limit,w_${width},q_auto,f_auto`);
}

/** Крихітна розмита заглушка, що показується до завантаження фото. */
export function imageBlurUrl(url: string): string {
  return cloudinaryTransform(url, "c_limit,w_24,e_blur:300,q_30");
}

/**
 * Посилання, яке браузер завантажує як файл із правильним іменем (Content-Disposition: attachment).
 * Cloudinary формує його за прапорцем `fl_attachment`; для інших джерел повертаємо URL як є.
 */
export function downloadUrl(url: string, fileName: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith("res.cloudinary.com") &&
      parsed.pathname.includes("/upload/") &&
      !parsed.pathname.includes("fl_attachment")
    ) {
      const isRaw = parsed.pathname.includes("/raw/upload/");
      const base = isRaw ? fileName : fileName.replace(/\.[^.]+$/, "");
      const safe = encodeURIComponent(base.replace(/[^\p{L}\p{N}._ -]/gu, "_"));
      parsed.pathname = parsed.pathname.replace(
        "/upload/",
        `/upload/fl_attachment:${safe}/`,
      );
      return parsed.toString();
    }
  } catch {
    // не абсолютний URL
  }
  return url;
}
