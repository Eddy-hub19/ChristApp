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

const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/**
 * multer/busboy читає multipart-імена як latin1 (а деякі клієнти/ОС — як cp1252), тож UTF-8 ім'я
 * ("Алей.mp3") стає "Ð\u0090Ð»..." . Повертає виправлене ім'я, лише якщо всі символи — це байти
 * (latin1/cp1252) і вони складаються у валідний UTF-8; інакше — вхідний рядок без змін.
 */
export function repairMojibakeName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const bytes: number[] = [];
  for (const ch of name) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) bytes.push(code);
    else if (CP1252_EXTRA[code] !== undefined) bytes.push(CP1252_EXTRA[code]);
    else return name;
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
    return decoded;
  } catch {
    return name;
  }
}

/** Прибирає шляхи, керуючі символи й обмежує довжину імені файлу. */
export function sanitizeFileName(raw: string | undefined | null): string {
  let name = repairMojibakeName(raw ?? '');
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
