import type { PrismaService } from 'src/prisma/prisma.service';
import { RoomAccessCache } from './room-access.cache';

const prisma = {} as PrismaService;

describe('RoomAccessCache', () => {
  it('asks the DB once for repeated events of the same user and room', async () => {
    const resolver = jest.fn().mockResolvedValue({ title: 'dm:a:b' });
    const cache = new RoomAccessCache(resolver);
    for (let i = 0; i < 50; i++) {
      await expect(cache.resolve(prisma, 'a', 'r1')).resolves.toEqual({
        title: 'dm:a:b',
      });
    }
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent lookups into one query', async () => {
    let release!: (v: { title: string }) => void;
    const resolver = jest.fn(
      () => new Promise<{ title: string }>((res) => (release = res)),
    );
    const cache = new RoomAccessCache(resolver);
    const all = Promise.all([
      cache.resolve(prisma, 'a', 'r1'),
      cache.resolve(prisma, 'a', 'r1'),
      cache.resolve(prisma, 'a', 'r1'),
    ]);
    release({ title: 'dm:a:b' });
    await all;
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('does not cache a denial, so a freshly added member gets in at once', async () => {
    const resolver = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ title: 'Group' });
    const cache = new RoomAccessCache(resolver);
    await expect(cache.resolve(prisma, 'a', 'r1')).resolves.toBeNull();
    await expect(cache.resolve(prisma, 'a', 'r1')).resolves.toEqual({
      title: 'Group',
    });
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('re-checks after the TTL and after invalidate (leaving a room)', async () => {
    let now = 0;
    const resolver = jest.fn().mockResolvedValue({ title: 'Group' });
    const cache = new RoomAccessCache(resolver, 1000, () => now);
    await cache.resolve(prisma, 'a', 'r1');
    now = 999;
    await cache.resolve(prisma, 'a', 'r1');
    expect(resolver).toHaveBeenCalledTimes(1);
    now = 1001;
    await cache.resolve(prisma, 'a', 'r1');
    expect(resolver).toHaveBeenCalledTimes(2);
    cache.invalidate('a', 'r1');
    await cache.resolve(prisma, 'a', 'r1');
    expect(resolver).toHaveBeenCalledTimes(3);
  });

  it('keys by user AND room', async () => {
    const resolver = jest.fn().mockResolvedValue({ title: 'Group' });
    const cache = new RoomAccessCache(resolver);
    await cache.resolve(prisma, 'a', 'r1');
    await cache.resolve(prisma, 'b', 'r1');
    await cache.resolve(prisma, 'a', 'r2');
    expect(resolver).toHaveBeenCalledTimes(3);
  });
});
