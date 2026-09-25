import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VideoSearchQueryDto {
  @IsString()
  @MinLength(1, { message: 'Введіть запит для пошуку' })
  @MaxLength(100)
  q: string;
}

export class VideoPopularQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'Некоректний код регіону' })
  region?: string;
}
