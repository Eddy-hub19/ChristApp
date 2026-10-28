import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/** 429 с кодом и числом минут: фронт сам подставляет перевод «Забагато спроб, спробуйте через N хвилин». */
export class RateLimitedException extends HttpException {
  constructor(retryAfterMs: number) {
    const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: `Слишком много попыток. Повторите через ${retryAfterMinutes} мин.`,
        retryAfterMinutes,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Фиксированное окно: счётчик живёт `windowMs` с первой записи по ключу. Один процесс - одно состояние. */
export class AttemptWindow {
  private readonly entries = new Map<
    string,
    { count: number; until: number }
  >();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Сколько мс ждать, если лимит уже исчерпан, иначе 0. */
  blockedFor(key: string): number {
    const hit = this.entries.get(key);
    if (!hit) return 0;
    const now = this.clock();
    if (hit.until <= now) {
      this.entries.delete(key);
      return 0;
    }
    return hit.count >= this.max ? hit.until - now : 0;
  }

  hit(key: string) {
    const now = this.clock();
    const hit = this.entries.get(key);
    if (hit && hit.until > now) {
      hit.count += 1;
      return;
    }
    if (this.entries.size >= 10_000) {
      for (const [k, e] of this.entries) {
        if (e.until <= now) this.entries.delete(k);
      }
      if (this.entries.size >= 10_000) this.entries.clear();
    }
    this.entries.set(key, { count: 1, until: now + this.windowMs });
  }

  reset(key: string) {
    this.entries.delete(key);
  }
}

const MINUTE = 60_000;

/** IP клиента: наш Next-прокси кладёт реальный адрес в `x-client-ip` (иначе бэкенд видел бы только адрес Vercel). */
export function clientIp(req?: Request): string {
  if (!req) return 'unknown';
  const forwarded = req.headers['x-client-ip'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const trimmed = typeof value === 'string' ? value.trim().slice(0, 64) : '';
  return trimmed || req.ip || 'unknown';
}

/**
 * Защита от подбора. Вход: неудачные попытки считаются и по IP, и по нику (ник блокируется у всех, кто его перебирает);
 * успешный вход обнуляет счётчик ника. Регистрация, Google и проверка ника: считаются все обращения по IP.
 */
@Injectable()
export class AuthRateLimiter {
  private readonly loginIp = new AttemptWindow(20, 15 * MINUTE);
  private readonly loginIdentifier = new AttemptWindow(5, 15 * MINUTE);
  private readonly register = new AttemptWindow(10, 60 * MINUTE);
  private readonly google = new AttemptWindow(30, 15 * MINUTE);
  private readonly usernameCheck = new AttemptWindow(60, 10 * MINUTE);

  private static assertOpen(blockedMs: number) {
    if (blockedMs > 0) throw new RateLimitedException(blockedMs);
  }

  assertLoginAllowed(ip: string, identifier: string) {
    AuthRateLimiter.assertOpen(
      Math.max(
        this.loginIp.blockedFor(ip),
        this.loginIdentifier.blockedFor(identifier),
      ),
    );
  }

  recordLoginFailure(ip: string, identifier: string) {
    this.loginIp.hit(ip);
    this.loginIdentifier.hit(identifier);
  }

  recordLoginSuccess(identifier: string) {
    this.loginIdentifier.reset(identifier);
  }

  countRegister(ip: string) {
    AuthRateLimiter.assertOpen(this.register.blockedFor(ip));
    this.register.hit(ip);
  }

  countGoogle(ip: string) {
    AuthRateLimiter.assertOpen(this.google.blockedFor(ip));
    this.google.hit(ip);
  }

  countUsernameCheck(ip: string) {
    AuthRateLimiter.assertOpen(this.usernameCheck.blockedFor(ip));
    this.usernameCheck.hit(ip);
  }
}
