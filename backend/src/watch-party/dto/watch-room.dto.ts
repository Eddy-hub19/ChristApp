import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_POSITION_SEC, WATCH_PROVIDERS, type WatchProvider } from '../watch-party.state';

export class CreateWatchRoomDto {
  @IsString()
  @MinLength(1, { message: 'Вкажіть назву кімнати' })
  @MaxLength(80)
  title: string;

  /**
   * За замовчуванням YOUTUBE (сумісність зі старими клієнтами, які цього поля не шлють).
   * Формат ref під конкретного провайдера DTO не перевіряє — це робить
   * `isValidProviderRef` у сервісі, бо однією декларативною анотацією тут не обійтись.
   */
  @IsOptional()
  @IsIn(WATCH_PROVIDERS)
  provider?: WatchProvider;

  @IsString()
  @MaxLength(2048, { message: 'Задовге посилання' })
  videoId: string;

  /**
   * Для YOUTUBE ігнорується — сервер сам перевіряє назву через oEmbed, як і раніше.
   * Для інших провайдерів сервер повторно посилання не тягне (це вже зробив
   * GET /watch-rooms/resolve-video, єдине місце із SSRF-захищеним мережевим викликом за
   * довільним URL від клієнта) — довіряємо цим полям так само, як і назві самої кімнати.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  videoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  thumbnailUrl?: string;

  /** Таймкод із посилання (`?t=90`) — з нього й почнеться перегляд. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_POSITION_SEC)
  startSec?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  inviteeIds?: string[];
}

export class InviteWatchRoomDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  userIds: string[];
}
