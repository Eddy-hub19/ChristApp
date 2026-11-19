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

  it('returns only the host and never exposes credentials', () => {
    const info = describeDatabaseUrl(
      'postgresql://u:secret@db.example.com:5432/app?sslmode=require',
    );
    expect(info).toEqual({
      host: 'db.example.com',
      vendor: 'postgres',
      region: null,
      pooled: null,
    });
    expect(JSON.stringify(info)).not.toContain('secret');
  });

  it('copes with other hosts and garbage', () => {
    expect(describeDatabaseUrl('postgresql://u@localhost:5432/db')).toEqual({
      host: 'localhost',
      vendor: 'postgres',
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
      'postgresql://u:secret@db.example.com/db';
    expect(describeDatabaseUrl()).toMatchObject({
      host: 'db.example.com',
      vendor: 'postgres',
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
