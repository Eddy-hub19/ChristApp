import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: {
    message: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      message: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('attachReplies', () => {
    it('does not query when nothing replies to anything', async () => {
      const rows = [{ id: 'a', replyToId: null }];
      await expect(service.attachReplies(rows)).resolves.toEqual([
        { id: 'a', replyToId: null, replyTo: null },
      ]);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('snapshots the original and marks deleted originals', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'orig',
          type: 'TEXT',
          content: 'Привіт',
          fileUrl: null,
          senderId: 'u1',
          sender: { username: 'alice', nickname: 'Alice' },
        },
      ]);
      const result = await service.attachReplies([
        { id: 'r1', replyToId: 'orig' },
        { id: 'r2', replyToId: 'gone' },
      ]);
      expect(result[0].replyTo).toEqual({
        id: 'orig',
        deleted: false,
        username: 'Alice',
        senderId: 'u1',
        type: 'TEXT',
        content: 'Привіт',
        fileUrl: null,
      });
      expect(result[1].replyTo).toEqual({ id: 'gone', deleted: true });
    });
  });

  describe('legacy [[reply:…]] prefix', () => {
    const legacyRaw = `[[reply:${encodeURIComponent(
      JSON.stringify({ id: 'old', username: 'bob', content: 'x'.repeat(400) }),
    )}]]Старий текст відповіді`;

    it('quotes the clean text of an original that was itself a legacy reply', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'orig',
          type: 'TEXT',
          content: legacyRaw,
          fileUrl: null,
          senderId: 'u1',
          sender: { username: 'alice', nickname: null },
        },
      ]);
      const [row] = await service.attachReplies([
        { id: 'r', replyToId: 'orig' },
      ]);
      expect(row.replyTo).toMatchObject({
        deleted: false,
        content: 'Старий текст відповіді',
      });
    });

    it('keeps the legacy quote when editing, but the edited text stays clean', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        roomId: '00000000-0000-0000-0000-000000000001',
        senderId: 'u1',
        type: 'TEXT',
        content: legacyRaw,
      });
      prisma.message.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'm1', roomId: 'r', content: data.content }),
      );
      const result = await service.editOwnMessage('m1', 'u1', 'Виправлено');
      const stored = prisma.message.update.mock.calls[0][0].data.content;
      expect(stored.startsWith('[[reply:')).toBe(true);
      expect(stored.endsWith(']]Виправлено')).toBe(true);
      expect(result).toMatchObject({ ok: true, content: 'Виправлено' });
    });
  });

  describe('resolveReplyTarget', () => {
    it('accepts only messages from the same room', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        roomId: 'room-1',
        senderId: 'u2',
      });
      await expect(service.resolveReplyTarget('room-1', 'm1')).resolves.toEqual(
        {
          id: 'm1',
          senderId: 'u2',
        },
      );
      await expect(
        service.resolveReplyTarget('room-2', 'm1'),
      ).resolves.toBeNull();
      await expect(
        service.resolveReplyTarget('room-1', ''),
      ).resolves.toBeNull();
      await expect(
        service.resolveReplyTarget('room-1', undefined),
      ).resolves.toBeNull();
    });
  });

  describe('createRoomMessage', () => {
    const row = {
      id: 'm1',
      type: 'TEXT',
      content: 'Привіт',
      senderId: 'u1',
      roomId: 'room-1',
      replyToId: null,
    };

    it('з відомим автором робить один insert без include (без зайвих запитів до emit)', async () => {
      prisma.message.create.mockResolvedValue(row);
      const sender = { username: 'sender', nickname: 'Sender' };

      const result = await service.createRoomMessage({
        type: 'TEXT',
        content: 'Привіт',
        senderId: 'u1',
        roomId: 'room-1',
        sender,
      });

      expect(prisma.message.create).toHaveBeenCalledTimes(1);
      expect(prisma.message.create.mock.calls[0][0]).not.toHaveProperty(
        'include',
      );
      expect(result.sender).toEqual(sender);
      expect(result.id).toBe('m1');
    });

    it('без автора (REST-завантаження) підтягує sender через include, як раніше', async () => {
      const sender = { username: 'sender', nickname: 'Sender' };
      prisma.message.create.mockResolvedValue({ ...row, sender });

      const result = await service.createRoomMessage({
        type: 'TEXT',
        content: 'Привіт',
        senderId: 'u1',
        roomId: 'room-1',
      });

      expect(prisma.message.create.mock.calls[0][0]).toMatchObject({
        include: { sender: true },
      });
      expect(result.sender).toEqual(sender);
    });
  });
});
