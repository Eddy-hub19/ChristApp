import { stripLegacyReplyPrefix } from 'src/common/legacy-reply-prefix';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessagesService } from 'src/messages/messages.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { userMayAccessRoomByTitle } from 'src/chat/room-access.util';
import { RegisterPushSubscriptionDto } from './dto/push-subscription.dto';
import { MessageType, Prisma } from '@prisma/client';
import {
  PUSH_RETRY_DELAY_MS,
  PUSH_TTL_SECONDS,
  PushDeliveryStats,
  isRetryablePushStatus,
  summarizeDispatch,
  type PushKind,
  type PushSendResult,
} from './push-delivery';
import { buildPushDisplay, pushMessageText, truncatePushText } from './push-text';

type ChatPushNotificationInput = {
  messageId: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  content: string;
  createdAt: Date;
  messageType?: MessageType;
  fileUrl?: string | null;
  /** Користувачі, у яких ця кімната зараз відкрита на екрані — їм пуш не потрібен. */
  excludeUserIds?: string[];
  /** Автор повідомлення, на яке це відповідь: йому пуш приходить у вигляді "<імʼя> відповів(ла) вам: …". */
  repliedToUserId?: string;
};

/** Ліміт тіла JSON до шифрування web-push (запас до ~4 КБ після overhead). */
const PUSH_JSON_UTF8_MAX_BYTES = 3600;

type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);

  private readonly GLOBAL_ROOM = resolveGlobalRoomId();

  /** Лічильники відправки по типах подій (для логів і діагностики). */
  readonly deliveryStats = new PushDeliveryStats();

  private readonly isConfigured: boolean;
  private readonly publicKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly messagesService: MessagesService,
  ) {
    const publicKey =
      this.configService.get<string>('WEB_PUSH_PUBLIC_KEY')?.trim() || '';
    const privateKey =
      this.configService.get<string>('WEB_PUSH_PRIVATE_KEY')?.trim() || '';
    const subject =
      this.configService.get<string>('WEB_PUSH_SUBJECT')?.trim() ||
      'mailto:notifications@christapp.local';

    if (publicKey && privateKey) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.isConfigured = true;
      this.publicKey = publicKey;
      this.startStatsLog();
      return;
    }

    this.isConfigured = false;
    this.publicKey = null;
    this.logger.warn(
      'Web Push disabled: set WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY in backend environment.',
    );
  }

  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastLoggedStats = '';

  /** Раз на 10 хв (якщо щось змінилось) — зведення: скільки пушів відправлено/не вдалось по типах подій. */
  private startStatsLog() {
    this.statsTimer = setInterval(() => {
      const snapshot = JSON.stringify(this.deliveryStats.snapshot());
      if (snapshot === '{}' || snapshot === this.lastLoggedStats) return;
      this.lastLoggedStats = snapshot;
      this.logger.log(`push stats (since start): ${snapshot}`);
    }, 10 * 60 * 1000);
    this.statsTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }

  getPublicConfig() {
    return {
      enabled: this.isConfigured,
      publicKey: this.publicKey,
    };
  }

  /**
   * Стан підписок користувача. `endpoint` — підписка ЦЬОГО пристрою (з браузера): чи є вона на сервері.
   * Підписки зберігаються окремо для кожного пристрою, пуш іде на всі.
   */
  async getStatus(userId: string, endpoint?: string) {
    const devices = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, endpoint: true, userAgent: true, lastUsedAt: true },
    });
    const normalized = endpoint?.trim();

    return {
      enabled: this.isConfigured,
      hasSubscription: devices.length > 0,
      subscriptionsCount: devices.length,
      ...(normalized
        ? { thisDeviceRegistered: devices.some((d) => d.endpoint === normalized) }
        : {}),
      devices: devices.map((d) => ({
        id: d.id,
        current: normalized ? d.endpoint === normalized : false,
        userAgent: d.userAgent?.slice(0, 120) ?? null,
        lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Тестове сповіщення на пристрої користувача (усі або лише з даним endpoint) з результатом по кожному. */
  async sendTestPush(userId: string, endpoint?: string) {
    if (!this.isConfigured) {
      return { ok: false as const, code: 'DISABLED' as const, results: [] };
    }
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, ...(endpoint?.trim() ? { endpoint: endpoint.trim() } : {}) },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });
    if (!subscriptions.length) {
      return { ok: false as const, code: 'NO_SUBSCRIPTION' as const, results: [] };
    }
    const badge = (await this.getCombinedUnreadBadgeCounts([userId]).catch(() => null))?.get(userId);
    const createdAt = new Date().toISOString();
    const results = await Promise.all(
      subscriptions.map((sub) =>
        this.sendToSubscription(
          sub,
          {
            title: 'ChristApp',
            body: 'Тестове сповіщення ✅',
            targetUrl: '/profile',
            roomId: 'test',
            senderId: '',
            createdAt,
            messageId: `test-${Date.now()}`,
            badgeCount: badge,
          },
          'test',
        ),
      ),
    );
    this.logger.log(summarizeDispatch('test', `user=${userId}`, 1, results));
    return {
      ok: results.some((r) => r.ok),
      code: results.some((r) => r.ok) ? ('SENT' as const) : ('FAILED' as const),
      results: results.map((r) => ({ ok: r.ok, status: r.status ?? null, removed: Boolean(r.removed) })),
    };
  }

  async upsertSubscription(
    userId: string,
    dto: RegisterPushSubscriptionDto,
    userAgent?: string,
  ) {
    const endpoint = dto.endpoint?.trim();
    const p256dh = dto.keys?.p256dh?.trim();
    const auth = dto.keys?.auth?.trim();

    if (!endpoint || !p256dh || !auth) {
      throw new BadRequestException('Некорректная push-подписка');
    }

    const subscription = await this.prisma.pushSubscription.upsert({
      where: {
        endpoint,
      },
      update: {
        userId,
        p256dh,
        auth,
        expirationTime:
          typeof dto.expirationTime === 'number'
            ? String(dto.expirationTime)
            : null,
        userAgent: userAgent?.trim() || null,
      },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        expirationTime:
          typeof dto.expirationTime === 'number'
            ? String(dto.expirationTime)
            : null,
        userAgent: userAgent?.trim() || null,
      },
    });

    return {
      ok: true,
      subscriptionId: subscription.id,
    };
  }

  async unsubscribe(userId: string, endpoint: string) {
    const normalizedEndpoint = endpoint?.trim();

    if (!normalizedEndpoint) {
      throw new BadRequestException('endpoint обязателен');
    }

    const { count } = await this.prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint: normalizedEndpoint,
      },
    });

    return {
      ok: true,
      removed: count,
    };
  }

  async sendChatMessagePush(input: ChatPushNotificationInput) {
    if (!this.isConfigured) {
      return;
    }

    const text = pushMessageText(input.messageType, input.content);
    if (!text) {
      return;
    }

    const { recipientUserIds, roomTitle } = await this.resolveRecipientUserIds(
      input.roomId,
      input.senderId,
    );

    // Пуш не шлемо ЛИШЕ тим, хто просто зараз дивиться цей чат (застосунок видимий, кімната на екрані).
    const excluded = new Set(input.excludeUserIds ?? []);
    const deliverableUserIds = recipientUserIds.filter(
      (userId) => !excluded.has(userId),
    );

    if (!deliverableUserIds.length) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        userId: { in: deliverableUserIds },
      },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    if (!subscriptions.length) {
      return;
    }

    const roomKind: 'dm' | 'group' | 'global' =
      input.roomId === this.GLOBAL_ROOM
        ? 'global'
        : roomTitle?.startsWith('dm:')
          ? 'dm'
          : 'group';

    const uniqueRecipientIds = [
      ...new Set(subscriptions.map((sub) => sub.userId)),
    ];

    // Лічильник для бейджа рахує сервер — одним запитом на всіх отримувачів одразу.
    let badgeByUserId = new Map<string, number>();
    try {
      badgeByUserId =
        await this.getCombinedUnreadBadgeCounts(uniqueRecipientIds);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Не удалось посчитать badge для push: ${reason}`);
    }

    const results = await Promise.all(
      subscriptions.map((subscription) => {
        const { title, body } = buildPushDisplay({
          kind: roomKind,
          senderName: input.senderUsername,
          roomTitle,
          text,
          isReplyToRecipient: subscription.userId === input.repliedToUserId,
        });

        return this.sendToSubscription(
          subscription,
          {
            title,
            body,
            targetUrl: this.resolveTargetUrl(
              roomTitle ?? undefined,
              input.roomId,
              input.senderId,
              subscription.userId,
            ),
            roomId: input.roomId,
            senderId: input.senderId,
            createdAt: input.createdAt.toISOString(),
            messageId: input.messageId,
            badgeCount: badgeByUserId.get(subscription.userId),
          },
          'chat',
        );
      }),
    );
    this.logger.log(
      summarizeDispatch(
        'chat',
        `room=${input.roomId} type=${input.messageType ?? 'TEXT'}`,
        uniqueRecipientIds.length,
        results,
      ),
    );
  }

  private async resolveRecipientUserIds(
    roomId: string,
    senderId: string,
  ): Promise<{ recipientUserIds: string[]; roomTitle: string | null }> {
    if (roomId === this.GLOBAL_ROOM) {
      const users = await this.prisma.user.findMany({
        where: {
          id: {
            not: senderId,
          },
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      return {
        recipientUserIds: users.map((user) => user.id),
        roomTitle: null,
      };
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { title: true },
    });
    const title = room?.title ?? '';

    const members = await this.prisma.roomMember.findMany({
      where: {
        roomId,
        userId: {
          not: senderId,
        },
      },
      select: {
        userId: true,
      },
    });

    const rawIds = Array.from(new Set(members.map((member) => member.userId)));
    const recipientUserIds = rawIds.filter((uid) =>
      userMayAccessRoomByTitle(uid, title),
    );

    return { recipientUserIds, roomTitle: room?.title ?? null };
  }

  private resolveTargetUrl(
    roomTitle: string | undefined,
    roomId: string,
    senderId: string,
    recipientUserId: string,
  ) {
    if (roomId === this.GLOBAL_ROOM) {
      return '/chat/global';
    }

    if (roomTitle?.startsWith('dm:')) {
      // Для приватного чату відкриваємо маршрут за ID співрозмовника (як очікує фронтенд).
      const directIds = roomTitle.split(':').slice(1);
      const counterpartyId =
        directIds.find((id) => id !== recipientUserId) || senderId;
      return `/chat/${counterpartyId}`;
    }

    return `/chat/${roomId}`;
  }

  private async sendToSubscription(
    subscription: PushSubscriptionRecord,
    payload: {
      title: string;
      body: string;
      targetUrl: string;
      roomId: string;
      senderId: string;
      createdAt: string;
      messageId: string;
      badgeCount?: number;
      /** 'read-sync' — службовий пуш: нічого не показувати, лише прибрати сповіщення. */
      kind?: 'read-sync';
      readRoomId?: string;
    },
    kind: PushKind,
  ): Promise<PushSendResult> {
    const pushSubscription: webPush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const payloadString = this.serializePushPayload(
      payload as unknown as Record<string, unknown>,
    );

    // Службовий read-sync — «тихий» і застарілий за годину; справжні повідомлення живуть добу
    // (телефон без мережі отримає їх, щойно з'явиться зв'язок).
    const options = {
      TTL: kind === 'readSync' ? 60 * 60 : PUSH_TTL_SECONDS,
      urgency: 'high' as const,
    };

    let retried = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await webPush.sendNotification(pushSubscription, payloadString, options);
        const ok: PushSendResult = { ok: true };
        this.deliveryStats.record(kind, ok, retried);
        void this.prisma.pushSubscription
          .update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
        return ok;
      } catch (error: unknown) {
        const statusCode = this.extractPushHttpStatus(error);

        if (statusCode === 404 || statusCode === 410) {
          await this.removeInvalidPushSubscription(subscription, statusCode);
          const result: PushSendResult = { ok: false, status: statusCode, removed: true };
          this.deliveryStats.record(kind, result, retried);
          return result;
        }

        if (attempt === 0 && isRetryablePushStatus(statusCode) && statusCode !== 401 && statusCode !== 403) {
          retried = true;
          await new Promise((resolve) => setTimeout(resolve, PUSH_RETRY_DELAY_MS));
          continue;
        }

        if (statusCode === 401 || statusCode === 403) {
          this.logger.warn(
            `Push HTTP ${statusCode} (subscriptionId=${subscription.id}) — проверьте WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY и WEB_PUSH_SUBJECT; ключи должны совпадать с фронтом.`,
          );
        } else {
          const bodySnippet =
            error &&
            typeof error === 'object' &&
            'body' in error &&
            typeof (error as { body: unknown }).body === 'string'
              ? ((error as { body: string }).body || '').slice(0, 180)
              : '';
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to send push (subscriptionId=${subscription.id}) HTTP=${statusCode ?? 'n/a'}: ${reason}${
              bodySnippet ? ` | body: ${bodySnippet}` : ''
            }`,
          );
        }
        const result: PushSendResult = {
          ok: false,
          status: statusCode,
          error: error instanceof Error ? error.message : String(error),
        };
        this.deliveryStats.record(kind, result, retried);
        return result;
      }
    }
    return { ok: false };
  }

  /** Стискає JSON-рядок сповіщення під ліміт провайдера (після шифрування ліміт жорсткіший). */
  private serializePushPayload(payload: Record<string, unknown>): string {
    const maxBytes = PUSH_JSON_UTF8_MAX_BYTES;
    const working: Record<string, unknown> = { ...payload };
    let str = JSON.stringify(working);
    let guard = 0;

    while (Buffer.byteLength(str, 'utf8') > maxBytes && guard < 14) {
      guard += 1;
      const body = String(working.body ?? '');
      if (body.length > 28) {
        working.body = `${body.slice(0, Math.max(24, Math.floor(body.length * 0.82)))}…`;
      } else {
        const title = String(working.title ?? '');
        working.title =
          title.length > 12
            ? `${title.slice(0, Math.max(8, Math.floor(title.length * 0.85)))}…`
            : title;
        working.body = 'Новое сообщение';
      }
      str = JSON.stringify(working);
    }

    if (Buffer.byteLength(str, 'utf8') > maxBytes) {
      str = JSON.stringify({
        title: 'ChristApp',
        body: 'Новое сообщение',
        targetUrl: working.targetUrl,
        roomId: working.roomId,
        messageId: working.messageId,
        createdAt: working.createdAt,
        senderId: working.senderId,
        ...(typeof working.badgeCount === 'number'
          ? { badgeCount: working.badgeCount }
          : {}),
        // Службовий пуш не можна «обрізати» до звичайного — SW показав би порожнє сповіщення.
        ...(working.kind ? { kind: working.kind } : {}),
        ...(working.readRoomId ? { readRoomId: working.readRoomId } : {}),
      });
    }

    return str;
  }

  private extractPushHttpStatus(error: unknown): number | undefined {
    const WebPushErrorCtor = (
      webPush as {
        WebPushError?: new (...args: never[]) => Error & { statusCode: number };
      }
    ).WebPushError;

    if (WebPushErrorCtor && error instanceof WebPushErrorCtor) {
      const sc = error.statusCode;
      return typeof sc === 'number' && Number.isFinite(sc) ? sc : undefined;
    }

    if (error && typeof error === 'object' && 'statusCode' in error) {
      const sc = (error as { statusCode: unknown }).statusCode;
      return typeof sc === 'number' && Number.isFinite(sc) ? sc : undefined;
    }

    return undefined;
  }

  /**
   * Користувач прочитав кімнату — прибираємо її сповіщення зі шторки на ЙОГО інших пристроях
   * і оновлюємо там бейдж. Це службовий (тихий) пуш: SW його не показує.
   */
  async sendReadSyncPush(input: {
    userId: string;
    roomId: string;
    /** Підписка пристрою, який щойно прочитав — їй пуш не потрібен. */
    excludeEndpoint?: string;
  }) {
    if (!this.isConfigured) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: input.userId },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    const targets = subscriptions.filter(
      (sub) => sub.endpoint !== input.excludeEndpoint,
    );
    if (!targets.length) {
      return;
    }

    let badgeCount = 0;
    try {
      const totals = await this.getCombinedUnreadBadgeCounts([input.userId]);
      badgeCount = totals.get(input.userId) ?? 0;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Не удалось посчитать badge для read-sync: ${reason}`);
      return;
    }

    const createdAt = new Date().toISOString();

    const results = await Promise.all(
      targets.map((sub) =>
        this.sendToSubscription(
          sub,
          {
            title: '',
            body: '',
            targetUrl: '/chat',
            roomId: input.roomId,
            senderId: input.userId,
            createdAt,
            messageId: '',
            badgeCount,
            kind: 'read-sync',
            readRoomId: input.roomId,
          },
          'readSync',
        ),
      ),
    );
    this.logger.debug(
      summarizeDispatch('readSync', `room=${input.roomId}`, 1, results),
    );
  }

  async sendCallPush(input: {
    callerId: string;
    callerName: string;
    targetUserId: string;
    targetUrl: string;
  }) {
    if (!this.isConfigured) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: input.targetUserId },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    if (!subscriptions.length) {
      return;
    }

    const title = input.callerName;
    const body = 'Вхідний аудіодзвінок';
    const createdAt = new Date().toISOString();
    const badge = (
      await this.getCombinedUnreadBadgeCounts([input.targetUserId]).catch(() => null)
    )?.get(input.targetUserId);

    const results = await Promise.all(
      subscriptions.map((sub) =>
        this.sendToSubscription(
          sub,
          {
            title,
            body,
            targetUrl: input.targetUrl,
            roomId: input.callerId,
            senderId: input.callerId,
            createdAt,
            messageId: `call-${input.callerId}-${Date.now()}`,
            badgeCount: badge,
          },
          'call',
        ),
      ),
    );
    this.logger.log(summarizeDispatch('call', `caller=${input.callerId}`, 1, results));
  }

  /** Запрошення до «Киношки»: клік відкриває список кімнат, де чекає «Прийняти». */
  async sendWatchInvitePush(input: {
    targetUserIds: string[];
    inviterName: string;
    roomTitle: string;
    roomId: string;
  }) {
    if (!this.isConfigured || !input.targetUserIds.length) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: input.targetUserIds } },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    if (!subscriptions.length) {
      return;
    }

    const createdAt = new Date().toISOString();
    const body = truncatePushText(
      `${input.inviterName || 'Хтось'} кличе на перегляд «${input.roomTitle}»`,
    );
    const recipientIds = [...new Set(subscriptions.map((sub) => sub.userId))];
    const badges = await this.getCombinedUnreadBadgeCounts(recipientIds).catch(
      () => new Map<string, number>(),
    );

    const results = await Promise.all(
      subscriptions.map((sub) =>
        this.sendToSubscription(
          sub,
          {
            title: '🎬 Киношка',
            body,
            targetUrl: '/cinema',
            roomId: `watch-${input.roomId}`,
            senderId: '',
            createdAt,
            // Унікальний id: запрошення не повинні підміняти ні одне одного, ні повідомлення чату зали.
            messageId: `invite-${input.roomId}-${Date.now()}`,
            badgeCount: badges.get(sub.userId),
          },
          'watchInvite',
        ),
      ),
    );
    this.logger.log(
      summarizeDispatch('watchInvite', `room=${input.roomId}`, recipientIds.length, results),
    );
  }

  /**
   * Бейдж на іконці застосунку — сума непрочитаного в основному чаті й у чатах Киношки.
   * Підрахунок Киношки — окремий try/catch: якщо він впаде, бейдж чату все одно порахується
   * (як і до появи Киношки), а не обнулиться через побічну фічу.
   */
  private async getCombinedUnreadBadgeCounts(
    userIds: string[],
  ): Promise<Map<string, number>> {
    const [chatTotals, watchTotals] = await Promise.all([
      this.messagesService.getUnreadTotalsForUsers(userIds),
      this.getWatchUnreadTotalsForUsers(userIds).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Не удалось посчитать badge Киношки: ${reason}`);
        return new Map<string, number>();
      }),
    ]);

    const combined = new Map<string, number>();
    for (const userId of new Set([
      ...chatTotals.keys(),
      ...watchTotals.keys(),
    ])) {
      combined.set(
        userId,
        (chatTotals.get(userId) ?? 0) + (watchTotals.get(userId) ?? 0),
      );
    }
    return combined;
  }

  private async getWatchUnreadTotalsForUsers(
    userIds: string[],
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!uniqueUserIds.length) {
      return totals;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ userId: string; unreadCount: number }>
    >`
      SELECT
        wrm."userId" AS "userId",
        COUNT(wm.id)::int AS "unreadCount"
      FROM "WatchRoomMember" wrm
      JOIN "WatchMessage" wm
        ON wm."roomId" = wrm."roomId"
       AND wm."userId" <> wrm."userId"
       AND wm."type" = 'TEXT'
       AND wm."createdAt" > wrm."lastReadAt"
      WHERE wrm."userId" IN (${Prisma.join(uniqueUserIds)})
        AND wrm.status = 'JOINED'
      GROUP BY wrm."userId"
    `;

    for (const row of rows) {
      totals.set(String(row.userId), Number(row.unreadCount) || 0);
    }

    return totals;
  }

  /**
   * Нове повідомлення в чаті кімнати Киношки — пуш усім учасникам (крім автора й тих, хто зараз ДИВИТЬСЯ
   * на залу: сторінка зали відкрита й видима). Мініплеєр і згорнутий застосунок «переглядом» не є.
   */
  async sendWatchMessagePush(input: {
    messageId: string;
    roomId: string;
    roomTitle: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: Date;
    /** Учасники, які просто зараз дивляться на залу — їм пуш не потрібен. */
    excludeUserIds?: string[];
    /** Автор повідомлення, на яке це відповідь: йому пуш приходить як "<імʼя> відповів(ла) вам: …". */
    repliedToUserId?: string;
  }) {
    if (!this.isConfigured) {
      return;
    }

    const text = pushMessageText('TEXT', input.content);
    if (!text) {
      return;
    }

    const members = await this.prisma.watchRoomMember.findMany({
      where: {
        roomId: input.roomId,
        userId: { not: input.senderId },
        status: 'JOINED',
        notificationsMuted: false,
      },
      select: { userId: true },
    });

    const excluded = new Set(input.excludeUserIds ?? []);
    const deliverableUserIds = members
      .map((member) => member.userId)
      .filter((userId) => !excluded.has(userId));

    if (!deliverableUserIds.length) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: deliverableUserIds } },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    if (!subscriptions.length) {
      return;
    }

    const uniqueRecipientIds = [
      ...new Set(subscriptions.map((sub) => sub.userId)),
    ];

    let badgeByUserId = new Map<string, number>();
    try {
      badgeByUserId =
        await this.getCombinedUnreadBadgeCounts(uniqueRecipientIds);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Не удалось посчитать badge для push Киношки: ${reason}`,
      );
    }

    const createdAt = input.createdAt.toISOString();
    const roomId = `watch-${input.roomId}`;

    const results = await Promise.all(
      subscriptions.map((subscription) => {
        const { title, body } = buildPushDisplay({
          kind: 'watch',
          senderName: input.senderName,
          roomTitle: input.roomTitle,
          text,
          isReplyToRecipient: subscription.userId === input.repliedToUserId,
        });
        return this.sendToSubscription(
          subscription,
          {
            title,
            body,
            targetUrl: `/cinema/${input.roomId}`,
            roomId,
            senderId: input.senderId,
            createdAt,
            messageId: input.messageId,
            badgeCount: badgeByUserId.get(subscription.userId),
          },
          'watch',
        );
      }),
    );
    this.logger.log(
      summarizeDispatch('watch', `room=${input.roomId}`, uniqueRecipientIds.length, results),
    );
  }

  private async removeInvalidPushSubscription(
    subscription: PushSubscriptionRecord,
    httpStatus: number,
  ) {
    try {
      await this.prisma.pushSubscription.delete({
        where: { id: subscription.id },
      });
    } catch {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: subscription.endpoint },
      });
    }

    this.logger.log(
      `Push subscription removed (HTTP ${httpStatus}, id=${subscription.id}) — подписка недействительна.`,
    );
  }
}
