import { Injectable, Logger } from '@nestjs/common';
import { MessageType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { userMayAccessRoomByTitle } from 'src/chat/room-access.util';
import { canUserPostToRoom } from 'src/chat/user-may-post-to-room';
import { VOICE_META_PREFIX, VOICE_META_SUFFIX } from './voice-message';
import { mediaPreviewLabel } from './media-preview';
import {
  LEGACY_REPLY_PREFIX,
  LEGACY_REPLY_SUFFIX,
  parseLegacyReplyPrefix,
  stripLegacyReplyPrefix,
} from 'src/common/legacy-reply-prefix';

type UnreadRoomSummaryRow = {
  roomId: string;
  unreadCount: number;
  messageId: string | null;
  messageContent: string | null;
  messageType: MessageType | string | null;
  messageCreatedAt: Date | string | null;
  messageSenderId: string | null;
  messageSenderUsername: string | null;
};

type RoomLastMessageSummary = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  senderUsername: string;
  /** Тип повідомлення — клієнт підписує медіа на мові інтерфейсу. */
  type: string;
};

type RoomUnreadSummary = {
  roomId: string;
  unread: number;
  lastMessage: RoomLastMessageSummary | null;
};

export type UnreadSummaryResult = {
  totalUnread: number;
  rooms: RoomUnreadSummary[];
};

export type DeleteOwnMessageResult =
  | { ok: true; messageId: string; roomId: string }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'no-access' };

type DeleteMessageOptions = {
  allowDeleteOthers?: boolean;
};

export type EditOwnMessageResult =
  | {
      ok: true;
      messageId: string;
      roomId: string;
      content: string;
    }
  | {
      ok: false;
      reason: 'not-found' | 'not-owner' | 'no-access' | 'invalid-content';
    };

/** Знімок оригіналу для цитати у відповіді; `deleted` — оригінал уже видалено. */
export type MessageReplyPreview =
  | { id: string; deleted: true }
  | {
      id: string;
      deleted: false;
      username: string;
      senderId: string;
      type: MessageType;
      content: string;
      fileUrl: string | null;
    };

const REPLY_PREVIEW_CONTENT_MAX = 300;

/** @deprecated використовуйте DeleteOwnMessageResult */
export type DeleteOwnGlobalMessageResult = DeleteOwnMessageResult;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly GLOBAL_ROOM = resolveGlobalRoomId();

  constructor(private prisma: PrismaService) {}

  userCanPostToRoom(userId: string, roomId: string) {
    return canUserPostToRoom(this.prisma, userId, roomId);
  }

  async createMessage(content: string, userId: string) {
    return this.prisma.message.create({
      data: {
        type: MessageType.TEXT,
        content,
        fileUrl: null,
        senderId: userId,
        roomId: this.GLOBAL_ROOM,
      },
      include: {
        sender: true,
      },
    });
  }

  async createRoomMessage(
    params: { replyToId?: string | null } & (
      | {
          roomId: string;
          senderId: string;
          type: 'TEXT';
          content: string;
        }
      | {
          roomId: string;
          senderId: string;
          type: 'VOICE';
          content: string;
          voiceDuration?: number;
        }
      | {
          roomId: string;
          senderId: string;
          type: 'IMAGE';
          fileUrl: string;
          content?: string;
          mediaWidth?: number;
          mediaHeight?: number;
        }
      | {
          roomId: string;
          senderId: string;
          type: 'FILE';
          fileUrl: string;
          content?: string;
          fileSize?: number;
        }
      | {
          roomId: string;
          senderId: string;
          type: 'VIDEO_NOTE';
          fileUrl: string;
        }
    ),
  ) {
    const { roomId, senderId, type } = params;
    const content =
      type === 'VIDEO_NOTE' ? null : (params.content?.trim() || null);
    const fileUrl =
      type === 'IMAGE' || type === 'FILE' || type === 'VIDEO_NOTE'
        ? params.fileUrl
        : null;
    const voiceDuration = type === 'VOICE' ? params.voiceDuration : null;
    const created = await this.prisma.message.create({
      data: {
        type: type as MessageType,
        content,
        fileUrl,
        voiceDuration: voiceDuration || null,
        mediaWidth: type === 'IMAGE' ? (params.mediaWidth ?? null) : null,
        mediaHeight: type === 'IMAGE' ? (params.mediaHeight ?? null) : null,
        fileSize: type === 'FILE' ? (params.fileSize ?? null) : null,
        replyToId: params.replyToId ?? null,
        senderId,
        roomId,
      },
      include: {
        sender: true,
      },
    });
    const [withReply] = await this.attachReplies([created]);
    return withReply;
  }

  /**
   * Перевіряє, що `replyToId` — існуюче повідомлення тієї ж кімнати; повертає його
   * автора (для пуша "відповів вам") або null, якщо відповідь некоректна.
   */
  async resolveReplyTarget(
    roomId: string,
    replyToId: string | null | undefined,
  ): Promise<{ id: string; senderId: string } | null> {
    const id = typeof replyToId === 'string' ? replyToId.trim() : '';
    if (!id) return null;
    const target = await this.prisma.message.findUnique({
      where: { id },
      select: { id: true, roomId: true, senderId: true },
    });
    if (!target || target.roomId !== roomId) return null;
    return { id: target.id, senderId: target.senderId };
  }

  /** Додає `replyTo` (знімок оригіналу або позначку "видалено") до повідомлень із `replyToId`. */
  async attachReplies<T extends { replyToId: string | null }>(
    rows: T[],
  ): Promise<Array<T & { replyTo: MessageReplyPreview | null }>> {
    const ids = [
      ...new Set(rows.map((row) => row.replyToId).filter(Boolean)),
    ] as string[];
    const originals = ids.length
      ? await this.prisma.message.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            type: true,
            content: true,
            fileUrl: true,
            senderId: true,
            sender: { select: { username: true, nickname: true } },
          },
        })
      : [];
    const byId = new Map(originals.map((row) => [row.id, row]));
    return rows.map((row) => {
      if (!row.replyToId) return { ...row, replyTo: null };
      const original = byId.get(row.replyToId);
      const replyTo: MessageReplyPreview = original
        ? {
            id: original.id,
            deleted: false,
            username: original.sender.nickname || original.sender.username,
            senderId: original.senderId,
            type: original.type,
            // Спочатку чистимо старий префікс [[reply:…]], і лише потім обрізаємо: префікс довший
            // за ліміт, тож зворотний порядок лишав у цитаті обрізок службового тексту.
            content: stripLegacyReplyPrefix(original.content).slice(
              0,
              REPLY_PREVIEW_CONTENT_MAX,
            ),
            fileUrl: original.fileUrl,
          }
        : { id: row.replyToId, deleted: true };
      return { ...row, replyTo };
    });
  }

  /**
   * Позначає голосове як прослухане `userId` (власні повідомлення не рахуються).
   * Повертає `null`, якщо повідомлення не голосове, чуже недоступне або це власне голосове.
   */
  async markVoiceListened(
    messageId: string,
    userId: string,
  ): Promise<{ roomId: string; senderId: string } | null> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, roomId: true, senderId: true, type: true },
    });
    if (!message || message.type !== 'VOICE' || message.senderId === userId) {
      return null;
    }
    if (!(await this.userCanPostToRoom(userId, message.roomId))) {
      return null;
    }
    await this.prisma.voiceMessageListen.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    });
    return { roomId: message.roomId, senderId: message.senderId };
  }

  /**
   * Старіша частина історії: повідомлення суворо раніше `beforeId`. З `untilId` читає
   * стільки, скільки треба, щоб дійти до цього повідомлення (але не більше `limit`).
   */
  async getRoomMessagesBefore(
    roomId: string,
    beforeId: string,
    options: { limit?: number; untilId?: string } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const [before, until] = await Promise.all([
      this.prisma.message.findFirst({
        where: { id: beforeId, roomId },
        select: { createdAt: true },
      }),
      options.untilId
        ? this.prisma.message.findFirst({
            where: { id: options.untilId, roomId },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ]);
    if (!before) return { messages: [], hasMore: false };

    const rows = await this.prisma.message.findMany({
      where: {
        roomId,
        createdAt: {
          lt: before.createdAt,
          ...(until ? { gte: until.createdAt } : {}),
        },
      },
      include: {
        sender: true,
        reactions: { orderBy: { createdAt: 'asc' } },
        voiceListens: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return { messages: await this.attachReplies(page), hasMore };
  }

  /**
   * Останні `limit` повідомлень кімнати (хронологічно: старі → нові).
   * Раніше використовувався order asc + take — поверталися найстаріші N повідомлень,
   * через що при великій історії нові зникали після перезавантаження.
   */
  async getRoomMessages(roomId: string, limit = 50, skip = 0) {
    const rows = await this.prisma.message.findMany({
      where: { roomId },
      include: {
        sender: true,
        reactions: {
          orderBy: { createdAt: 'asc' },
        },
        voiceListens: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });
    return this.attachReplies(rows.reverse());
  }

  async getAll(limit = 50, skip = 0) {
    return this.prisma.message.findMany({
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip,
    });
  }

  /** Повідомлення лише загальної кімнати (без приватних та інших кімнат). */
  async getGlobalRoomMessages(limit = 50, skip = 0) {
    return this.getRoomMessages(this.GLOBAL_ROOM, limit, skip);
  }

  /**
   * Видалення свого повідомлення: загальний чат або будь-яка кімната, де користувач — учасник (приватні чати тощо).
   */
  async deleteMessageForUser(
    messageId: string,
    userId: string,
    options: DeleteMessageOptions = {},
  ): Promise<DeleteOwnMessageResult> {
    const canDeleteOthers = options.allowDeleteOthers === true;
    const existingMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        roomId: true,
        senderId: true,
      },
    });

    if (!existingMessage) {
      return { ok: false, reason: 'not-found' };
    }

    const isOwner = existingMessage.senderId === userId;

    if (!isOwner && !canDeleteOthers) {
      return { ok: false, reason: 'not-owner' };
    }

    const messageRoomId = existingMessage.roomId;

    if (isOwner && messageRoomId !== this.GLOBAL_ROOM) {
      const member = await this.prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId: messageRoomId,
            userId,
          },
        },
      });
      if (!member) {
        return { ok: false, reason: 'no-access' };
      }

      const room = await this.prisma.room.findUnique({
        where: { id: messageRoomId },
        select: { title: true },
      });
      if (!room || !userMayAccessRoomByTitle(userId, room.title)) {
        return { ok: false, reason: 'no-access' };
      }
    }

    await this.prisma.message.delete({
      where: {
        id: existingMessage.id,
      },
    });

    return {
      ok: true,
      messageId: existingMessage.id,
      roomId: existingMessage.roomId,
    };
  }

  async deleteOwnMessage(
    messageId: string,
    userId: string,
  ): Promise<DeleteOwnMessageResult> {
    return this.deleteMessageForUser(messageId, userId, {
      allowDeleteOthers: false,
    });
  }

  /** @deprecated використовуйте deleteOwnMessage */
  async deleteOwnGlobalMessage(
    messageId: string,
    userId: string,
  ): Promise<DeleteOwnMessageResult> {
    return this.deleteOwnMessage(messageId, userId);
  }

  async editOwnMessage(
    messageId: string,
    userId: string,
    nextContent: string,
  ): Promise<EditOwnMessageResult> {
    // Клієнт не має надсилати службовий префікс, але якщо надіслав — не зберігаємо його двічі.
    const normalizedContent = stripLegacyReplyPrefix(nextContent).trim();
    if (!normalizedContent) {
      return { ok: false, reason: 'invalid-content' };
    }

    const existingMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        roomId: true,
        senderId: true,
        type: true,
        content: true,
      },
    });

    if (!existingMessage) {
      return { ok: false, reason: 'not-found' };
    }

    if (existingMessage.senderId !== userId) {
      return { ok: false, reason: 'not-owner' };
    }

    if (existingMessage.type !== MessageType.TEXT) {
      return { ok: false, reason: 'invalid-content' };
    }

    const messageRoomId = existingMessage.roomId;

    if (messageRoomId !== this.GLOBAL_ROOM) {
      const member = await this.prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId: messageRoomId,
            userId,
          },
        },
      });
      if (!member) {
        return { ok: false, reason: 'no-access' };
      }

      const room = await this.prisma.room.findUnique({
        where: { id: messageRoomId },
        select: { title: true },
      });
      if (!room || !userMayAccessRoomByTitle(userId, room.title)) {
        return { ok: false, reason: 'no-access' };
      }
    }

    // Старе повідомлення-відповідь тримає цитату префіксом у тексті: при редагуванні лишаємо її,
    // інакше після правки цитата зникла б. Користувач бачить і редагує лише чистий текст.
    const existingRaw = existingMessage.content ?? '';
    const prefixEnd = existingRaw.startsWith(LEGACY_REPLY_PREFIX)
      ? existingRaw.indexOf(LEGACY_REPLY_SUFFIX, LEGACY_REPLY_PREFIX.length)
      : -1;
    const keptPrefix =
      prefixEnd === -1 || !parseLegacyReplyPrefix(existingRaw).meta
        ? ''
        : existingRaw.slice(0, prefixEnd + LEGACY_REPLY_SUFFIX.length);

    const updated = await this.prisma.message.update({
      where: { id: existingMessage.id },
      data: {
        content: `${keptPrefix}${normalizedContent}`,
      },
      select: {
        id: true,
        roomId: true,
        content: true,
      },
    });

    return {
      ok: true,
      messageId: updated.id,
      roomId: updated.roomId,
      content: normalizedContent,
    };
  }

  async markRoomAsRead(
    roomId: string,
    userId: string,
    lastReadAt = new Date(),
  ) {
    await this.prisma.roomReadState.upsert({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
      update: {
        lastReadAt,
      },
      create: {
        roomId,
        userId,
        lastReadAt,
      },
    });
  }

  /**
   * Непрочитані по кожному з користувачів — пакетно.
   * Потрібно для бейджа в пуші: per-user виклик `getUnreadSummary` давав N важких запитів
   * на кожне повідомлення, тож у великих кімнатах бейдж просто не рахувався.
   */
  async getUnreadTotalsForUsers(
    userIds: string[],
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!uniqueUserIds.length) {
      return totals;
    }

    for (const userId of uniqueUserIds) {
      totals.set(userId, 0);
    }

    const memberRows = await this.prisma.roomMember.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { userId: true, roomId: true },
    });

    const candidateRoomIds = Array.from(
      new Set<string>([
        this.GLOBAL_ROOM,
        ...memberRows.map((row) => row.roomId),
      ]),
    );

    const rooms = await this.prisma.room.findMany({
      where: { id: { in: candidateRoomIds } },
      select: { id: true, title: true },
    });
    const titleByRoomId = new Map(rooms.map((room) => [room.id, room.title]));
    const globalRoomExists = titleByRoomId.has(this.GLOBAL_ROOM);

    // Пари (користувач, кімната) з тим самим фільтром доступу, що й у решті чату.
    const pairs: Array<{ userId: string; roomId: string }> = [];
    for (const userId of uniqueUserIds) {
      const roomIds = new Set<string>(
        memberRows
          .filter((row) => row.userId === userId)
          .map((row) => row.roomId),
      );
      if (globalRoomExists) {
        roomIds.add(this.GLOBAL_ROOM);
      }
      for (const roomId of roomIds) {
        const title = titleByRoomId.get(roomId);
        if (title === undefined) {
          continue;
        }
        if (!userMayAccessRoomByTitle(userId, title)) {
          continue;
        }
        pairs.push({ userId, roomId });
      }
    }

    if (!pairs.length) {
      return totals;
    }

    const pairValues = Prisma.join(
      pairs.map((pair) => Prisma.sql`(${pair.userId}, ${pair.roomId}::uuid)`),
    );

    const rows = await this.prisma.$queryRaw<
      Array<{ userId: string; unreadCount: number }>
    >`
      WITH scope("userId", "roomId") AS (
        VALUES ${pairValues}
      )
      SELECT
        s."userId" AS "userId",
        COUNT(m.id)::int AS "unreadCount"
      FROM scope s
      LEFT JOIN "RoomReadState" rrs
        ON rrs."roomId" = s."roomId"
       AND rrs."userId" = s."userId"
      LEFT JOIN "Message" m
        ON m."roomId" = s."roomId"
       AND m."senderId" <> s."userId"
       AND m."createdAt" > COALESCE(rrs."lastReadAt", to_timestamp(0))
      GROUP BY s."userId"
    `;

    for (const row of rows) {
      totals.set(String(row.userId), Number(row.unreadCount) || 0);
    }

    return totals;
  }

  async getUnreadSummary(userId: string): Promise<UnreadSummaryResult> {
    // Один запит одразу по всіх доступних кімнатах:
    // unread + останнє повідомлення по кожній кімнаті.
    try {
      return await this.fetchUnreadSummaryRows(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `getUnreadSummary failed for userId=${userId}: ${message}`,
        err,
      );
      throw err;
    }
  }

  private async fetchUnreadSummaryRows(
    userId: string,
  ): Promise<UnreadSummaryResult> {
    const memberRows = await this.prisma.roomMember.findMany({
      where: { userId },
      select: { roomId: true },
    });

    const roomIds = Array.from(
      new Set<string>([
        this.GLOBAL_ROOM,
        ...memberRows.map((row) => row.roomId),
      ]),
    );

    const roomsMeta = await this.prisma.room.findMany({
      where: { id: { in: roomIds } },
      select: { id: true, title: true },
    });

    const roomIdsForAccess = roomIds.filter((rid) => {
      if (rid === this.GLOBAL_ROOM) {
        return true;
      }
      const room = roomsMeta.find((r) => r.id === rid);
      if (!room) {
        return false;
      }
      return userMayAccessRoomByTitle(userId, room.title);
    });

    const rows = await this.prisma.$queryRaw<UnreadRoomSummaryRow[]>`
      WITH accessible_rooms AS (
        SELECT r.id AS "roomId"
        FROM "Room" r
        WHERE r.id IN (${Prisma.join(roomIdsForAccess)})
      ),
      unread_counts AS (
        SELECT
          m."roomId" AS "roomId",
          COUNT(*)::int AS unread_n
        FROM "Message" m
        INNER JOIN accessible_rooms ar
          ON ar."roomId" = m."roomId"
        LEFT JOIN "RoomReadState" rrs
          ON rrs."roomId" = m."roomId"
         AND rrs."userId" = ${userId}
        WHERE m."senderId" <> ${userId}
          AND m."createdAt" > COALESCE(rrs."lastReadAt", to_timestamp(0))
        GROUP BY m."roomId"
      ),
      latest_messages AS (
        SELECT DISTINCT ON (m."roomId")
          m."roomId" AS "roomId",
          m.id AS "messageId",
          m.content AS "messageContent",
          m.type AS "messageType",
          m."createdAt" AS "messageCreatedAt",
          m."senderId" AS "messageSenderId",
          u.username AS "messageSenderUsername"
        FROM "Message" m
        INNER JOIN accessible_rooms ar
          ON ar."roomId" = m."roomId"
        INNER JOIN "User" u
          ON u.id = m."senderId"
        ORDER BY m."roomId", m."createdAt" DESC
      )
      SELECT
        ar."roomId" AS "roomId",
        COALESCE(uc.unread_n, 0)::int AS "unreadCount",
        lm."messageId" AS "messageId",
        lm."messageContent" AS "messageContent",
        lm."messageType" AS "messageType",
        lm."messageCreatedAt" AS "messageCreatedAt",
        lm."messageSenderId" AS "messageSenderId",
        lm."messageSenderUsername" AS "messageSenderUsername"
      FROM accessible_rooms ar
      LEFT JOIN unread_counts uc
        ON uc."roomId" = ar."roomId"
      LEFT JOIN latest_messages lm
        ON lm."roomId" = ar."roomId"
      ORDER BY lm."messageCreatedAt" DESC NULLS LAST, ar."roomId" ASC
    `;

    const rooms = rows
      .map((row) => ({
        roomId: String(row.roomId),
        unread: Number(row.unreadCount) || 0,
        lastMessage: this.toLastMessageSummary(row),
      }))
      .sort((left, right) => {
        const leftTs = left.lastMessage
          ? new Date(left.lastMessage.createdAt).getTime()
          : 0;
        const rightTs = right.lastMessage
          ? new Date(right.lastMessage.createdAt).getTime()
          : 0;

        if (leftTs !== rightTs) {
          return rightTs - leftTs;
        }

        return right.unread - left.unread;
      });

    const totalUnread = rooms.reduce((sum, room) => sum + room.unread, 0);

    return {
      totalUnread,
      rooms,
    };
  }

  private toLastMessageSummary(
    row: UnreadRoomSummaryRow,
  ): RoomLastMessageSummary | null {
    if (
      !row.messageId ||
      !row.messageCreatedAt ||
      !row.messageSenderId ||
      !row.messageSenderUsername
    ) {
      return null;
    }

    const normalizedContent = this.resolveUnreadPreview(row);
    const normalizedCreatedAt = this.normalizeSummaryCreatedAt(
      row.messageCreatedAt,
    );
    if (!normalizedContent) {
      return null;
    }

    if (!normalizedCreatedAt) {
      return null;
    }

    return {
      id: row.messageId,
      content: normalizedContent,
      createdAt: normalizedCreatedAt,
      senderId: row.messageSenderId,
      senderUsername: row.messageSenderUsername,
      type: String(row.messageType ?? 'TEXT'),
    };
  }

  private normalizeSummaryCreatedAt(
    value: Date | string | null | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString();
    }

    if (typeof value === 'string') {
      const parsedDate = new Date(value);
      if (Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      return parsedDate.toISOString();
    }

    return null;
  }

  private resolveUnreadPreview(row: UnreadRoomSummaryRow): string | null {
    return (
      mediaPreviewLabel(row.messageType, row.messageContent) ??
      this.normalizeMessagePreview(row.messageContent)
    );
  }

  private normalizeMessagePreview(content: string | null | undefined) {
    const rawContent = String(content || '');
    const trimmed = rawContent.trim();

    if (
      trimmed.startsWith(VOICE_META_PREFIX) &&
      trimmed.endsWith(VOICE_META_SUFFIX)
    ) {
      return 'Голосовое сообщение';
    }

    return stripLegacyReplyPrefix(rawContent).replace(/\s+/g, ' ').trim();
  }
}
