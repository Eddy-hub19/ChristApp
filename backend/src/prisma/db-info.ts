/** Де живе база (за хостом з DATABASE_URL; пароль і логін не читаємо й не віддаємо). */
export type DbLocation = {
  host: string;
  /** `neon` | `other` */
  vendor: string;
  /** Регіон хмари, напр. `us-east-1` (null, якщо в хості його нема). */
  region: string | null;
  /** Хост із суфіксом `-pooler` (PgBouncer у Neon). Для не-Neon хостів null: невідомо. */
  pooled: boolean | null;
};

/** `ep-name-123456[-pooler].us-east-1.aws.neon.tech` -> регіон і пулер. */
export function describeDatabaseUrl(
  url: string | undefined = process.env.DATABASE_URL,
): DbLocation | null {
  let host: string;
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    return null;
  }
  const neon =
    /^(ep-[a-z0-9-]+?)(-pooler)?\.([a-z0-9-]+)\.(?:aws|azure)\.neon\.tech$/i.exec(
      host,
    );
  if (neon) {
    return {
      host,
      vendor: 'neon',
      region: neon[3].toLowerCase(),
      pooled: Boolean(neon[2]),
    };
  }
  return { host, vendor: 'other', region: null, pooled: null };
}

/** Регіони Render -> регіон AWS, у якому вони розміщені (для порівняння з регіоном Neon). */
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
