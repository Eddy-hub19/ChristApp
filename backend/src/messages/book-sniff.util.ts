export type BookFormat = 'pdf' | 'epub';

export const BOOK_MIME: Record<BookFormat, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
};

const EPUB_MIMETYPE_ENTRY = 'mimetype';
const EPUB_MIMETYPE_VALUE = 'application/epub+zip';
// Заголовок PDF допускает до 1024 байт мусора перед "%PDF-" (так читают Acrobat и pdf.js).
const PDF_HEADER_WINDOW = 1024;

/**
 * Определяет PDF/EPUB по содержимому файла, а не по расширению или Content-Type клиента.
 * EPUB — ZIP, у которого первой записью идёт несжатый `mimetype` со значением application/epub+zip
 * (смещение 30 — сразу за локальным заголовком ZIP).
 */
export function sniffBookFormat(buffer: Buffer): BookFormat | null {
  if (!buffer || buffer.length < 5) {
    return null;
  }

  if (buffer.subarray(0, PDF_HEADER_WINDOW).includes('%PDF-', 0, 'latin1')) {
    return 'pdf';
  }

  const isZip =
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;
  if (
    isZip &&
    buffer.length > 30 + EPUB_MIMETYPE_ENTRY.length + EPUB_MIMETYPE_VALUE.length
  ) {
    const name = buffer.toString('latin1', 30, 30 + EPUB_MIMETYPE_ENTRY.length);
    const valueStart = 30 + EPUB_MIMETYPE_ENTRY.length;
    const value = buffer.toString(
      'latin1',
      valueStart,
      valueStart + EPUB_MIMETYPE_VALUE.length,
    );
    if (name === EPUB_MIMETYPE_ENTRY && value === EPUB_MIMETYPE_VALUE) {
      return 'epub';
    }
  }

  return null;
}

/** Имя файла с расширением, соответствующим реальному формату книги. */
export function bookFilename(
  originalName: string | undefined,
  format: BookFormat,
): string {
  const base = (originalName || 'book').replace(/[/\\]/g, '_').trim() || 'book';
  const ext = `.${format}`;
  return base.toLowerCase().endsWith(ext)
    ? base
    : `${base.replace(/\.(pdf|epub)$/i, '')}${ext}`;
}

/** "📖 <название>" для пуша и превью списка чатов; null, если это не книга. */
export function bookPreviewLabel(
  filename: string | null | undefined,
): string | null {
  const name = (filename ?? '').trim();
  if (!/\.(pdf|epub)$/i.test(name)) {
    return null;
  }
  const title = name.replace(/\.(pdf|epub)$/i, '').trim();
  return `📖 ${title || name}`;
}
