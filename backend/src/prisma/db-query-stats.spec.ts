import { DbQueryStats, queryLabel } from './db-query-stats';

describe('queryLabel', () => {
  it('names a statement by operation and table', () => {
    expect(
      queryLabel(
        'SELECT "public"."User"."id" FROM "public"."User" WHERE "id" = $1 LIMIT $2',
      ),
    ).toBe('SELECT User');
    expect(
      queryLabel('INSERT INTO "public"."Message" ("id") VALUES ($1)'),
    ).toBe('INSERT Message');
    expect(
      queryLabel(
        'UPDATE "public"."User" SET "lastSeenAt" = $1 WHERE "id" = $2',
      ),
    ).toBe('UPDATE User');
    expect(queryLabel('DELETE FROM "public"."Reaction" WHERE id = $1')).toBe(
      'DELETE Reaction',
    );
    expect(queryLabel('BEGIN')).toBe('BEGIN');
    expect(queryLabel('SELECT 1')).toBe('SELECT 1');
  });
});

describe('DbQueryStats', () => {
  it('counts queries per second, builds a 60-bucket series and a top list', () => {
    let now = 1_000_000;
    const stats = new DbQueryStats(() => now);
    now += 60_000; // процес прожив хвилину
    for (let i = 0; i < 120; i++) {
      stats.record('SELECT "x" FROM "public"."User"', 2);
    }
    for (let i = 0; i < 30; i++) {
      stats.record('UPDATE "public"."RoomReadState" SET a = $1', 4);
    }
    const snap = stats.snapshot();
    expect(snap.total).toBe(150);
    expect(snap.perSec).toBe(2.5);
    expect(snap.series).toHaveLength(60);
    expect(snap.series[59]).toBe(30); // 150 запитів в останньому 5-секундному стовпчику = 30/с
    expect(snap.top[0]).toEqual({
      label: 'SELECT User',
      count: 120,
      perSec: 2,
      avgMs: 2,
    });
    expect(snap.top[1].label).toBe('UPDATE RoomReadState');
  });

  it('forgets queries older than five minutes and caps the top list', () => {
    let now = 0;
    const stats = new DbQueryStats(() => now);
    stats.record('SELECT 1', 1);
    now += 5 * 60_000 + 1;
    expect(stats.snapshot().total).toBe(0);
    for (let i = 0; i < 8; i++) stats.record(`DELETE FROM "T${i}"`, 1);
    expect(stats.snapshot().top).toHaveLength(5);
  });
});
