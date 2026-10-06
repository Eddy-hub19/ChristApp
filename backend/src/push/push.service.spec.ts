import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PushService } from './push.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

jest.mock('web-push', () => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'WebPushError';
      this.statusCode = statusCode;
    }
  }

  return {
    WebPushError,
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  };
});

type PrismaMock = {
  room: {
    findUnique: jest.Mock;
  };
  user: {
    findMany: jest.Mock;
  };
  roomMember: {
    findMany: jest.Mock;
  };
  pushSubscription: {
    count: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  watchRoomMember: {
    findMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
};

const GLOBAL_ROOM = '00000000-0000-0000-0000-000000000001';

function createPrismaMock(): PrismaMock {
  return {
    room: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    roomMember: {
      findMany: jest.fn(),
    },
    pushSubscription: {
      count: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    watchRoomMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function createConfigMock(): Pick<ConfigService, 'get'> {
  return {
    get: jest.fn((key: string) => {
      if (key === 'WEB_PUSH_PUBLIC_KEY') return 'public-key';
      if (key === 'WEB_PUSH_PRIVATE_KEY') return 'private-key';
      if (key === 'WEB_PUSH_SUBJECT') return 'mailto:test@example.com';
      return undefined;
    }),
  };
}

describe('PushService', () => {
  let prisma: PrismaMock;
  let config: Pick<ConfigService, 'get'>;
  let messagesService: { getUnreadTotalsForUsers: jest.Mock };
  let service: PushService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    config = createConfigMock();
    messagesService = {
      // Бейдж рахується пакетно: userId → кількість непрочитаних.
      getUnreadTotalsForUsers: jest
        .fn()
        .mockImplementation((userIds: string[]) =>
          Promise.resolve(new Map(userIds.map((id) => [id, 2]))),
        ),
    };
    service = new PushService(
      prisma as never,
      config as ConfigService,
      messagesService as never,
    );

    (webPush.sendNotification as jest.Mock).mockResolvedValue(undefined);
    prisma.pushSubscription.update.mockResolvedValue({});
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    prisma.pushSubscription.delete.mockResolvedValue({});
  });

  it('sends global chat push with normalized latest message body', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u2' }, { id: 'u3' }]);
    prisma.room.findUnique.mockResolvedValue({ title: 'global-chat' });
    prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://example.com/u2',
        p256dh: 'k1',
        auth: 'a1',
      },
      {
        id: 's3',
        userId: 'u3',
        endpoint: 'https://example.com/u3',
        p256dh: 'k2',
        auth: 'a2',
      },
    ]);

    await service.sendChatMessagePush({
      messageId: 'msg-push-1',
      roomId: GLOBAL_ROOM,
      senderId: 'u1',
      senderUsername: 'sender',
      content: '[[reply:{"id":"msg-1"}]]   Последнее   сообщение  ',
      createdAt: new Date('2026-03-13T10:00:00.000Z'),
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          not: 'u1',
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    expect(webPush.sendNotification).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(
      (webPush.sendNotification as jest.Mock).mock.calls[0][1],
    );

    expect(firstPayload.body).toBe('sender: Последнее сообщение');
    expect(firstPayload.title).toBe('Загальний чат');
    expect(firstPayload.targetUrl).toBe('/chat/global');
    expect(firstPayload.roomId).toBe(GLOBAL_ROOM);
    expect(firstPayload.messageId).toBe('msg-push-1');
    expect(firstPayload.badgeCount).toBe(2);
  });

  it('sends direct message push only to recipient without duplicates', async () => {
    prisma.roomMember.findMany.mockResolvedValue([
      { userId: 'u2' },
      { userId: 'u2' },
      { userId: 'u2' },
    ]);
    prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });
    prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://example.com/u2',
        p256dh: 'k1',
        auth: 'a1',
      },
    ]);

    await service.sendChatMessagePush({
      messageId: 'msg-dm-1',
      roomId: 'room-dm',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Привет, это последнее сообщение',
      createdAt: new Date('2026-03-13T10:01:00.000Z'),
    });

    expect(prisma.roomMember.findMany).toHaveBeenCalledWith({
      where: {
        roomId: 'room-dm',
        userId: {
          not: 'u1',
        },
      },
      select: {
        userId: true,
      },
    });

    const findManyArg = prisma.pushSubscription.findMany.mock.calls[0][0];
    expect(findManyArg.where.userId.in).toEqual(['u2']);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      (webPush.sendNotification as jest.Mock).mock.calls[0][1],
    );

    expect(payload.targetUrl).toBe('/chat/u1');
    expect(payload.title).toBe('sender');
    expect(payload.body).toBe('Привет, это последнее сообщение');
    expect(payload.messageId).toBe('msg-dm-1');
    expect(payload.badgeCount).toBe(2);
  });

  it('does not send dm push to users not in dm title (spurious room members)', async () => {
    prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });
    prisma.roomMember.findMany.mockResolvedValue([
      { userId: 'u2' },
      { userId: 'u3' },
    ]);
    prisma.pushSubscription.findMany.mockResolvedValue([]);

    await service.sendChatMessagePush({
      messageId: 'msg-x',
      roomId: 'room-dm',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Только u2',
      createdAt: new Date('2026-03-13T10:01:00.000Z'),
    });

    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['u2'] } },
      }),
    );
  });

  it('deletes expired subscription when push endpoint is gone', async () => {
    prisma.roomMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
    prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });
    prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://example.com/u2',
        p256dh: 'k1',
        auth: 'a1',
      },
    ]);
    const err = new webPush.WebPushError(
      'Received unexpected response code',
      410,
    );
    (webPush.sendNotification as jest.Mock).mockRejectedValue(err);

    await service.sendChatMessagePush({
      messageId: 'msg-410',
      roomId: 'room-dm',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Проверка',
      createdAt: new Date('2026-03-13T10:02:00.000Z'),
    });

    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { id: 's2' },
    });
  });

  it('falls back to deleteMany by endpoint when delete by id fails', async () => {
    prisma.roomMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
    prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });
    prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://example.com/u2',
        p256dh: 'k1',
        auth: 'a1',
      },
    ]);
    prisma.pushSubscription.delete.mockRejectedValue(new Error('not found'));
    const err = new webPush.WebPushError(
      'Received unexpected response code',
      404,
    );
    (webPush.sendNotification as jest.Mock).mockRejectedValue(err);

    await service.sendChatMessagePush({
      messageId: 'msg-404',
      roomId: 'room-dm',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Проверка',
      createdAt: new Date('2026-03-13T10:02:00.000Z'),
    });

    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://example.com/u2' },
    });
  });

  describe('delivery', () => {
    const sub = (id: string, userId: string) => ({
      id,
      userId,
      endpoint: `https://example.com/${id}`,
      p256dh: 'k',
      auth: 'a',
    });

    const sendFive = async (roomId = 'room-dm') => {
      for (let i = 1; i <= 5; i += 1) {
        await service.sendChatMessagePush({
          messageId: `m${i}`,
          roomId,
          senderId: 'u1',
          senderUsername: 'Ed',
          content: `сообщение ${i}`,
          createdAt: new Date(`2026-03-13T10:00:0${i}.000Z`),
        });
      }
    };

    beforeEach(() => {
      prisma.roomMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
      prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });
      prisma.pushSubscription.findMany.mockResolvedValue([sub('s2a', 'u2'), sub('s2b', 'u2')]);
    });

    it('5 messages in a row = 5 separate pushes per device, each with its own messageId, no throttling', async () => {
      await sendFive();
      const calls = (webPush.sendNotification as jest.Mock).mock.calls;
      expect(calls).toHaveLength(10); // 5 сообщений × 2 устройства
      const ids = calls.map((c) => JSON.parse(c[1]).messageId);
      expect(new Set(ids)).toEqual(new Set(['m1', 'm2', 'm3', 'm4', 'm5']));
    });

    it('uses a 24h TTL and high urgency for real messages', async () => {
      await sendFive();
      for (const call of (webPush.sendNotification as jest.Mock).mock.calls) {
        expect(call[2]).toEqual({ TTL: 24 * 60 * 60, urgency: 'high' });
      }
    });

    it('skips only the people who are looking at the chat right now', async () => {
      prisma.roomMember.findMany.mockResolvedValue([{ userId: 'u2' }, { userId: 'u3' }]);
      prisma.room.findUnique.mockResolvedValue({ title: 'Група' });
      prisma.pushSubscription.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          [sub('s2', 'u2'), sub('s3', 'u3')].filter((x) => where.userId.in.includes(x.userId)),
        ),
      );
      await service.sendChatMessagePush({
        messageId: 'm1',
        roomId: 'room-group',
        senderId: 'u1',
        senderUsername: 'Ed',
        content: 'привіт',
        createdAt: new Date(),
        excludeUserIds: ['u2'],
      });
      const calls = (webPush.sendNotification as jest.Mock).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0].endpoint).toContain('s3');
      const payload = JSON.parse(calls[0][1]);
      expect(payload.title).toBe('Група');
      expect(payload.body).toBe('Ed: привіт');
    });

    it('retries once on a temporary push-service error and then delivers', async () => {
      const err = Object.assign(new Error('unavailable'), { statusCode: 503 });
      (webPush.sendNotification as jest.Mock)
        .mockRejectedValueOnce(err)
        .mockResolvedValue(undefined);
      prisma.pushSubscription.findMany.mockResolvedValue([sub('s2a', 'u2')]);
      await service.sendChatMessagePush({
        messageId: 'm1',
        roomId: 'room-dm',
        senderId: 'u1',
        senderUsername: 'Ed',
        content: 'hi',
        createdAt: new Date(),
      });
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(service.deliveryStats.snapshot().chat).toMatchObject({ sent: 1, failed: 0, retried: 1 });
    });

    it('removes a dead subscription (410) without retrying, and keeps the rest going', async () => {
      const gone = Object.assign(new Error('gone'), { statusCode: 410 });
      (webPush.sendNotification as jest.Mock).mockImplementation((s: any) =>
        s.endpoint.endsWith('s2a') ? Promise.reject(gone) : Promise.resolve(undefined),
      );
      await service.sendChatMessagePush({
        messageId: 'm1',
        roomId: 'room-dm',
        senderId: 'u1',
        senderUsername: 'Ed',
        content: 'hi',
        createdAt: new Date(),
      });
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's2a' } });
      expect(service.deliveryStats.snapshot().chat).toMatchObject({ sent: 1, failed: 1, removed: 1, errors: { '410': 1 } });
    });

    it('formats media pushes: voice, photo, file, sticker', async () => {
      const texts: Record<string, string> = {};
      for (const [key, type, content] of [
        ['voice', 'VOICE', '[[voice:abc]]'],
        ['image', 'IMAGE', 'https://x/y.png'],
        ['file', 'FILE', 'report.docx'],
        ['sticker', 'TEXT', '[[sticker:cat]]/stickers/cat.png'],
      ] as const) {
        (webPush.sendNotification as jest.Mock).mockClear();
        await service.sendChatMessagePush({
          messageId: `m-${key}`,
          roomId: 'room-dm',
          senderId: 'u1',
          senderUsername: 'Ed',
          content,
          messageType: type as never,
          createdAt: new Date(),
        });
        texts[key] = JSON.parse((webPush.sendNotification as jest.Mock).mock.calls[0][1]).body;
      }
      expect(texts).toEqual({
        voice: '🎤 Голосове',
        image: '🖼 Фото',
        file: '📎 Файл',
        sticker: 'Стікер',
      });
    });

    it('reply to my message gets the "відповів(ла) вам" text', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([sub('s2a', 'u2')]);
      await service.sendChatMessagePush({
        messageId: 'm1',
        roomId: 'room-dm',
        senderId: 'u1',
        senderUsername: 'Ed',
        content: 'згоден',
        createdAt: new Date(),
        repliedToUserId: 'u2',
      });
      expect(JSON.parse((webPush.sendNotification as jest.Mock).mock.calls[0][1]).body).toBe(
        'Ed відповів(ла) вам: згоден',
      );
    });
  });

  describe('cinema pushes', () => {
    it('every cinema message is its own push with the room title and "<name>: text"; muted members get none', async () => {
      prisma.watchRoomMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 's2', userId: 'u2', endpoint: 'https://example.com/s2', p256dh: 'k', auth: 'a' },
      ]);
      for (let i = 1; i <= 5; i += 1) {
        await service.sendWatchMessagePush({
          messageId: `w${i}`,
          roomId: 'r1',
          roomTitle: 'Вечір',
          senderId: 'u1',
          senderName: 'Ed',
          content: `репліка ${i}`,
          createdAt: new Date(),
        });
      }
      const calls = (webPush.sendNotification as jest.Mock).mock.calls;
      expect(calls).toHaveLength(5);
      const first = JSON.parse(calls[0][1]);
      expect(first.title).toBe('🎬 Вечір');
      expect(first.body).toBe('Ed: репліка 1');
      expect(new Set(calls.map((c) => JSON.parse(c[1]).messageId)).size).toBe(5);
      // мьют учитывается запросом: только notificationsMuted: false
      expect(prisma.watchRoomMember.findMany.mock.calls[0][0].where).toMatchObject({
        notificationsMuted: false,
        status: 'JOINED',
      });
    });

    it('a room invite is a unique push of its own with the badge', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 's2', userId: 'u2', endpoint: 'https://example.com/s2', p256dh: 'k', auth: 'a' },
      ]);
      await service.sendWatchInvitePush({ targetUserIds: ['u2'], inviterName: 'Ed', roomTitle: 'Вечір', roomId: 'r1' });
      const payload = JSON.parse((webPush.sendNotification as jest.Mock).mock.calls[0][1]);
      expect(payload.messageId).toMatch(/^invite-r1-/);
      expect(payload.badgeCount).toBe(2);
    });
  });

  describe('status and test push', () => {
    it('reports whether THIS device is registered and lists devices', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'a', endpoint: 'https://e/a', userAgent: 'iPhone', lastUsedAt: null },
        { id: 'b', endpoint: 'https://e/b', userAgent: 'Mac', lastUsedAt: new Date('2026-01-01') },
      ]);
      const status = await service.getStatus('u2', 'https://e/b');
      expect(status).toMatchObject({ hasSubscription: true, subscriptionsCount: 2, thisDeviceRegistered: true });
      expect(status.devices.map((d) => d.current)).toEqual([false, true]);
      expect((await service.getStatus('u2', 'https://e/zzz')).thisDeviceRegistered).toBe(false);
    });

    it('sends a test push and reports the per-device result', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'a', userId: 'u2', endpoint: 'https://e/a', p256dh: 'k', auth: 'a' },
      ]);
      const res = await service.sendTestPush('u2', 'https://e/a');
      expect(res).toMatchObject({ ok: true, code: 'SENT', results: [{ ok: true, status: null, removed: false }] });
      prisma.pushSubscription.findMany.mockResolvedValue([]);
      expect(await service.sendTestPush('u2')).toMatchObject({ ok: false, code: 'NO_SUBSCRIPTION' });
    });
  });
});
