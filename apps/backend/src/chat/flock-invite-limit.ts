/** Службове повідомлення-запрошення в «Отару»: `[[flock-invite:<арена>]]` (див. frontend/src/lib/flockInviteMessage.ts). */
const FLOCK_INVITE_RE = /^\[\[flock-invite:\d{1,9}\]\]$/;

export const FLOCK_INVITE_COOLDOWN_MS = 60_000;

export function isFlockInviteContent(content: string): boolean {
  return FLOCK_INVITE_RE.test(content.trim());
}

/**
 * Не частіше одного запрошення в «Отару» на користувача за `cooldownMs` (для загального чату, де його бачать усі).
 * Стан лише в пам'яті процесу — як і решта лімітів шлюзу; після рестарту ліміт скидається.
 */
export class FlockInviteLimiter {
  private readonly lastAt = new Map<string, number>();

  constructor(private readonly cooldownMs = FLOCK_INVITE_COOLDOWN_MS) {}

  /** 0 — можна (слот зайнято одразу); інакше — скільки секунд лишилось чекати. */
  tryAcquire(userId: string, now = Date.now()): number {
    const last = this.lastAt.get(userId);
    if (last !== undefined && now - last < this.cooldownMs) {
      return Math.ceil((this.cooldownMs - (now - last)) / 1000);
    }
    this.lastAt.set(userId, now);
    if (this.lastAt.size > 1_000) this.sweep(now);
    return 0;
  }

  private sweep(now: number) {
    for (const [id, at] of this.lastAt) {
      if (now - at >= this.cooldownMs) this.lastAt.delete(id);
    }
  }
}
