/**
 * Оптимістичні реакції, що чекають ехо `update-message-reactions`.
 *
 * Відкату за таймером немає: ехо може просто затриматися (повільна мережа, перепідключення). Відкочуємо лише
 *  - за явною помилкою від сервера (`reactionError`);
 *  - якщо сокет перепідключився, а сервер за `RESYNC_TIMEOUT_MS` так і не підтвердив (немає ні ехо, ні свіжої історії).
 * Свіжа історія кімнати після перепідключення — авторитетна: вона сама виставляє справжні реакції, тож записи знімаються.
 */
export const RESYNC_TIMEOUT_MS = 10_000;

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
};
const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class PendingReactions<R> {
  private readonly previousByMessage = new Map<string, R>();
  private resyncTimer: unknown = null;

  constructor(
    private readonly onRollback: (messageId: string, previous: R) => void,
    private readonly timers: Timers = defaultTimers,
    private readonly resyncTimeoutMs: number = RESYNC_TIMEOUT_MS,
  ) {}

  /** Запам'ятовує стан ДО першого незавершеного перемикання повідомлення. */
  track(messageId: string, previous: R) {
    if (!this.previousByMessage.has(messageId)) {
      this.previousByMessage.set(messageId, previous);
    }
  }

  has(messageId: string) {
    return this.previousByMessage.has(messageId);
  }

  /** Ехо сервера: підтверджено. */
  confirm(messageId: string) {
    this.previousByMessage.delete(messageId);
    this.stopResyncIfIdle();
  }

  /** Явна помилка сервера для цього повідомлення: відкат. */
  fail(messageId: string) {
    if (!this.previousByMessage.has(messageId)) return;
    const previous = this.previousByMessage.get(messageId) as R;
    this.previousByMessage.delete(messageId);
    this.onRollback(messageId, previous);
    this.stopResyncIfIdle();
  }

  /** Сокет перепідключився: чекаємо свіжу історію (або ехо); не дочекались — відкат решти. */
  onReconnect() {
    if (this.previousByMessage.size === 0) return;
    this.timers.clear(this.resyncTimer);
    this.resyncTimer = this.timers.set(() => {
      this.resyncTimer = null;
      for (const [messageId, previous] of [...this.previousByMessage]) {
        this.previousByMessage.delete(messageId);
        this.onRollback(messageId, previous);
      }
    }, this.resyncTimeoutMs);
  }

  /** Прийшла авторитетна історія кімнати: вона вже містить справжні реакції. */
  onHistoryResynced() {
    this.previousByMessage.clear();
    this.stopResyncIfIdle();
  }

  clear() {
    this.previousByMessage.clear();
    this.timers.clear(this.resyncTimer);
    this.resyncTimer = null;
  }

  private stopResyncIfIdle() {
    if (this.previousByMessage.size === 0) {
      this.timers.clear(this.resyncTimer);
      this.resyncTimer = null;
    }
  }
}
