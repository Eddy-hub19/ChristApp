import { canUserPostToRoom } from './user-may-post-to-room';
import type { PrismaService } from 'src/prisma/prisma.service';

function makePrisma(opts: { members: string[]; title: string }) {
  return {
    roomMember: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          opts.members.includes(where.roomId_userId.userId)
            ? { userId: where.roomId_userId.userId }
            : null,
        ),
      ),
    },
    room: {
      findUnique: jest.fn(() => Promise.resolve({ title: opts.title })),
    },
  } as unknown as PrismaService;
}

describe('canUserPostToRoom (shared by REST messages/room and socket joinRoom)', () => {
  const room = 'room-1';

  it('allows both participants of a private chat', async () => {
    const prisma = makePrisma({ members: ['a', 'b'], title: 'dm:a:b' });
    await expect(canUserPostToRoom(prisma, 'a', room)).resolves.toBe(true);
    await expect(canUserPostToRoom(prisma, 'b', room)).resolves.toBe(true);
  });

  it('denies a non-member even if the dm title names them', async () => {
    const prisma = makePrisma({ members: ['b'], title: 'dm:a:b' });
    await expect(canUserPostToRoom(prisma, 'a', room)).resolves.toBe(false);
  });

  it('denies a member who is not named in the dm title', async () => {
    const prisma = makePrisma({ members: ['a', 'b', 'c'], title: 'dm:a:b' });
    await expect(canUserPostToRoom(prisma, 'c', room)).resolves.toBe(false);
  });
});
