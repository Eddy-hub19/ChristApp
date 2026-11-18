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

/**
 * Как `Promise.all(items.map(fn))`, но не больше `limit` задач одновременно (порядок результатов сохраняется).
 * Для рассылки пушей: шифрование и TLS-рукопожатия для сотен устройств разом блокируют event loop на десятки
 * миллисекунд (замер: 150 устройств ≈ 60 мс подряд), а игровой тик «Отары» живёт в том же процессе и опаздывает.
 * С ограничением работа идёт короткими порциями, между которыми event loop успевает обработать таймеры.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return results;
}
