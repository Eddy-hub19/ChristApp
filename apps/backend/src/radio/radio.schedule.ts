/**
 * «Christ Radio»: чистая логика расписания (без БД, таймеров и сокетов), чтобы её можно было проверять отдельно.
 * Очередь идёт по кругу в порядке `position`; эфир - это пара «какой трек» + «когда он начался».
 */

export interface RadioQueueItem {
  id: string;
  durationMs: number;
}

export interface RadioPosition {
  trackId: string;
  startedAtMs: number;
}

/** Id трека, который идёт после `trackId` по кругу (для одного трека - он же). null - очередь пуста. */
export function nextTrackId(queue: readonly RadioQueueItem[], trackId: string | null): string | null {
  if (queue.length === 0) return null;
  const index = trackId ? queue.findIndex((t) => t.id === trackId) : -1;
  return queue[(index + 1) % queue.length].id;
}

/**
 * Приводит позицию эфира к моменту `nowMs`:
 *  - очередь пуста -> null (эфир офлайн);
 *  - позиции нет или её трек удалён -> эфир стартует с `startFromId` (если он в очереди) или с первого трека прямо сейчас;
 *  - трек доигрывается -> та же позиция;
 *  - трек закончился -> переходим к следующим, при долгой паузе (рестарт сервера) пропускаем целые круги очереди.
 */
export function advanceStation(
  queue: readonly RadioQueueItem[],
  current: RadioPosition | null,
  nowMs: number,
  startFromId?: string | null,
): RadioPosition | null {
  if (queue.length === 0) return null;
  let index = current ? queue.findIndex((t) => t.id === current.trackId) : -1;
  if (!current || index < 0) {
    const from = startFromId ? queue.findIndex((t) => t.id === startFromId) : -1;
    return { trackId: queue[from >= 0 ? from : 0].id, startedAtMs: nowMs };
  }
  let start = current.startedAtMs;
  if (nowMs < start + queue[index].durationMs) return { trackId: current.trackId, startedAtMs: start };
  const cycle = queue.reduce((sum, t) => sum + t.durationMs, 0);
  if (cycle <= 0) return { trackId: queue[index].id, startedAtMs: nowMs };
  const skipped = Math.floor((nowMs - start) / cycle);
  start += skipped * cycle;
  // не больше одного круга шагов: после пропуска целых кругов остаток меньше длины очереди
  for (let guard = 0; guard <= queue.length && nowMs >= start + queue[index].durationMs; guard++) {
    start += queue[index].durationMs;
    index = (index + 1) % queue.length;
  }
  return { trackId: queue[index].id, startedAtMs: start };
}

/** Когда текущий трек закончится (мс с эпохи); null, если эфира нет. */
export function trackEndsAt(queue: readonly RadioQueueItem[], pos: RadioPosition | null): number | null {
  if (!pos) return null;
  const item = queue.find((t) => t.id === pos.trackId);
  return item ? pos.startedAtMs + item.durationMs : null;
}
