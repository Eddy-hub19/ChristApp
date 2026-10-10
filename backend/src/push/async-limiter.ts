/**
 * Ограничивает число одновременно выполняемых асинхронных задач; остальные ждут в очереди (FIFO).
 * Нужен, чтобы тяжёлая фоновая работа (пуши + подсчёт бейджей по всем получателям) не занимала весь
 * пул соединений с БД и не задерживала путь «сообщение → emit» следующих сообщений.
 */
export class AsyncLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
