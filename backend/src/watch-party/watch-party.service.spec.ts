import type { Server } from 'socket.io';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { PushService } from 'src/push/push.service';
import { WatchPartyService } from './watch-party.service';

const ROOM = '11111111-1111-4111-8111-111111111111';

/** Мінімальна in-memory підміна Prisma: лише ті виклики, що потрібні залі. */
function createFakePrisma() {
  const room = {
    id: ROOM,
    title: 'Вечірній перегляд',
    videoId: 'dQw4w9WgXcQ',
    videoTitle: null as string | null,
    isPlaying: false,
    positionSec: 0,
    stateUpdatedAt: new Date(),
    hostId: 'host',
    inviteToken: 'token',
  };
  const members = [
    { userId: 'host', status: 'JOINED', joinedAt: new Date(1) },
    { userId: 'alice', status: 'JOINED', joinedAt: new Date(2) },
    { userId: 'bob', status: 'JOINED', joinedAt: new Date(3) },
  ];

  const prisma = {
    watchRoom: {
      findUnique: jest.fn(async () => ({ ...room })),
      update: jest.fn(async ({ data }: { data: Partial<typeof room> }) => {
        Object.assign(room, data);
        return { ...room };
      }),
      updateMany: jest.fn(async ({ data }: { data: Partial<typeof room> }) => {
        Object.assign(room, data);
        return { count: 1 };
      }),
    },
    watchRoomMember: {
      findUnique: jest.fn(
        async ({ where }: { where: { roomId_userId: { userId: string } } }) => {
          const m = members.find(
            (x) => x.userId === where.roomId_userId.userId,
          );
          return m ? { status: m.status, room: { title: room.title } } : null;
        },
      ),
      findMany: jest.fn(async () =>
        members.map((m) => ({
          userId: m.userId,
          status: m.status,
          joinedAt: m.joinedAt,
          user: {
            id: m.userId,
            username: m.userId,
            nickname: m.userId,
            avatarUrl: null,
          },
        })),
      ),
    },
    watchMessage: { findMany: jest.fn(async () => []) },
  };
  return { prisma, room };
}

const services: WatchPartyService[] = [];

function createService() {
  const { prisma, room } = createFakePrisma();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const server = {
    to: () => ({
      emit: (event: string, payload: unknown) =>
        emitted.push({ event, payload }),
    }),
    in: () => ({ socketsLeave: () => undefined }),
  } as unknown as Server;

  const service = new WatchPartyService(
    prisma as unknown as PrismaService,
    { sendWatchInvitePush: jest.fn() } as unknown as PushService,
  );
  service.attachServer(server);
  services.push(service);
  return { service, room, emitted };
}

describe('WatchPartyService', () => {
  afterEach(() => {
    services.splice(0).forEach((s) => s.onModuleDestroy());
    jest.useRealTimers();
  });

  it('приймає команди лише від хоста', async () => {
    const { service } = createService();
    await service.joinHall(ROOM, 'host', 's-host');
    await service.joinHall(ROOM, 'alice', 's-alice');

    const denied = await service.control(ROOM, 'alice', { type: 'play' });
    expect(denied).toMatchObject({ ok: false, code: 'NOT_HOST' });

    const allowed = await service.control(ROOM, 'host', {
      type: 'play',
      positionSec: 5,
    });
    expect(allowed).toMatchObject({ ok: true });
    expect(service.currentState(ROOM)).toMatchObject({ isPlaying: true });
  });

  it('відхиляє команди від того, хто не в залі', async () => {
    const { service } = createService();
    await service.joinHall(ROOM, 'alice', 's-alice');
    const result = await service.control(ROOM, 'host', { type: 'play' });
    expect(result).toMatchObject({ ok: false, code: 'NOT_IN_ROOM' });
  });

  it('після грейсу передає керування першому присутньому', async () => {
    jest.useFakeTimers();
    const { service, room } = createService();
    await service.joinHall(ROOM, 'host', 's-host');
    await service.joinHall(ROOM, 'bob', 's-bob');
    await service.joinHall(ROOM, 'alice', 's-alice');

    service.leaveHall(ROOM, 'host', 's-host');
    expect(service.currentState(ROOM)?.hostId).toBe('host');

    await jest.advanceTimersByTimeAsync(15_000);
    // alice приєдналася до кімнати раніше за bob — вона й отримує керування.
    expect(service.currentState(ROOM)?.hostId).toBe('alice');
    expect(room.hostId).toBe('alice');
  });

  it('хост встиг перепідключитися — керування лишається в нього', async () => {
    jest.useFakeTimers();
    const { service } = createService();
    await service.joinHall(ROOM, 'host', 's-host');
    await service.joinHall(ROOM, 'alice', 's-alice');

    service.leaveHall(ROOM, 'host', 's-host');
    await jest.advanceTimersByTimeAsync(5_000);
    await service.joinHall(ROOM, 'host', 's-host-2');
    await jest.advanceTimersByTimeAsync(15_000);

    expect(service.currentState(ROOM)?.hostId).toBe('host');
  });

  it('якщо передати нікому — пауза, а перший, хто зайде, стає хостом', async () => {
    jest.useFakeTimers();
    const { service, room } = createService();
    await service.joinHall(ROOM, 'host', 's-host');
    await service.control(ROOM, 'host', { type: 'play', positionSec: 30 });

    service.leaveHall(ROOM, 'host', 's-host');
    await jest.advanceTimersByTimeAsync(15_000);
    expect(room.isPlaying).toBe(false);
    expect(room.positionSec).toBeGreaterThanOrEqual(30);

    const joined = await service.joinHall(ROOM, 'bob', 's-bob');
    expect(joined.ok).toBe(true);
    await jest.advanceTimersByTimeAsync(0);
    // Після рестарту зали (runtime вивантажено) хост повертається через звичайний грейс.
    await jest.advanceTimersByTimeAsync(15_000);
    expect(service.currentState(ROOM)?.hostId).toBe('bob');
  });
});

describe('WatchPartyService.listForUser', () => {
  afterEach(() => {
    services.splice(0).forEach((s) => s.onModuleDestroy());
  });

  it('віддає provider і thumbnailUrl кімнати з БД (не лише videoId/videoTitle)', async () => {
    const dbRoom = {
      id: ROOM,
      title: 'Вечірній перегляд',
      provider: 'VIMEO',
      videoId: '76979871',
      videoTitle: 'DB title',
      thumbnailUrl: 'https://i.vimeocdn.com/video/db.jpg',
      isPlaying: false,
      stateUpdatedAt: new Date(),
      createdAt: new Date(),
      host: { id: 'host', username: 'host', nickname: null, avatarUrl: null },
      _count: { members: 2 },
    };
    const prisma = {
      watchRoomMember: {
        findMany: jest.fn(async () => [
          { status: 'JOINED', invitedById: null, room: dbRoom },
        ]),
      },
      user: { findMany: jest.fn(async () => []) },
    };
    const server = {
      to: () => ({ emit: () => undefined }),
      in: () => ({ socketsLeave: () => undefined }),
    } as unknown as Server;
    const service = new WatchPartyService(
      prisma as unknown as PrismaService,
      { sendWatchInvitePush: jest.fn() } as unknown as PushService,
    );
    service.attachServer(server);
    services.push(service);

    const { rooms } = await service.listForUser('host');
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      provider: 'VIMEO',
      thumbnailUrl: 'https://i.vimeocdn.com/video/db.jpg',
    });
  });
});
