import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

/** Полезная нагрузка колбэка Telegram Login Widget (`onTelegramAuth(user)`). */
export class TelegramAuthDto {
  @IsInt({ message: 'Некорректный Telegram id' })
  id: number;

  @IsString({ message: 'Некорректное имя Telegram' })
  first_name: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsInt({ message: 'Некорректный auth_date' })
  auth_date: number;

  @IsString({ message: 'hash обязателен' })
  @MinLength(1, { message: 'hash обязателен' })
  hash: string;
}
