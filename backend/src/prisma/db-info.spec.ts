import {
  describeDatabaseUrl,
  describeServerRegion,
  resolvePoolSettings,
} from './db-info';

describe('describeDatabaseUrl', () => {
  // Без аргументу функція читає process.env.DATABASE_URL — тест не має залежати від .env розробника/CI.
  const originalUrl = process.env.DATABASE_URL;
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it('reads the Neon region and detects a direct (non-pooler) host', () => {
    expect(
      describeDatabaseUrl(
        'postgresql://u:secret@ep-wandering-butterfly-a4tj4gdr.us-east-1.aws.neon.tech/neondb?sslmode=require',
      ),
    ).toEqual({
      host: 'ep-wandering-butterfly-a4tj4gdr.us-east-1.aws.neon.tech',
      vendor: 'neon',
      region: 'us-east-1',
      pooled: false,
    });
  });

  it('detects the -pooler host and never exposes credentials', () => {
    const info = describeDatabaseUrl(
      'postgresql://u:secret@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/db',
    );
    expect(info).toMatchObject({ region: 'eu-central-1', pooled: true });
    expect(JSON.stringify(info)).not.toContain('secret');
  });

  it('copes with other hosts and garbage', () => {
    expect(describeDatabaseUrl('postgresql://u@localhost:5432/db')).toEqual({
      host: 'localhost',
      vendor: 'other',
      region: null,
      pooled: null,
    });
    expect(describeDatabaseUrl('nonsense')).toBeNull();
    expect(describeDatabaseUrl('')).toBeNull();
  });

  it('falls back to DATABASE_URL when called without an argument', () => {
    delete process.env.DATABASE_URL;
    expect(describeDatabaseUrl()).toBeNull();
    expect(describeDatabaseUrl(undefined)).toBeNull();

    process.env.DATABASE_URL =
      'postgresql://u:secret@ep-a-1.us-east-1.aws.neon.tech/db';
    expect(describeDatabaseUrl()).toMatchObject({
      vendor: 'neon',
      region: 'us-east-1',
    });
  });
});

describe('describeServerRegion', () => {
  it('maps a Render region name to its AWS region', () => {
    expect(describeServerRegion('Frankfurt')).toEqual({
      renderRegion: 'frankfurt',
      awsRegion: 'eu-central-1',
    });
    expect(describeServerRegion(undefined)).toEqual({
      renderRegion: null,
      awsRegion: null,
    });
  });
});

describe('resolvePoolSettings', () => {
  it('has safe defaults and reads overrides', () => {
    expect(resolvePoolSettings({})).toEqual({
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    expect(
      resolvePoolSettings({ DB_POOL_MAX: '6', DB_POOL_IDLE_MS: 'x' }),
    ).toMatchObject({ max: 6, idleTimeoutMillis: 30_000 });
  });
});
