type KeyedMessage = { id: string; createdAt: string };

function sameMessage(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function timeOf(message: KeyedMessage): number {
  const ts = Date.parse(message.createdAt);
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * Зводить показаний список (з кешу або попередньої версії) зі свіжою історією сервера.
 * Сервер — істина в межах завантаженого вікна: видалені повідомлення зникають, редагування й реакції
 * оновлюються, нові додаються. Незмінені повідомлення лишаються тими самими об'єктами (без зайвих
 * перемальовувань і стрибків), а живі повідомлення новіші за останнє у відповіді не губляться.
 */
export function reconcileMessages<T extends KeyedMessage>(prev: T[], fresh: T[]): T[] {
  const prevById = new Map(prev.map((message) => [message.id, message]));
  const merged = fresh.map((message) => {
    const existing = prevById.get(message.id);
    return existing && sameMessage(existing, message) ? existing : message;
  });

  if (fresh.length > 0) {
    const freshIds = new Set(fresh.map((message) => message.id));
    const newestFresh = Math.max(...fresh.map(timeOf));
    const live = prev.filter((message) => !freshIds.has(message.id) && timeOf(message) > newestFresh);
    merged.push(...live);
  }

  const unchanged = merged.length === prev.length && merged.every((message, index) => message === prev[index]);
  return unchanged ? prev : merged;
}
