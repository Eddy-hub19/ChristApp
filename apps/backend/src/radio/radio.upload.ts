import { BadRequestException } from '@nestjs/common';
import { normalizeMime } from 'src/messages/upload-policy';

/** «Christ Radio»: что принимает загрузка треков (только админ). Один файл аудио + необязательная обложка. */
export const RADIO_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const RADIO_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const RADIO_MIN_SEC = 5;
export const RADIO_MAX_SEC = 30 * 60;

const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg']);
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'aac', 'ogg']);
const COVER_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const extOf = (name: string | undefined) => (name ?? '').split('.').pop()?.toLowerCase() ?? '';

/** По первым байтам: ID3/MPEG-кадр (mp3, aac ADTS), `ftyp` (m4a), `OggS`. Подделанное расширение не пройдёт. */
export function sniffAudio(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString('latin1', 0, 3) === 'ID3') return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  if (buf.toString('latin1', 4, 8) === 'ftyp') return true;
  return buf.toString('latin1', 0, 4) === 'OggS';
}

export function sniffCover(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf.toString('latin1', 1, 4) === 'PNG') return true;
  return buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
}

export function validateRadioAudio(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file?.buffer?.length) throw new BadRequestException('Нужен аудиофайл в поле file');
  if (file.size > RADIO_AUDIO_MAX_BYTES) throw new BadRequestException('Файл слишком большой (максимум 25 МБ)');
  if (!AUDIO_MIMES.has(normalizeMime(file.mimetype)) || !AUDIO_EXTS.has(extOf(file.originalname))) {
    throw new BadRequestException('Допустимы mp3, m4a, aac и ogg');
  }
  if (!sniffAudio(file.buffer)) throw new BadRequestException('Содержимое не похоже на аудиофайл');
  return file;
}

export function validateRadioCover(file: Express.Multer.File | undefined): Express.Multer.File | null {
  if (!file?.buffer?.length) return null;
  if (file.size > RADIO_COVER_MAX_BYTES) throw new BadRequestException('Обложка слишком большая (максимум 5 МБ)');
  if (!COVER_MIMES.has(normalizeMime(file.mimetype)) || !sniffCover(file.buffer)) {
    throw new BadRequestException('Обложка: только jpg, png или webp');
  }
  return file;
}

/** Название, исполнитель и длительность (её меряет браузер админа; сервер лишь ограничивает диапазон). */
export function parseRadioMeta(body: { title?: unknown; artist?: unknown; durationSec?: unknown }) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const artist = typeof body.artist === 'string' ? body.artist.trim() : '';
  const durationSec = Math.round(Number(body.durationSec));
  if (!title || title.length > 120) throw new BadRequestException('Название: от 1 до 120 символов');
  if (artist.length > 120) throw new BadRequestException('Исполнитель: до 120 символов');
  if (!Number.isFinite(durationSec) || durationSec < RADIO_MIN_SEC || durationSec > RADIO_MAX_SEC) {
    throw new BadRequestException('Длительность: от 5 секунд до 30 минут');
  }
  return { title, artist, durationSec };
}
