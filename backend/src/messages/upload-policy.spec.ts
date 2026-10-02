import {
  FILE_POLICY,
  IMAGE_POLICY,
  VOICE_POLICY,
  isMimeAllowed,
  normalizeMime,
  sanitizeFileName,
} from './upload-policy';
import { mediaPreviewLabel } from './media-preview';
import { voiceMessageContent } from './voice-message';

describe('upload-policy', () => {
  it('strips codec parameters before matching', () => {
    expect(normalizeMime('Audio/WebM;codecs=opus')).toBe('audio/webm');
    expect(isMimeAllowed(VOICE_POLICY, 'audio/webm;codecs=opus')).toBe(true);
    expect(isMimeAllowed(VOICE_POLICY, 'audio/mp4; codecs=mp4a.40.2')).toBe(true);
  });

  it('accepts HEIC images and rejects SVG/HTML/JS everywhere', () => {
    expect(isMimeAllowed(IMAGE_POLICY, 'image/heic')).toBe(true);
    for (const policy of [IMAGE_POLICY, FILE_POLICY, VOICE_POLICY]) {
      expect(isMimeAllowed(policy, 'image/svg+xml')).toBe(false);
      expect(isMimeAllowed(policy, 'text/html')).toBe(false);
      expect(isMimeAllowed(policy, 'application/javascript')).toBe(false);
    }
    expect(isMimeAllowed(FILE_POLICY, '')).toBe(false);
  });

  it('keeps PDF/EPUB in the file policy', () => {
    expect(isMimeAllowed(FILE_POLICY, 'application/pdf')).toBe(true);
    expect(isMimeAllowed(FILE_POLICY, 'application/epub+zip')).toBe(true);
    expect(isMimeAllowed(FILE_POLICY, 'application/zip')).toBe(true);
  });

  it('sanitizes file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName(undefined)).toBe('file');
    expect(sanitizeFileName(Buffer.from('звіт.docx', 'utf8').toString('latin1'))).toBe('звіт.docx');
    const long = sanitizeFileName(`${'a'.repeat(300)}.pdf`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('.pdf')).toBe(true);
  });
});

describe('mediaPreviewLabel', () => {
  it('labels every media type', () => {
    expect(mediaPreviewLabel('VOICE', '')).toBe('🎤 Голосове повідомлення');
    expect(mediaPreviewLabel('TEXT', voiceMessageContent('https://x/y.webm'))).toBe(
      '🎤 Голосове повідомлення',
    );
    expect(mediaPreviewLabel('IMAGE', null)).toBe('🖼 Фото');
    expect(mediaPreviewLabel('IMAGE', 'sunset')).toBe('🖼 Фото');
    expect(mediaPreviewLabel('FILE', 'a.zip')).toBe('📎 Файл');
    expect(mediaPreviewLabel('VIDEO_NOTE', null)).toBe('🎥 Відеоповідомлення');
    expect(mediaPreviewLabel('TEXT', 'hello')).toBeNull();
  });
});
