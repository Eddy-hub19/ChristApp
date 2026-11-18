import type { PrismaService } from 'src/prisma/prisma.service';
import type { PushService } from 'src/push/push.service';
import { WatchPartyService } from './watch-party.service';

const ROOM = '11111111-1111-4111-8111-111111111111';

function setup(type: 'TEXT' | 'SYSTEM') {
  const prisma = {
    watchMessage: {
      findUnique: jest.fn(async () => ({ roomId: ROOM, userId: 'u', type })),
      findFirst: jest.fn(async () => (type === 'TEXT' ? { id: 'm', userId: 'u' } : null)),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(async () => ({
        id: 'new',
        content: 'hi',
        replyToId: null,
        editedAt: null,
        createdAt: new Date(),
        user: { id: 'u' },
        room: { title: 'T' },
      })),
      findMany: jest.fn(async () => []),
    },
    watchMessageReaction: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(),
      findMany: jest.fn(async () => []),
    },
  };
  const push = { sendWatchMessagePush: jest.fn(async () => undefined) };
  const service = new WatchPartyService(
    prisma as unknown as PrismaService,
    push as unknown as PushService,
  );
  return { service, prisma };
}

describe('SYSTEM watch messages are read-only', () => {
  it('cannot be edited, even by their own author', async () => {
    const { service, prisma } = setup('SYSTEM');
    expect(await service.editMessage(ROOM, 'u', 'm', 'x')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(prisma.watchMessage.update).not.toHaveBeenCalled();
  });

  it('cannot be deleted by users', async () => {
    const { service, prisma } = setup('SYSTEM');
    expect(await service.deleteMessage(ROOM, 'u', 'm')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(prisma.watchMessage.delete).not.toHaveBeenCalled();
  });

  it('cannot get reactions', async () => {
    const { service, prisma } = setup('SYSTEM');
    expect(await service.toggleMessageReaction(ROOM, 'u', 'm', '❤️')).toMatchObject({ ok: false });
    expect(prisma.watchMessageReaction.create).not.toHaveBeenCalled();
  });

  it('cannot be replied to (the reply becomes a plain message)', async () => {
    const { service, prisma } = setup('SYSTEM');
    await service.postMessage(ROOM, 'u', 'hello', 'm');
    expect(prisma.watchMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'TEXT' }) }),
    );
    expect(prisma.watchMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ replyToId: null }) }),
    );
  });

  it('regular text messages still work', async () => {
    const { service, prisma } = setup('TEXT');
    expect(await service.deleteMessage(ROOM, 'u', 'm')).toEqual({ ok: true });
    expect(prisma.watchMessage.delete).toHaveBeenCalled();
  });
});
