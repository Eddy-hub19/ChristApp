import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: { message: { findMany: jest.Mock; findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { message: { findMany: jest.fn(), findUnique: jest.fn() } };
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
});
