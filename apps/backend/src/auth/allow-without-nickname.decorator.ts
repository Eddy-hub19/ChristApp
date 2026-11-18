import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_NICKNAME = 'allowWithoutNickname';

/** Маршрут доступен Google-пользователю, который ещё не выбрал @username (выбор ника, аватар, /auth/me). */
export const AllowWithoutNickname = () =>
  SetMetadata(ALLOW_WITHOUT_NICKNAME, true);
