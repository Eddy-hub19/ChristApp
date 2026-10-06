import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/** Верхня межа тривалості голосового (с): запис у клієнті обмежений значно менше. */
export const MAX_VOICE_DURATION_SECONDS = 60 * 60;

/**
 * multipart/form-data передає числа рядками ("7.2"), а iOS може віддати NaN/Infinity.
 * Некоректну тривалість не відхиляємо — голосове все одно зберігається без неї.
 */
export function parseVoiceDuration(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > MAX_VOICE_DURATION_SECONDS
  ) {
    return undefined;
  }
  return Math.round(parsed * 10) / 10;
}

export class VoiceUploadDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @Transform(({ value }) => parseVoiceDuration(value))
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_VOICE_DURATION_SECONDS)
  voiceDuration?: number;

  @IsString()
  @IsOptional()
  replyToId?: string;
}

export class VoiceListenDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;
}
