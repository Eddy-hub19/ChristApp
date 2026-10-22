/**
 * «Публичный пользователь»: единственный способ отдавать данные другого человека наружу (HTTP, сокеты, вложенные в сообщения,
 * реакции, комнаты и кинотеатр объекты). Никаких `include: { user: true }` / `sender: true` / `findUnique` без `select`:
 * в строке User лежат пароль (хеш), email и другие приватные поля.
 *
 *  - `PUBLIC_USER_SELECT` - минимум для подписи и аватарки в любом объекте;
 *  - `PUBLIC_USER_PROFILE_SELECT` - то же + то, что видно в справочнике и профиле (без email);
 *  - `toPublicUser` - allowlist-копия поверх любого объекта (на случай, если строка пришла не из select).
 * Свои приватные данные (email, оформление) отдаёт только `profileSelect` в users/auth - и только самому пользователю.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true,
  /** Стиль пузырей виден всем, кто читает сообщения (config/bubble-styles.ts). */
  bubbleStyle: true,
} as const;

export const PUBLIC_USER_PROFILE_SELECT = {
  ...PUBLIC_USER_SELECT,
  createdAt: true,
  lastSeenAt: true,
  isActive: true,
  bio: true,
} as const;

export interface PublicUser {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  bubbleStyle?: string | null;
}

/** Копия только с публичными полями (остальное отбрасывается, даже если оно есть в исходном объекте). */
export function toPublicUser(
  user: Pick<PublicUser, 'id' | 'username'> &
    Partial<Pick<PublicUser, 'nickname' | 'avatarUrl' | 'bubbleStyle'>>,
): PublicUser {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bubbleStyle: user.bubbleStyle ?? 'default',
  };
}
