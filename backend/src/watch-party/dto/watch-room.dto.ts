import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_POSITION_SEC, YOUTUBE_VIDEO_ID_RE } from '../watch-party.state';

export class CreateWatchRoomDto {
  @IsString()
  @MinLength(1, { message: 'Вкажіть назву кімнати' })
  @MaxLength(80)
  title: string;

  @IsString()
  @Matches(YOUTUBE_VIDEO_ID_RE, { message: 'Некоректне посилання на YouTube' })
  videoId: string;

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
