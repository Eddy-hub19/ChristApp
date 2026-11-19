/** Де живе база (за хостом з DATABASE_URL; пароль і логін не читаємо й не віддаємо). */
export type DbLocation = {
  host: string;
  /** Сейчас всегда `postgres`. */
  vendor: string;
  /** Регіон хмари, напр. `us-east-1` (null, якщо в хості його нема). */
  region: string | null;
  /** Через пулер ли идёт подключение; null - неизвестно. */
  pooled: boolean | null;
};

/** Хост з DATABASE_URL (без логіна й пароля). */
export function describeDatabaseUrl(
  url: string | undefined = process.env.DATABASE_URL,
): DbLocation | null {
  let host: string;
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    return null;
  }
  return { host, vendor: 'postgres', region: null, pooled: null };
}

/** Регіони Render -> регіон AWS, у якому вони розміщені (для порівняння з регіоном бази). */
export const RENDER_REGION_TO_AWS: Record<string, string> = {
  oregon: 'us-west-2',
  ohio: 'us-east-2',
  virginia: 'us-east-1',
  frankfurt: 'eu-central-1',
  singapore: 'ap-southeast-1',
};

export type ServerLocation = {
  /** З `RENDER_REGION` (задається вручну: Render не віддає регіон у змінних середовища); null - не задано. */
  renderRegion: string | null;
  awsRegion: string | null;
};

export function describeServerRegion(
  raw: string | undefined = process.env.RENDER_REGION,
): ServerLocation {
  const key = raw?.trim().toLowerCase() ?? '';
  if (!key) return { renderRegion: null, awsRegion: null };
  return { renderRegion: key, awsRegion: RENDER_REGION_TO_AWS[key] ?? null };
}

/** Налаштування пулу pg (Prisma 7 + driver adapter ігнорує connection_limit / pool_timeout з URL - діють лише ці). */
export type PoolSettings = {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
};

const positiveInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export function resolvePoolSettings(
  env: NodeJS.ProcessEnv = process.env,
): PoolSettings {
  return {
    max: positiveInt(env.DB_POOL_MAX, 10),
    // без ліміту черга на з'єднання росла б безмежно, поки база повільна; 10 с - і клієнт отримує помилку
    connectionTimeoutMillis: positiveInt(
      env.DB_POOL_CONNECT_TIMEOUT_MS,
      10_000,
    ),
    // 30 с замість 10 с за замовчуванням pg: нове з'єднання (TLS + авторизація) коштує кілька RTT
    idleTimeoutMillis: positiveInt(env.DB_POOL_IDLE_MS, 30_000),
  };
}
