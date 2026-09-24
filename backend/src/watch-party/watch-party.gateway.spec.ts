import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'net';
// У репозиторії лежать застарілі @types/socket.io-client (v1), що перекривають власні типи v4,
// тому беремо клієнт через require і описуємо лише те, що потрібно тесту.
type Socket = {
  emit(event: string, ...args: unknown[]): void;
  on(event: string, listener: (...args: any[]) => void): void;
  once(event: string, listener: (...args: any[]) => void): void;
  disconnect(): void;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io } = require('socket.io-client') as {
  io: (url: string, options: Record<string, unknown>) => Socket;
};
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import { WatchPartyModule } from './watch-party.module';

const ROOM = '22222222-2222-4222-8222-222222222222';

/** Справжній Socket.IO-сервер із gateway «Кіношки»; БД підмінена пам'яттю. */
function createFakePrisma() {
  const room = {
    id: ROOM,
    title: 'Тестова зала',
    videoId: 'dQw4w9WgXcQ',
    videoTitle: null,
    isPlaying: false,
    positionSec: 0,
    stateUpdatedAt: new Date(),
    hostId: 'host',
    inviteToken: 'tok',
  };
  const members = [
    { userId: 'host', status: 'JOINED' },
    { userId: 'guest', status: 'JOINED' },
  ];
  const known = {
    watchRoom: {
      findUnique: jest.fn(async () => ({ ...room })),
      update: jest.fn(async ({ data }: { data: object }) =>
        Object.assign(room, data),
      ),
      updateMany: jest.fn(async ({ data }: { data: object }) => {
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
        members.map((m, i) => ({
          userId: m.userId,
          status: m.status,
          joinedAt: new Date(i),
          user: {
            id: m.userId,
            username: m.userId,
            nickname: null,
            avatarUrl: null,
          },
        })),
      ),
    },
    watchMessage: { findMany: jest.fn(async () => []) },
    // ChatGateway теж слухає цей сокет і перевіряє, що користувач існує.
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        username: where.id,
        nickname: where.id,
        isActive: true,
      })),
    },
  };
  // Решта моделей (кімнати чату тощо) — «порожня» БД: findMany → [], інше → null.
  const emptyModel = new Proxy(
    {},
    {
      get: (_t, method: string) =>
        jest.fn(async () => (method === 'findMany' ? [] : null)),
    },
  );
  return new Proxy(known, {
    get: (target, model: string) =>
      model in target ? target[model as keyof typeof target] : emptyModel,
  });
}

function emitAck<T>(socket: Socket, event: string, body: unknown) {
  return new Promise<T>((resolve) => socket.emit(event, body, resolve));
}

function nextEvent<T>(socket: Socket, event: string) {
  return new Promise<T>((resolve) => socket.once(event, resolve));
}

describe('WatchPartyGateway (socket.io)', () => {
  let app: INestApplication;
  let url: string;
  let jwt: JwtService;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), WatchPartyModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      .overrideProvider(PushService)
      .useValue({ sendWatchInvitePush: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const connect = async (userId: string | null) => {
    const socket = io(url, {
      transports: ['websocket'],
      auth: userId ? { token: jwt.sign({ sub: userId }) } : {},
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    return socket;
  };

  it('без токена в залу не пускає', async () => {
    const anon = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(anon);
    // Сервер або відповідає UNAUTHORIZED, або (ChatGateway) одразу рве з'єднання.
    const outcome = await new Promise<string>((resolve) => {
      anon.on('disconnect', () => resolve('disconnected'));
      anon.on('connect', () => {
        anon.emit(
          'watch:join',
          { roomId: ROOM },
          (res: { ok: boolean; code: string }) =>
            resolve(res.ok ? 'joined' : res.code),
        );
      });
    });
    expect(['disconnected', 'UNAUTHORIZED']).toContain(outcome);
  });

  it('синхронізація годинника повертає серверний час', async () => {
    const s = await connect('guest');
    const t0 = Date.now();
    const res = await emitAck<{ t0: number; serverNow: number }>(
      s,
      'watch:time',
      { t0 },
    );
    expect(res.t0).toBe(t0);
    expect(Math.abs(res.serverNow - Date.now())).toBeLessThan(1000);
  });

  it('хост керує, глядач отримує стан, команди глядача відхиляються', async () => {
    const host = await connect('host');
    const guest = await connect('guest');

    const hostJoin = await emitAck<{ ok: boolean; state: { hostId: string } }>(
      host,
      'watch:join',
      { roomId: ROOM },
    );
    expect(hostJoin.ok).toBe(true);
    expect(hostJoin.state.hostId).toBe('host');

    const guestJoin = await emitAck<{ ok: boolean; presentUserIds: string[] }>(
      guest,
      'watch:join',
      { roomId: ROOM },
    );
    expect(guestJoin.ok).toBe(true);
    expect(guestJoin.presentUserIds.sort()).toEqual(['guest', 'host']);

    const broadcast = nextEvent<{
      isPlaying: boolean;
      positionSec: number;
      reason: string;
    }>(guest, 'watch:state');
    const played = await emitAck<{ ok: boolean }>(host, 'watch:play', {
      roomId: ROOM,
      positionSec: 12,
      sentAt: Date.now(),
      tag: 'hostdevice',
    });
    expect(played.ok).toBe(true);
    const state = await broadcast;
    expect(state).toMatchObject({ isPlaying: true, reason: 'play' });
    expect(state.positionSec).toBeGreaterThanOrEqual(12);

    const denied = await emitAck<{
      ok: boolean;
      code: string;
      state: { isPlaying: boolean };
    }>(guest, 'watch:pause', { roomId: ROOM, positionSec: 0 });
    expect(denied).toMatchObject({ ok: false, code: 'NOT_HOST' });
    // Відмова повертає актуальний стан, щоб глядач одразу вирівнявся.
    expect(denied.state.isPlaying).toBe(true);
  });

  it('реакції поза білим списком не розсилаються', async () => {
    const guest = await connect('guest');
    await emitAck(guest, 'watch:join', { roomId: ROOM });
    const bad = await emitAck<{ ok: boolean }>(guest, 'watch:reaction', {
      roomId: ROOM,
      emoji: '<script>',
    });
    expect(bad.ok).toBe(false);
    const good = await emitAck<{ ok: boolean }>(guest, 'watch:reaction', {
      roomId: ROOM,
      emoji: '🔥',
    });
    expect(good.ok).toBe(true);
  });
});
