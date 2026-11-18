/** Скільки HTTP-запити довіряють уже завантаженому користувачу: далі JwtStrategy перечитує його з БД. */
export const AUTH_USER_TTL_MS = 30_000;
const MAX_ENTRIES = 2_000;

/**
 * Кеш користувача для JwtStrategy: без нього кожен авторизований HTTP-запит (опитування непрочитаного, статусу пушів,
 * кімнат кінотеатру) починався із запиту `SELECT User`. Усе, що змінює користувача (профіль, аватар, видалення),
 * викликає `invalidate`, тож застарілих даних після власної правки нема; деактивація без цього зачекає до TTL.
 * Один процес - один кеш (як `presence`).
 */
export class AuthUserCache<T> {
  private readonly entries = new Map<string, { user: T; until: number }>();

  constructor(
    private readonly ttlMs = AUTH_USER_TTL_MS,
    private readonly clock: () => number = Date.now,
  ) {}

  get(userId: string): T | undefined {
    const hit = this.entries.get(userId);
    if (!hit) return undefined;
    if (hit.until <= this.clock()) {
      this.entries.delete(userId);
      return undefined;
    }
    return hit.user;
  }

  set(userId: string, user: T) {
    if (this.entries.size >= MAX_ENTRIES) {
      const now = this.clock();
      for (const [id, e] of this.entries) {
        if (e.until <= now) this.entries.delete(id);
      }
      if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    }
    this.entries.set(userId, { user, until: this.clock() + this.ttlMs });
  }

  invalidate(userId: string) {
    this.entries.delete(userId);
  }
}

export const authUserCache = new AuthUserCache<unknown>();
