import { canUserPostToRoom, resolveRoomAccess } from './user-may-post-to-room';
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

describe('resolveRoomAccess', () => {
  it('returns the room title so callers need no second lookup', async () => {
    const prisma = makePrisma({ members: ['a', 'b'], title: 'dm:a:b' });
    await expect(resolveRoomAccess(prisma, 'a', 'room-1')).resolves.toEqual({
      title: 'dm:a:b',
    });
    await expect(resolveRoomAccess(prisma, 'c', 'room-1')).resolves.toBeNull();
  });
});

describe('canUserReadRoom', () => {
  const room = 'room-1';
  const { canUserReadRoom } = jest.requireActual('./user-may-post-to-room');

  it('lets a dm participant read even without a RoomMember row', async () => {
    const prisma = makePrisma({ members: ['b'], title: 'dm:a:b' });
    await expect(canUserReadRoom(prisma, 'a', room)).resolves.toBe(true);
  });

  it('never lets a stranger read a dm, member row or not', async () => {
    await expect(
      canUserReadRoom(
        makePrisma({ members: ['a', 'b', 'c'], title: 'dm:a:b' }),
        'c',
        room,
      ),
    ).resolves.toBe(false);
    await expect(
      canUserReadRoom(
        makePrisma({ members: ['a', 'b'], title: 'dm:a:b' }),
        'c',
        room,
      ),
    ).resolves.toBe(false);
  });

  it('keeps the membership requirement for group rooms', async () => {
    const prisma = makePrisma({ members: ['b'], title: 'Study group' });
    await expect(canUserReadRoom(prisma, 'a', room)).resolves.toBe(false);
    await expect(canUserReadRoom(prisma, 'b', room)).resolves.toBe(true);
  });
});
