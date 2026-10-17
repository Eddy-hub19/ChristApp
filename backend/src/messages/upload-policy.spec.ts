import {
  FILE_POLICY,
  IMAGE_POLICY,
  VOICE_POLICY,
  isMimeAllowed,
  normalizeMime,
  sanitizeFileName,
  repairMojibakeName,
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

describe('repairMojibakeName', () => {
  const asLatin1 = (v: string) => Buffer.from(v, 'utf8').toString('latin1');
  const asCp1252 = (v: string) =>
    new TextDecoder('windows-1252').decode(Buffer.from(v, 'utf8'));

  it.each(['Алей.mp3', 'Звіт за квітень.docx', 'молитва 🙏 ранок.mp3', 'file name (1).pdf'])(
    'restores %s from latin1 and cp1252 mojibake',
    (name) => {
      expect(repairMojibakeName(asLatin1(name))).toBe(name);
      expect(repairMojibakeName(asCp1252(name))).toBe(name);
    },
  );

  it('leaves correct and non-restorable names untouched', () => {
    expect(repairMojibakeName('Алей.mp3')).toBe('Алей.mp3');
    expect(repairMojibakeName('report final.pdf')).toBe('report final.pdf');
    expect(repairMojibakeName('Ñandú.txt')).toBe('Ñandú.txt');
    expect(repairMojibakeName('café.txt')).toBe('café.txt');
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
