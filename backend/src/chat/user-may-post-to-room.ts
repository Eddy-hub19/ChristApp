import type { PrismaService } from 'src/prisma/prisma.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { userMayAccessRoomByTitle } from 'src/chat/room-access.util';

/** Користувач може надсилати повідомлення в кімнату (загальний чат або учасник з доступом за title). */
export async function canUserPostToRoom(
  prisma: PrismaService,
  userId: string,
  roomId: string,
): Promise<boolean> {
  const globalRoom = resolveGlobalRoomId();
  if (roomId === globalRoom) {
    return true;
  }

  // Членство й title кімнати незалежні — читаємо паралельно: один RTT до БД замість двох до `emit`.
  const [membership, room] = await Promise.all([
    prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
      select: { userId: true },
    }),
    prisma.room.findUnique({
      where: { id: roomId },
      select: { title: true },
    }),
  ]);

  if (!membership || !room) {
    return false;
  }

  return userMayAccessRoomByTitle(userId, room.title);
}

/**
 * Доступ на ЧИТАННЯ історії. Окрім звичайного членства, учасник приватного чату (dm:) завжди має
 * право прочитати свій чат: title кімнати однозначно називає двох учасників. Без цього користувач, якого
 * видалили з RoomMember (напр. «видалив чат зі списку»), отримував 403 на GET /messages/room і порожній чат
 * за прямим посиланням. Лише читання — нічого не записуємо, тож видалення зі списку не скасовується.
 */
export async function canUserReadRoom(
  prisma: PrismaService,
  userId: string,
  roomId: string,
): Promise<boolean> {
  if (await canUserPostToRoom(prisma, userId, roomId)) {
    return true;
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { title: true },
  });
  if (!room?.title.startsWith('dm:')) {
    return false;
  }
  return userMayAccessRoomByTitle(userId, room.title);
}
