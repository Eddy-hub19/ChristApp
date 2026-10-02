/**
 * Єдине місце, де описано, які вкладення приймає чат: ліміти розміру й дозволені MIME-типи.
 * Щоб додати новий тип файлу (наприклад, PDF/EPUB-рідер чи архів) — додайте його MIME у
 * `FILE_POLICY.mimes` (і, за потреби, у `INLINE_SAFE_MIMES`, якщо його безпечно відкривати в браузері).
 */

export type UploadPolicy = {
  maxBytes: number;
  mimes: ReadonlySet<string>;
};

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function normalizeMime(raw: string | undefined | null): string {
  return (raw ?? '').split(';')[0].trim().toLowerCase();
}

export const VOICE_POLICY: UploadPolicy = {
  maxBytes: 8 * 1024 * 1024,
  mimes: new Set([
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/mpeg',
    'audio/mp3',
    'audio/x-m4a',
    'audio/m4a',
    'video/webm',
    'video/mp4',
  ]),
};

export const IMAGE_POLICY: UploadPolicy = {
  maxBytes: 12 * 1024 * 1024,
  mimes: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ]),
};

export const VIDEO_NOTE_POLICY: UploadPolicy = {
  maxBytes: 30 * 1024 * 1024,
  mimes: new Set(['video/webm', 'video/mp4', 'video/quicktime']),
};

export const FILE_POLICY: UploadPolicy = {
  maxBytes: 50 * 1024 * 1024,
  mimes: new Set([
    // Книги (PDF/EPUB) — для них є окрема задача (рідер).
    'application/pdf',
    'application/epub+zip',
    // Аудіофайли
    'audio/mpeg',
    'audio/mp3',
    'audio/x-m4a',
    'audio/m4a',
    'audio/mp4',
    // Документи й архіви
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/gzip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
  ]),
};

/**
 * MIME-типи, які браузер може виконати (HTML, SVG, JS тощо): такі файли заборонені до
 * завантаження, а на виході будь-який файл віддається лише як завантаження.
 */
export const EXECUTABLE_MIMES: ReadonlySet<string> = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'text/xml',
  'application/xml',
]);

export function isMimeAllowed(
  policy: UploadPolicy,
  rawMime: string | undefined | null,
): boolean {
  const mime = normalizeMime(rawMime);
  return mime.length > 0 && !EXECUTABLE_MIMES.has(mime) && policy.mimes.has(mime);
}

/** Прибирає шляхи, керуючі символи й обмежує довжину імені файлу. */
export function sanitizeFileName(raw: string | undefined | null): string {
  let name = raw ?? '';
  // multer читає multipart-імена як latin1; відновлюємо UTF-8 (кирилиця, емодзі).
  if (/[À-ÿ]/.test(name) && !/[^\u0000-ÿ]/.test(name)) {
    try {
      const decoded = Buffer.from(name, 'latin1').toString('utf8');
      if (!decoded.includes('�')) name = decoded;
    } catch {
      /* залишаємо як є */
    }
  }
  name = name
    .replace(/[\\/]+/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (name.length > 120) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : '';
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name || 'file';
}
