import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GoogleCodeDto {
  /** Одноразовый authorization code от Google (меняется на ID-токен на сервере). */
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  code: string;

  @IsString()
  @MaxLength(512)
  redirectUri: string;

  /** Nonce из куки старта: сверяется с claim `nonce` внутри ID-токена. */
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  nonce: string;

  @IsIn(['login', 'link'])
  mode: 'login' | 'link';
}

export class ChooseNicknameDto {
  @IsString({ message: 'Username обязателен' })
  @MinLength(3, { message: 'Username должен быть не короче 3 символов' })
  @MaxLength(20, { message: 'Username не должен превышать 20 символов' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username может содержать только латиницу, цифры и _',
  })
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Введите имя' })
  @MaxLength(40)
  nickname?: string;
}

export class SetPasswordDto {
  @IsString({ message: 'Пароль обязателен' })
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  @MaxLength(72, { message: 'Пароль не должен превышать 72 символа' })
  password: string;
}
