/** Не частіше за раз на стільки мс пишемо `lastSeenAt` одного користувача: швидке «згорнув-розгорнув» не б'є по БД. */
export const LAST_SEEN_MIN_INTERVAL_MS = 15_000;

/**
 * Запис `User.lastSeenAt` лише при переході в офлайн і з тротлінгом на користувача: перший запис іде одразу,
 * наступні в межах вікна зливаються в один відкладений (з найсвіжішим часом), тож значення не втрачається.
 */
export class LastSeenWriter {
  private readonly lastWriteAt = new Map<string, number>();
  private readonly pending = new Map<
    string,
    { at: Date; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private readonly write: (userId: string, at: Date) => Promise<unknown>,
    private readonly minIntervalMs = LAST_SEEN_MIN_INTERVAL_MS,
    private readonly clock: () => number = Date.now,
  ) {}

  schedule(userId: string, at: Date) {
    const waiting = this.pending.get(userId);
    if (waiting) {
      waiting.at = at; // найсвіжіший час, таймер уже йде
      return;
    }
    const now = this.clock();
    const wait =
      this.minIntervalMs - (now - (this.lastWriteAt.get(userId) ?? -Infinity));
    if (wait <= 0) {
      this.flush(userId, at);
      return;
    }
    const entry = {
      at,
      timer: setTimeout(() => {
        this.pending.delete(userId);
        this.flush(userId, entry.at);
      }, wait),
    };
    entry.timer.unref?.();
    this.pending.set(userId, entry);
  }

  private flush(userId: string, at: Date) {
    this.lastWriteAt.set(userId, this.clock());
    if (this.lastWriteAt.size > 2000) {
      const cutoff = this.clock() - this.minIntervalMs;
      for (const [id, t] of this.lastWriteAt) {
        if (t < cutoff) this.lastWriteAt.delete(id);
      }
    }
    void this.write(userId, at).catch(() => undefined);
  }

  /** Зупинка сервера: відкладені записи скидаємо одразу, таймери знімаємо. */
  dispose() {
    for (const [userId, { at, timer }] of this.pending) {
      clearTimeout(timer);
      void this.write(userId, at).catch(() => undefined);
    }
    this.pending.clear();
  }
}
