import { ForbiddenException } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import type { ChatGateway } from 'src/chat/chat.gateway';

const ROOM_ID = '35b7b9c6-2158-4c4f-90e7-9019d27c77a6';

/** Фейковий Prisma: кімната dm:alice:bob, у якій задані userId — рядки RoomMember. */
function makeController(members: string[]) {
  const prisma = {
    roomMember: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          members.includes(where.roomId_userId.userId)
            ? { userId: where.roomId_userId.userId }
            : null,
        ),
      ),
    },
    room: {
      findUnique: jest.fn(() => Promise.resolve({ title: 'dm:alice:bob' })),
    },
    message: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
  } as unknown as PrismaService;

  const service = new MessagesService(prisma);
  return new MessagesController(
    service,
    {} as CloudinaryService,
    {} as ChatGateway,
  );
}

const asUser = (id: string) => ({ user: { id } });

describe('GET /messages/room (private chat access)', () => {
  it('returns history (200) to both participants', async () => {
    const controller = makeController(['alice', 'bob']);
    await expect(
      controller.getRoomMessages(asUser('alice'), ROOM_ID, '250', '0'),
    ).resolves.toEqual([]);
    await expect(
      controller.getRoomMessages(asUser('bob'), ROOM_ID, '250', '0'),
    ).resolves.toEqual([]);
  });

  it('still returns history to a participant whose RoomMember row was removed', async () => {
    const controller = makeController(['bob']);
    await expect(
      controller.getRoomMessages(asUser('alice'), ROOM_ID, '250', '0'),
    ).resolves.toEqual([]);
  });

  it('answers 403 to an outsider, with or without a member row', async () => {
    await expect(
      makeController(['alice', 'bob', 'mallory']).getRoomMessages(
        asUser('mallory'),
        ROOM_ID,
        '250',
        '0',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      makeController(['alice', 'bob']).getRoomMessages(
        asUser('mallory'),
        ROOM_ID,
        '250',
        '0',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
