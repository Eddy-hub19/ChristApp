import {
  describeDatabaseUrl,
  describeServerRegion,
  resolvePoolSettings,
} from './db-info';

describe('describeDatabaseUrl', () => {
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
    expect(describeDatabaseUrl(undefined)).toBeNull();
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
