import { bookPreviewLabel } from './book-sniff.util';
import { VOICE_META_PREFIX, VOICE_META_SUFFIX } from './voice-message';

/**
 * Підпис медіа-повідомлення для пушів і прев'ю останнього повідомлення.
 * Повертає `null` для звичайного тексту (тоді береться сам текст).
 */
export function mediaPreviewLabel(
  type: string | null | undefined,
  content?: string | null,
): string | null {
  const trimmed = String(content ?? '').trim();
  const isVoice =
    type === 'VOICE' ||
    (trimmed.startsWith(VOICE_META_PREFIX) &&
      trimmed.endsWith(VOICE_META_SUFFIX));
  if (isVoice) return '🎤 Голосове повідомлення';
  if (type === 'IMAGE') return '🖼 Фото';
  if (type === 'FILE') return bookPreviewLabel(trimmed) ?? '📎 Файл';
  if (type === 'VIDEO_NOTE') return '🎥 Відеоповідомлення';
  return null;
}
