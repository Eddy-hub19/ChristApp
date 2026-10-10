/** Скільки історії тримаємо для адмінки: 5 хвилин. */
export const QUERY_STATS_WINDOW_MS = 5 * 60_000;
/** Ширина стовпчика графіка. */
export const QUERY_STATS_BUCKET_MS = 5_000;
/** Запобіжник пам'яті: стільки записів вистачає на ~65 запитів/с за вікно. */
const MAX_ENTRIES = 20_000;

type Entry = { t: number; label: string; ms: number };

export type TopQuery = {
  label: string;
  count: number;
  perSec: number;
  avgMs: number;
};

export type QueryStatsSnapshot = {
  windowSec: number;
  total: number;
  /** Середнє за вікно (або за час життя процесу, якщо він молодший за вікно). */
  perSec: number;
  /** Запитів/с по 5-секундних стовпчиках, від старого до нового (60 шт = 5 хв). */
  series: number[];
  top: TopQuery[];
};

/**
 * Людиночитний ярлик SQL без параметрів: `SELECT User`, `UPDATE RoomReadState`, `BEGIN`.
 * Групуємо за операцією й таблицею - цього досить, щоб побачити, хто «стукає» в базу.
 */
export function queryLabel(sql: string): string {
  const text = sql.trim();
  const op = /^(\w+)/.exec(text)?.[1]?.toUpperCase() ?? '?';
  const table =
    op === 'SELECT' || op === 'DELETE'
      ? /\bFROM\s+(?:"[^"]+"\.)?"?([A-Za-z_][\w]*)"?/i.exec(text)?.[1]
      : op === 'INSERT'
        ? /\bINTO\s+(?:"[^"]+"\.)?"?([A-Za-z_][\w]*)"?/i.exec(text)?.[1]
        : op === 'UPDATE'
          ? /^UPDATE\s+(?:"[^"]+"\.)?"?([A-Za-z_][\w]*)"?/i.exec(text)?.[1]
          : undefined;
  return table ? `${op} ${table}` : op === 'SELECT' ? text.slice(0, 40) : op;
}

/** Лічильник запитів до БД у пам'яті: кільце за останні 5 хвилин для графіка й топ-5 в адмінці. */
export class DbQueryStats {
  private entries: Entry[] = [];
  private total = 0;
  private readonly startedAt: number;

  constructor(private readonly clock: () => number = Date.now) {
    this.startedAt = clock();
  }

  record(sql: string, durationMs: number, now: number = this.clock()) {
    this.total += 1;
    this.entries.push({ t: now, label: queryLabel(sql), ms: durationMs });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
  }

  /** Скільки запитів зафіксовано за весь час життя процесу (для приросту між зразками метрик). */
  totalRecorded(): number {
    return this.total;
  }

  private prune(now: number) {
    const cutoff = now - QUERY_STATS_WINDOW_MS;
    let drop = 0;
    while (drop < this.entries.length && this.entries[drop].t < cutoff) drop++;
    if (drop > 0) this.entries.splice(0, drop);
  }

  snapshot(now: number = this.clock(), topN = 5): QueryStatsSnapshot {
    this.prune(now);
    const buckets = QUERY_STATS_WINDOW_MS / QUERY_STATS_BUCKET_MS;
    const counts = new Array<number>(buckets).fill(0);
    const byLabel = new Map<string, { count: number; ms: number }>();
    for (const e of this.entries) {
      const idx = buckets - 1 - Math.floor((now - e.t) / QUERY_STATS_BUCKET_MS);
      if (idx >= 0 && idx < buckets) counts[idx] += 1;
      const agg = byLabel.get(e.label) ?? { count: 0, ms: 0 };
      agg.count += 1;
      agg.ms += e.ms;
      byLabel.set(e.label, agg);
    }
    const spanSec = Math.max(
      1,
      Math.min(QUERY_STATS_WINDOW_MS, now - this.startedAt) / 1000,
    );
    const round = (n: number, k = 10) => Math.round(n * k) / k;
    return {
      windowSec: QUERY_STATS_WINDOW_MS / 1000,
      total: this.entries.length,
      perSec: round(this.entries.length / spanSec),
      series: counts.map((c) => round(c / (QUERY_STATS_BUCKET_MS / 1000))),
      top: [...byLabel.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, topN)
        .map(([label, a]) => ({
          label,
          count: a.count,
          perSec: round(a.count / spanSec, 100),
          avgMs: round(a.ms / a.count),
        })),
    };
  }
}
