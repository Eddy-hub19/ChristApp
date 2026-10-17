import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    message: { groupBy: jest.Mock };
    refreshSession: { groupBy: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      message: { groupBy: jest.fn() },
      refreshSession: { groupBy: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllUsers lastSeenAt', () => {
    const d = (iso: string) => new Date(iso);

    it('restores a missing lastSeenAt from the latest message or login, keeps the freshest value', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'a', lastSeenAt: null },
        { id: 'b', lastSeenAt: d('2026-01-05T00:00:00Z') },
        { id: 'c', lastSeenAt: d('2026-01-01T00:00:00Z') },
        { id: 'd', lastSeenAt: null },
      ]);
      prisma.message.groupBy.mockResolvedValue([
        { senderId: 'a', _max: { createdAt: d('2026-01-02T00:00:00Z') } },
        { senderId: 'c', _max: { createdAt: d('2026-01-03T00:00:00Z') } },
      ]);
      prisma.refreshSession.groupBy.mockResolvedValue([
        { userId: 'a', _max: { createdAt: d('2026-01-04T00:00:00Z') } },
        { userId: 'b', _max: { createdAt: d('2026-01-02T00:00:00Z') } },
      ]);

      const result = await service.getAllUsers();
      const byId = Object.fromEntries(result.map((u) => [u.id, u.lastSeenAt]));

      expect(byId.a).toEqual(d('2026-01-04T00:00:00Z'));
      expect(byId.b).toEqual(d('2026-01-05T00:00:00Z'));
      expect(byId.c).toEqual(d('2026-01-03T00:00:00Z'));
      expect(byId.d).toBeNull();
    });
  });

  describe('updateProfile @username', () => {
    it('throws ConflictException when normalized username belongs to another user', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-user' });

      await expect(
        service.updateProfile('me', { username: 'Busy_Handle' }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates profile when username is not taken by others', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({
        id: 'me',
        username: 'free_handle',
        email: 'a@b.c',
        nickname: 'n',
        createdAt: new Date(),
        isActive: true,
        avatarUrl: null,
        themeForegroundHex: null,
        themeBackgroundHex: null,
        themeFontKey: null,
      });

      await service.updateProfile('me', { username: 'Free_Handle' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'me' },
          data: expect.objectContaining({ username: 'free_handle' }),
        }),
      );
    });

    it('throws ConflictException on P2002 from DB (гонка двух запросов)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const dup = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '0',
          meta: { modelName: 'User', target: ['username'] },
        },
      );
      prisma.user.update.mockRejectedValue(dup);

      await expect(
        service.updateProfile('me', { username: 'same_time' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
