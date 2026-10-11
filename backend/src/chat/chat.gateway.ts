import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  MessagesService,
  type MessageReplyPreview,
} from 'src/messages/messages.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { isAdminDashboardUsername } from 'src/config/admin-dashboard';
import {
  SHARE_WITH_JESUS_ROOM_PREFIX,
  userMayAccessRoomByTitle,
} from 'src/chat/room-access.util';
import { CHAT_VIEW_KEY, roomViews } from 'src/push/room-view.registry';
import { presence, type PresenceChange } from './presence.registry';
import { LastSeenWriter } from './last-seen-writer';
import { RoomAccessCache } from './room-access.cache';
import { SnakeDuelManager } from './snake-duel/snake-duel.manager';
import {
  GuessCharacterManager,
  guessCatalog,
} from './guess-character/guess-character.manager';
import { PuzzleManager, puzzleCatalog } from './puzzle/puzzle.manager';
import { GameActivityService } from './game-activity/game-activity.service';
import {
  canUserPostToRoom,
  canUserReadRoom,
} from 'src/chat/user-may-post-to-room';
import { MessageType } from '@prisma/client';
import { ACCEPTED_CHAT_REACTIONS } from 'src/common/chat-reactions';

interface SocketUser {
  id: string;
  username: string;
  nickname: string;
  email?: string;
}

/** Збережене повідомлення, яке розсилається кімнаті подією `newMessage`. */
type NewChatMessageInput = {
      id: string;
      type: MessageType;
      content: string | null;
      fileUrl: string | null;
      voiceDuration?: number | null;
      mediaWidth?: number | null;
      mediaHeight?: number | null;
      fileSize?: number | null;
      createdAt: Date;
      senderId: string;
      sender: { username: string; nickname: string | null };
      replyToId?: string | null;
      replyTo?: MessageReplyPreview | null;
      clientMessageId?: string | null;
    };

interface SocketWithUser extends Socket {
  data: {
    user?: SocketUser;
    /** Кімнати, які цей сокет ЗАРАЗ тримає на екрані (див. `roomViewState`). */
    viewedRooms?: Set<string>;
    /** Перевірений контекст гри «Пазли» для цього сокета: рух шлеться ~15 разів на секунду, тож БД на кожен кадр не чіпаємо. */
    puzzleCtx?: {
      userId: string;
      roomId: string;
      players: [string, string];
    };
  };
}

type ReactionEventBody = {
  messageId: string;
  type: string;
  chatId: string;
};

type RoomReadStatesPayload = {
  roomId: string;
  readStates: Array<{
    userId: string;
    lastReadAt: string;
  }>;
};

type CallUserPayload = {
  targetUserId?: string;
  channelName?: string;
};

type CallResponsePayload = {
  initiatorId?: string;
  channelName?: string;
  accepted?: boolean;
};

type EditMessagePayload = {
  messageId?: string;
  content?: string;
};

type DoodleScorePayload = {
  roomId?: string;
  score?: number;
};

type DoodleResetPayload = {
  roomId?: string;
};

type DoodleStatePayload = {
  roomId?: string;
  state?: {
    x?: number;
    y?: number;
    cameraY?: number;
    score?: number;
    alive?: boolean;
    emittedAt?: number;
  };
};

type SnakeScorePayload = {
  roomId?: string;
  score?: number;
};

type SnakeResetPayload = {
  roomId?: string;
};

type SnakeStatePayload = {
  roomId?: string;
  state?: {
    headX?: number;
    headY?: number;
    foodX?: number;
    foodY?: number;
    score?: number;
    alive?: boolean;
    emittedAt?: number;
    body?: Array<{ x?: number; y?: number }>;
  };
};

/** Ігри в особистих чатах. Рахунок і сесію тримає сервер — це єдине джерело правди. */
type GameKind = 'doodle' | 'snake';

type RoomGameSession = {
  kind: GameKind;
  roomId: string;
  /** Номер партії: зростає на кожному скиданні, щоб відкинути пакети з попередньої. */
  round: number;
  startedAt: number;
  /** userId → поточний рахунок у цій партії. */
  scores: Map<string, number>;
};

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  // Загальний чат — це просто кімната
  private readonly GLOBAL_ROOM = resolveGlobalRoomId();

  /** Спільний «plasma» фон кімнати (лише в пам’яті WS; без БД). */
  private readonly roomPlasmaBackground = new Map<string, boolean>();

  /** `${roomId}:${kind}` → ігрова сесія кімнати (у пам'яті WS; партія живе, поки живе кімната). */
  private readonly gameSessions = new Map<string, RoomGameSession>();

  /** Серверна дуель Snake (рівень 2): лобі, відлік, тіки, зіткнення. */
  private readonly snakeDuel = new SnakeDuelManager(
    (roomId, event, payload) => {
      this.server?.to(roomId).emit(event, payload);
    },
  );

  /** «Вгадай персонажа»: сесія живе в пам'яті сервера й переживає вихід гравців із гри. Знімки йдуть кожному гравцеві окремо (`user:<id>`), бо в них є таємниця загадувача. */
  private readonly guessCharacter = new GuessCharacterManager(
    (userId, event, payload) => {
      this.server?.to(`user:${userId}`).emit(event, payload);
    },
  );

  /** «Пазли»: сесія в пам'яті сервера, переживає вихід гравців; знімки йдуть кожному гравцеві окремо (`user:<id>`). */
  private readonly puzzle = new PuzzleManager((userId, event, payload) => {
    this.server?.to(`user:${userId}`).emit(event, payload);
  });

  /** Кеш доступу до кімнат для частих подій (набір, перегляд, heartbeat ігор, ходи): без нього кожна коштувала 2-3 запити до БД. */
  private readonly roomAccess = new RoomAccessCache();

  /** `User.lastSeenAt`: лише при переході в офлайн, з тротлінгом на користувача. */
  private readonly lastSeen = new LastSeenWriter((userId, lastSeenAt) =>
    this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt } }),
  );

  /** «Грає в …» у чаті: лише в пам'яті, без БД і пушів (heartbeat + TTL). */
  private readonly gameActivity = new GameActivityService();
  private gameActivitySweeper: ReturnType<typeof setInterval> | null = null;


  /**
   * `${userId}:${roomId}` → коли востаннє слали read-sync.
   * Клієнт позначає кімнату прочитаною на кожне нове повідомлення, а службовий пуш дорогий
   * (квота браузера + батарея), тож шлемо його не частіше за раз на кілька секунд.
   */
  private readonly lastReadSyncAt = new Map<string, number>();

  private static readonly READ_SYNC_THROTTLE_MS = 2_000;
  private readonly pendingReadSync = new Map<string, ReturnType<typeof setTimeout>>();

  private static readonly ALLOWED_REACTIONS = ACCEPTED_CHAT_REACTIONS;
  private static readonly ATTACK_WINDOW_MS = 10 * 60 * 1000;
  private static readonly SOCKET_BAN_MS = 15 * 60 * 1000;

  private static readonly ATTACK_PATTERNS: RegExp[] = [
    /<\s*script\b/i,
    /javascript\s*:/i,
    /on(?:error|load|click|mouseover)\s*=/i,
    /\bunion\s+select\b/i,
    /\bdrop\s+table\b/i,
    /\b(?:rm\s+-rf|wget\s+|curl\s+|powershell\s+-enc|cmd\.exe\b)\b/i,
    /\.\.[/\\]/,
    /%3c\s*script|%00|\\x[0-9a-f]{2}/i,
  ];

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
    private pushService: PushService,
  ) {}

  // userId → timestamps of suspicious attempts
  private readonly suspiciousAttempts = new Map<string, number[]>();

  // userId → epoch ms until blocked
  private readonly tempBlockedUsers = new Map<string, number>();

  private unsubscribePresence: (() => void) | null = null;

  /** true після onModuleDestroy — щоб відкладені задачі (напр. sweeper ігрової активності) не запускались знову. */
  private destroyed = false;

  /**
   * Після старту бекенду ніхто не онлайн, доки не надішле `active` (реєстр лише в пам'яті; `lastSeenAt` у БД лишається).
   * Клієнти, що перепідключились у фоні, онлайн не стають — тільки ті, у кого застосунок видно.
   */
  onModuleInit() {
    presence.reset();
    this.unsubscribePresence = presence.onChange((change) =>
      this.publishPresenceChange(change),
    );
    presence.start();
  }

  onModuleDestroy() {
    this.destroyed = true;
    this.unsubscribePresence?.();
    this.unsubscribePresence = null;
    presence.stop();
    this.lastSeen.dispose();
    for (const timer of this.pendingReadSync.values()) clearTimeout(timer);
    this.pendingReadSync.clear();
    this.snakeDuel.disposeAll();
    this.guessCharacter.disposeAll();
    this.puzzle.disposeAll();
    if (this.gameActivitySweeper) clearInterval(this.gameActivitySweeper);
    this.gameActivitySweeper = null;
  }

  /** Зміна онлайну розсилається всім одразу: шапка чату, список чатів, учасники кінотеатру, панель учасників. */
  private publishPresenceChange(change: PresenceChange) {
    if (!change.isOnline) {
      // Пишемо лише при переході в офлайн і не частіше за раз на 15 с на людину (швидке «згорнув-розгорнув»).
      this.lastSeen.schedule(change.userId, change.lastSeenAt ?? new Date());
    }
    this.server.emit('userPresenceChanged', {
      userId: change.userId,
      isOnline: change.isOnline,
      lastSeenAt: change.lastSeenAt?.toISOString() ?? null,
    });
    this.emitOnlinePresence();
  }

  private onlinePresencePayload() {
    const userIds = presence.onlineUserIds();
    return { userIds, count: userIds.length };
  }

  private emitOnlinePresence(target: { emit: (event: string, ...args: unknown[]) => unknown } = this.server) {
    const payload = this.onlinePresencePayload();
    target.emit('onlineCount', payload.count);
    target.emit('onlineUsers', payload);
  }

  private isAttackPayload(content: string): boolean {
    return ChatGateway.ATTACK_PATTERNS.some((pattern) => pattern.test(content));
  }

  private isUserTemporarilyBlocked(userId: string): boolean {
    const blockedUntil = this.tempBlockedUsers.get(userId);
    if (!blockedUntil) {
      return false;
    }
    if (Date.now() >= blockedUntil) {
      this.tempBlockedUsers.delete(userId);
      return false;
    }
    return true;
  }

  private registerSuspiciousAttempt(userId: string): number {
    const now = Date.now();
    const recent = (this.suspiciousAttempts.get(userId) ?? []).filter(
      (ts) => now - ts <= ChatGateway.ATTACK_WINDOW_MS,
    );
    recent.push(now);
    this.suspiciousAttempts.set(userId, recent);
    return recent.length;
  }

  private async handleSuspiciousMessage(
    client: SocketWithUser,
    user: SocketUser,
    roomId: string,
  ) {
    const attempts = this.registerSuspiciousAttempt(user.id);

    client.emit('securityFlag', {
      level: attempts >= 2 ? 'danger' : 'warning',
      reason: 'suspicious-message',
      message:
        attempts >= 2
          ? 'Подозрительная активность. Вы временно ограничены.'
          : 'Сообщение заблокировано системой защиты.',
    });
    client.emit(
      'error',
      attempts >= 2
        ? 'Подозрительная активность. Доступ временно ограничен.'
        : 'Сообщение заблокировано системой защиты.',
    );

    if (attempts === 1) {
      return;
    }

    if (attempts === 2) {
      await client.leave(roomId);
      client.emit('roomModerationKick', {
        roomId,
        reason: 'suspicious-message',
      });
      return;
    }

    const blockedUntil = Date.now() + ChatGateway.SOCKET_BAN_MS;
    this.tempBlockedUsers.set(user.id, blockedUntil);
    client.emit('securityBlocked', {
      until: new Date(blockedUntil).toISOString(),
      reason: 'suspicious-message',
      message: 'Подключение временно ограничено системой безопасности.',
    });
    client.emit(
      'error',
      'Подключение временно ограничено системой безопасности.',
    );
    client.disconnect(true);
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private getShareWithJesusRoomTitle(userId: string) {
    return `${SHARE_WITH_JESUS_ROOM_PREFIX}${userId}`;
  }

  private async ensureShareWithJesusRoomForUser(
    userId: string,
  ): Promise<string> {
    const roomTitle = this.getShareWithJesusRoomTitle(userId);

    const room = await this.prisma.room.upsert({
      where: {
        title: roomTitle,
      },
      update: {},
      create: {
        title: roomTitle,
      },
      select: {
        id: true,
      },
    });

    await this.prisma.roomMember.upsert({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId,
        },
      },
      update: {},
      create: {
        roomId: room.id,
        userId,
      },
    });

    return room.id;
  }

  private async getSocketsByUserId(targetUserId: string) {
    const sockets = await this.server.fetchSockets();
    return sockets.filter((socket) => socket.data?.user?.id === targetUserId);
  }

  private normalizeToken(tokenCandidate: unknown) {
    if (typeof tokenCandidate !== 'string') return '';
    return tokenCandidate.replace(/^Bearer\s+/i, '').trim();
  }

  private async resolveSocketUser(client: SocketWithUser) {
    if (client.data.user) return client.data.user;

    const authToken = client.handshake.auth?.token;
    const headerAuth = client.handshake.headers?.authorization;
    const token = this.normalizeToken(authToken || headerAuth || '');

    if (!token) return undefined;

    try {
      const payload = this.jwt.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) return undefined;

      // Створюємо об'єкт, що відповідає інтерфейсу SocketUser
      const socketUser = {
        ...user,
        nickname: user.nickname ?? user.username, // Якщо ніка немає, беремо логін
      };

      client.data.user = socketUser;
      return socketUser;
    } catch {
      return undefined;
    }
  }

  // ================= ПІДКЛЮЧЕННЯ =================
  async handleConnection(client: SocketWithUser) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      console.warn('[WS] Unauthorized socket connection');
      client.emit('error', 'Не авторизован');
      client.disconnect();
      return;
    }

    if (this.isUserTemporarilyBlocked(user.id)) {
      const blockedUntil = this.tempBlockedUsers.get(user.id) ?? Date.now();
      client.emit('securityBlocked', {
        until: new Date(blockedUntil).toISOString(),
        reason: 'temporary-block',
        message: 'Подключение временно ограничено системой безопасности.',
      });
      client.emit(
        'error',
        'Подключение временно ограничено системой безопасности.',
      );
      client.disconnect(true);
      return;
    }

    // Сокет міг закритись, поки ми перевіряли токен: handleDisconnect для нього вже відпрацював би
    // вхолосту, і пристрій лишився б у реєстрі «привидом».
    if (!client.connected) return;
    presence.connect(client.id, user.id);

    console.log('✅ Connected:', user.username);

    try {
      // Підключаємо до загального чату
      client.join(this.GLOBAL_ROOM);
      // Персональна кімната: сюди йдуть події, потрібні й екрану зі списком чатів (він не входить у кімнати).
      client.join(`user:${user.id}`);

      await this.emitMyRooms(client, user.id);

      // Сокет не рахується онлайном, поки клієнт не пришле `presence:state` (застосунок видно); новому
      // клієнту одразу віддаємо поточний список, далі зміни приходять розсилкою.
      this.emitOnlinePresence(client);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] Post-connect initialization error:', reason);
      client.emit('error', 'Ошибка инициализации чата');
    }
  }

  // ================= RESOLVE SHARE WITH JESUS ROOM =================
  /**
   * Швидко резолвить кімнату «Поділися з Ісусом» для поточного користувача та гарантує членство.
   * Повертає roomId лише власнику (тому інший користувач не зможе отримати чужий roomId через цей метод).
   */
  @SubscribeMessage('resolveShareWithJesusRoomId')
  async handleResolveShareWithJesusRoomId(
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('shareWithJesusRoomIdResolved', {
        ok: false,
        roomId: '',
        error: 'Не авторизован',
      });
      return;
    }

    const roomTitle = this.getShareWithJesusRoomTitle(user.id);
    const roomId = await this.ensureShareWithJesusRoomForUser(user.id);

    client.emit('shareWithJesusRoomIdResolved', {
      ok: true,
      roomId,
      roomTitle,
    });
  }

  // ================= ВІДКЛЮЧЕННЯ =================
  async handleDisconnect(client: SocketWithUser) {
    const user = client.data.user;
    if (!user) return;

    this.clearActiveRoomViewsForSocket(client);
    void this.broadcastGameActivity(this.gameActivity.removeSocket(client.id));

    const userId = user.id;
    presence.disconnect(client.id);
    // Остання вкладка користувача закрилась: гра Snake ставиться на паузу (5 с на повернення).
    if (presence.socketCount(userId) === 0) {
      this.snakeDuel.userDisconnected(userId);
      this.guessCharacter.userDisconnected(userId);
      this.puzzle.userDisconnected(userId);
    }
  }

  /**
   * Клієнт повідомляє, чи застосунок на цьому пристрої зараз видно: `active: true` — відкрили/повернулись
   * і далі раз на ~20 с (heartbeat); `false` — згорнули, заблокували, закрили. Без heartbeat 45 с пристрій
   * вважається таким, що пішов.
   */
  @SubscribeMessage('presence:state')
  async handlePresenceState(
    @MessageBody() body: { active?: boolean } | undefined,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    // Клієнт шле це одразу на `connect`, коли handleConnection ще перевіряє токен: чекаємо авторизацію
    // й реєструємо пристрій самі, інакше перший `active` після (пере)підключення губився б.
    const user = await this.resolveSocketUser(client);
    if (!user || !client.connected) return;
    presence.connect(client.id, user.id);
    presence.setActive(client.id, Boolean(body?.active), user.id);
  }

  // ================= ПРИЄДНАННЯ ДО КІМНАТИ =================
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody()
    body: { roomId: string; limit?: number; skip?: number } | string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body === 'string' ? body : body?.roomId;
    const limit =
      typeof body === 'string'
        ? 50
        : Math.max(1, Math.min(body?.limit ?? 50, 200));
    const skip = typeof body === 'string' ? 0 : Math.max(0, body?.skip ?? 0);

    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    try {
      // Перевіряємо доступ до кімнати
      const hasAccess = await canUserReadRoom(this.prisma, user.id, roomId);
      if (!hasAccess) {
        client.emit('error', 'Нет доступа');
        return;
      }

      // 🔹 Додаємо сокет у кімнату
      await client.join(roomId);

      // 🔹 Надсилаємо історію кімнати
      const history = await this.messagesService.getRoomMessages(
        roomId,
        limit,
        skip,
      );

      const readStates = await this.prisma.roomReadState.findMany({
        where: { roomId },
        select: {
          userId: true,
          lastReadAt: true,
        },
      });

      // Кімната відкрита у користувача: вважаємо поточний зріз прочитаним.
      const readAt = new Date();
      await this.messagesService.markRoomAsRead(roomId, user.id, readAt);
      client.to(roomId).emit('roomReadUpdated', {
        roomId,
        userId: user.id,
        lastReadAt: readAt.toISOString(),
      });

      client.emit('roomHistory', {
        roomId,
        messages: history,
        plasmaBackground: this.roomPlasmaBackground.get(roomId) ?? false,
      });

      client.emit('roomReadStates', {
        roomId,
        readStates: [
          ...readStates
            .filter((item) => item.userId !== user.id)
            .map((item) => ({
              userId: item.userId,
              lastReadAt: item.lastReadAt.toISOString(),
            })),
          {
            userId: user.id,
            lastReadAt: readAt.toISOString(),
          },
        ],
      } satisfies RoomReadStatesPayload);

      client.to(roomId).emit('userJoinedRoom', {
        roomId,
        userId: user.id,
        username: user.nickname || user.username,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] joinRoom failed:', {
        roomId,
        userId: user.id,
        reason,
      });
      client.emit('error', 'Ошибка загрузки истории');
    }
  }

  @SubscribeMessage('setRoomPlasma')
  async handleSetRoomPlasma(
    @MessageBody() body: { roomId: string; enabled?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      return;
    }

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    const hasAccess = await canUserPostToRoom(this.prisma, user.id, roomId);
    if (!hasAccess) {
      client.emit('error', 'Нет доступа');
      return;
    }

    const enabled = Boolean(body?.enabled);
    this.roomPlasmaBackground.set(roomId, enabled);
    this.server.to(roomId).emit('roomPlasma', { roomId, enabled });
  }

  @SubscribeMessage('markRoomRead')
  async handleMarkRoomRead(
    @MessageBody() body: { roomId: string } | string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      return;
    }

    const roomId = typeof body === 'string' ? body : body?.roomId;
    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    const hasAccess = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!hasAccess) {
      client.emit('error', 'Нет доступа');
      return;
    }

    const readAt = new Date();
    await this.messagesService.markRoomAsRead(roomId, user.id, readAt);
    client.to(roomId).emit('roomReadUpdated', {
      roomId,
      userId: user.id,
      lastReadAt: readAt.toISOString(),
    });

    // Інші пристрої цієї ж людини: прибрати сповіщення кімнати зі шторки й оновити бейдж.
    this.scheduleReadSync(user.id, roomId, () => {
      void this.pushService
        .sendReadSyncPush({ userId: user.id, roomId })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          console.error('[Push] sendReadSyncPush failed:', {
            roomId,
            userId: user.id,
            reason,
          });
        });
    });
  }

  @SubscribeMessage('roomTyping')
  async handleRoomTyping(
    @MessageBody()
    body: { roomId: string; isTyping: boolean; activity?: 'text' | 'voice' },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const hasAccess = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!hasAccess) return;

    client.to(roomId).emit('userTyping', {
      roomId,
      userId: user.id,
      username: user.nickname || user.username,
      handle: user.username,
      isTyping: Boolean(body?.isTyping),
      activity: body?.activity === 'voice' ? 'voice' : 'text',
    });
  }

  // ================= «ГРАЄ В …» =================

  /** Надсилає актуальний стан кімнат усім їхнім учасникам (через `user:<id>`); у БД і пуші нічого не йде. */
  private async broadcastGameActivity(roomIds: string[]) {
    if (!this.server) return;
    for (const roomId of new Set(roomIds)) {
      try {
        const members = await this.prisma.roomMember.findMany({
          where: { roomId },
          select: { userId: true },
        });
        if (members.length === 0) continue;
        this.server
          .to(members.map((m) => `user:${m.userId}`))
          .emit('presence:activity', {
            roomId,
            activities: this.gameActivity.snapshot(roomId),
          });
      } catch {
        // статус — другорядна річ: помилка БД не повинна ламати сокет
      }
    }
  }

  private ensureGameActivitySweeper() {
    if (this.gameActivitySweeper || this.destroyed) return;
    this.gameActivitySweeper = setInterval(() => {
      void this.broadcastGameActivity(this.gameActivity.sweep(Date.now()));
      this.guessCharacter.sweepIdle();
      this.puzzle.sweepIdle();
    }, 5_000);
    this.gameActivitySweeper.unref?.();
  }

  /** `game: null` — гру закрито; повтор тієї ж гри раз на ~15 с — heartbeat. */
  @SubscribeMessage('presence:activity')
  async handleGameActivity(
    @MessageBody()
    body: { roomId?: string; game?: string | null; mode?: unknown },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;
    const now = Date.now();
    if (!this.gameActivity.allow(client.id, now)) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId || roomId === this.GLOBAL_ROOM) return;
    const game = body?.game ?? null;
    if (game !== null && typeof game !== 'string') return;
    if (
      game !== null &&
      !(await this.roomAccess.resolve(this.prisma, user.id, roomId))
    ) {
      return;
    }

    this.ensureGameActivitySweeper();
    const changed = this.gameActivity.set(
      client.id,
      { id: user.id, username: user.nickname || user.username },
      roomId,
      game,
      now,
      body?.mode,
    );
    await this.broadcastGameActivity(changed);
  }

  /** Клієнт щойно підключився: віддаємо, хто вже грає в його чатах. */
  @SubscribeMessage('presence:activity-sync')
  async handleGameActivitySync(@ConnectedSocket() client: SocketWithUser) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;
    const active = this.gameActivity.activeRoomIds();
    if (active.length === 0) return;
    const mine = await this.prisma.roomMember.findMany({
      where: { userId: user.id, roomId: { in: active } },
      select: { roomId: true },
    });
    for (const { roomId } of mine) {
      client.emit('presence:activity', {
        roomId,
        activities: this.gameActivity.snapshot(roomId),
      });
    }
  }

  // ================= ХТО ЗАРАЗ ДИВИТЬСЯ КІМНАТУ =================

  private getActiveRoomViewerIds(roomId: string): string[] {
    return roomViews.viewerIds(CHAT_VIEW_KEY(roomId));
  }

  /**
   * Читання кімнати → тихий пуш на інші пристрої (прибрати сповіщення, оновити бейдж). Не частіше за
   * READ_SYNC_THROTTLE_MS на кімнату, але БЕЗ втрат: якщо подія потрапила у вікно, одна відкладена
   * відправка піде в його кінці — інакше після швидкого «прочитано» на шторці лишались би застарілі сповіщення.
   */
  private scheduleReadSync(userId: string, roomId: string, send: () => void) {
    const key = `${userId}:${roomId}`;
    const now = Date.now();
    const last = this.lastReadSyncAt.get(key) ?? 0;
    const wait = ChatGateway.READ_SYNC_THROTTLE_MS - (now - last);

    if (wait <= 0) {
      this.lastReadSyncAt.set(key, now);
      send();
    } else if (!this.pendingReadSync.has(key)) {
      const timer = setTimeout(() => {
        this.pendingReadSync.delete(key);
        this.lastReadSyncAt.set(key, Date.now());
        send();
      }, wait);
      timer.unref?.();
      this.pendingReadSync.set(key, timer);
    }

    // Мапа не має рости нескінченно: прибираємо записи, що вже й так протухли.
    if (this.lastReadSyncAt.size > 2000) {
      for (const [entryKey, at] of this.lastReadSyncAt) {
        if (now - at >= ChatGateway.READ_SYNC_THROTTLE_MS) {
          this.lastReadSyncAt.delete(entryKey);
        }
      }
    }
  }

  /** Знімає «перегляди» сокета, що відключився (усі) або вийшов із кімнати (одна). */
  private clearActiveRoomViewsForSocket(
    client: SocketWithUser,
    roomId?: string,
  ) {
    const userId = client.data.user?.id;
    if (!userId) {
      return;
    }
    if (!roomId) {
      client.data.viewedRooms?.clear();
      roomViews.clearSocket(client.id);
      return;
    }
    client.data.viewedRooms?.delete(roomId);
    roomViews.setViewing(client.id, userId, CHAT_VIEW_KEY(roomId), false);
  }

  /** Клієнт повідомляє, що кімната з'явилась/зникла з екрана (фокус, згортання, вихід). */
  @SubscribeMessage('roomViewState')
  async handleRoomViewState(
    @MessageBody() body: { roomId?: string; active?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const hasAccess = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!hasAccess) return;

    const viewed = (client.data.viewedRooms ??= new Set<string>());
    const shouldBeActive = Boolean(body?.active);

    if (shouldBeActive) {
      if (viewed.has(roomId)) {
        return;
      }
      viewed.add(roomId);
      roomViews.setViewing(client.id, user.id, CHAT_VIEW_KEY(roomId), true);
      return;
    }

    if (!viewed.has(roomId)) {
      return;
    }
    viewed.delete(roomId);
    roomViews.setViewing(client.id, user.id, CHAT_VIEW_KEY(roomId), false);
  }

  // ================= ІГРОВІ СЕСІЇ (сервер — джерело правди) =================

  private gameSessionKey(roomId: string, kind: GameKind) {
    return `${roomId}:${kind}`;
  }

  private getOrCreateGameSession(roomId: string, kind: GameKind) {
    const key = this.gameSessionKey(roomId, kind);
    const existing = this.gameSessions.get(key);
    if (existing) {
      return existing;
    }

    const created: RoomGameSession = {
      kind,
      roomId,
      round: 1,
      startedAt: Date.now(),
      scores: new Map<string, number>(),
    };
    this.gameSessions.set(key, created);
    return created;
  }

  private serializeGameSession(session: RoomGameSession) {
    return {
      roomId: session.roomId,
      game: session.kind,
      round: session.round,
      startedAt: session.startedAt,
      scores: Object.fromEntries(session.scores),
    };
  }

  private broadcastGameSession(session: RoomGameSession) {
    this.server
      .to(session.roomId)
      .emit('gameSession', this.serializeGameSession(session));
  }

  /**
   * Рахунок приходить від клієнта, але зберігає його лише сервер.
   * Повертає сесію, тільки якщо значення справді змінилося — щоб не розсилати снапшот на кожен тік.
   */
  private recordGameScore(
    roomId: string,
    kind: GameKind,
    userId: string,
    rawScore: number,
  ): RoomGameSession | null {
    if (!Number.isFinite(rawScore)) {
      return null;
    }

    const score = Math.max(0, Math.min(999999, Math.floor(rawScore)));
    const session = this.getOrCreateGameSession(roomId, kind);
    if (session.scores.get(userId) === score) {
      return null;
    }

    session.scores.set(userId, score);
    return session;
  }

  private resetGameSession(roomId: string, kind: GameKind) {
    const session = this.getOrCreateGameSession(roomId, kind);
    session.round += 1;
    session.startedAt = Date.now();
    session.scores.clear();
    return session;
  }

  private clearGameSessionsForRoom(roomId: string) {
    for (const kind of ['doodle', 'snake'] as const) {
      this.gameSessions.delete(this.gameSessionKey(roomId, kind));
    }
  }

  /** Клієнт просить актуальний стан партії: при відкритті гри, реконекті або пізньому вході. */
  @SubscribeMessage('gameSync')
  async handleGameSync(
    @MessageBody() body: { roomId?: string; game?: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const kind: GameKind = body?.game === 'snake' ? 'snake' : 'doodle';
    if (!roomId) return;

    const hasAccess = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!hasAccess) return;

    const session = this.getOrCreateGameSession(roomId, kind);
    client.emit('gameSession', this.serializeGameSession(session));
  }

  /** Замер круговой задержки для игр: клиент считает время до ack. */
  @SubscribeMessage('latency-ping')
  handleLatencyPing() {
    return { ok: true };
  }

  @SubscribeMessage('doodle-score')
  async handleDoodleScore(
    @MessageBody() body: DoodleScorePayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const access = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!access?.title?.startsWith('dm:')) return;

    const rawScore = Number(body?.score);
    if (!Number.isFinite(rawScore)) return;
    const score = Math.max(0, Math.min(999999, Math.floor(rawScore)));

    const session = this.recordGameScore(roomId, 'doodle', user.id, score);
    this.server.to(roomId).emit('doodle-score-updated', {
      roomId,
      userId: user.id,
      score,
    });
    if (session) {
      this.broadcastGameSession(session);
    }
  }

  @SubscribeMessage('doodle-reset')
  async handleDoodleReset(
    @MessageBody() body: DoodleResetPayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const access = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!access?.title?.startsWith('dm:')) return;

    const session = this.resetGameSession(roomId, 'doodle');
    this.server.to(roomId).emit('doodle-reset', {
      roomId,
    });
    this.broadcastGameSession(session);
  }

  @SubscribeMessage('doodle-state')
  async handleDoodleState(
    @MessageBody() body: DoodleStatePayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const access = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!access?.title?.startsWith('dm:')) return;

    const state = body?.state;
    if (!state) return;

    const x = Number(state.x);
    const y = Number(state.y);
    const cameraY = Number(state.cameraY);
    const score = Number(state.score);
    const emittedAt = Number(state.emittedAt);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(cameraY) ||
      !Number.isFinite(score)
    ) {
      return;
    }

    const scoreSession = this.recordGameScore(roomId, 'doodle', user.id, score);

    this.server.to(roomId).emit('doodle-state-updated', {
      roomId,
      userId: user.id,
      state: {
        x,
        y,
        cameraY,
        score: Math.max(0, Math.min(999999, Math.floor(score))),
        alive: Boolean(state.alive),
        emittedAt: Number.isFinite(emittedAt)
          ? Math.floor(emittedAt)
          : Date.now(),
      },
    });

    if (scoreSession) {
      this.broadcastGameSession(scoreSession);
    }
  }

  @SubscribeMessage('snake-score')
  async handleSnakeScore(
    @MessageBody() body: SnakeScorePayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const access = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!access?.title?.startsWith('dm:')) return;

    const rawScore = Number(body?.score);
    if (!Number.isFinite(rawScore)) return;
    const score = Math.max(0, Math.min(999999, Math.floor(rawScore)));

    const session = this.recordGameScore(roomId, 'snake', user.id, score);
    this.server.to(roomId).emit('snake-score-updated', {
      roomId,
      userId: user.id,
      score,
    });
    if (session) {
      this.broadcastGameSession(session);
    }
  }

  @SubscribeMessage('snake-reset')
  async handleSnakeReset(
    @MessageBody() body: SnakeResetPayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const access = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!access?.title?.startsWith('dm:')) return;

    const session = this.resetGameSession(roomId, 'snake');
    this.server.to(roomId).emit('snake-reset', {
      roomId,
    });
    this.broadcastGameSession(session);
  }

  /** Учасники приватного чату dm:a:b — лише вони можуть грати в дуель / «Вгадай персонажа»; null для інших кімнат. */
  private async snakeDuelContext(
    client: SocketWithUser,
    rawRoomId: unknown,
  ): Promise<{
    userId: string;
    roomId: string;
    players: [string, string];
  } | null> {
    const user = await this.resolveSocketUser(client);
    if (!user) return null;
    const roomId = typeof rawRoomId === 'string' ? rawRoomId.trim() : '';
    if (!roomId) return null;
    const access = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!access) return null;
    const parts = access.title?.split(':') ?? [];
    if (parts.length !== 3 || parts[0] !== 'dm') return null;
    return { userId: user.id, roomId, players: [parts[1], parts[2]] };
  }

  /** Відкрили гру / реконект: позначаємо присутність і віддаємо актуальний стан сесії. */
  @SubscribeMessage('snake-session-sync')
  async handleSnakeSessionSync(
    @MessageBody() body: { roomId?: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    await client.join(ctx.roomId);
    this.snakeDuel.setPresence(ctx.roomId, ctx.players, ctx.userId, true);
    client.emit(
      'snake-session',
      this.snakeDuel.snapshot(ctx.roomId, ctx.players),
    );
  }

  @SubscribeMessage('snake-presence')
  async handleSnakePresence(
    @MessageBody() body: { roomId?: string; present?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.snakeDuel.setPresence(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      Boolean(body?.present),
    );
  }

  @SubscribeMessage('snake-level-select')
  async handleSnakeLevelSelect(
    @MessageBody() body: { roomId?: string; level?: number },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.snakeDuel.selectLevel(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      Number(body?.level),
    );
  }

  @SubscribeMessage('snake-ready')
  async handleSnakeReady(
    @MessageBody() body: { roomId?: string; ready?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.snakeDuel.setReady(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.ready !== false,
    );
  }

  /** Лише напрямок: рух, зіткнення й їжу вирішує сервер. */
  @SubscribeMessage('snake-input')
  async handleSnakeInput(
    @MessageBody() body: { roomId?: string; dir?: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const userId = client.data.user?.id;
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!userId || !roomId) return;
    // Нажатия идут часто: если сессия уже известна, обходимся без запросов к БД.
    const players =
      this.snakeDuel.playersIfParticipant(roomId, userId) ??
      (await this.snakeDuelContext(client, roomId))?.players;
    if (!players) return;
    this.snakeDuel.input(roomId, players, userId, body?.dir);
  }

  // ───────────── «Вгадай персонажа» ─────────────

  /** Відкрили гру / реконект: присутність, актуальний стан (лише цьому гравцеві) і каталог персонажів. */
  @SubscribeMessage('guess-session-sync')
  async handleGuessSessionSync(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    await client.join(ctx.roomId);
    client.emit('guess-catalog', guessCatalog());
    this.guessCharacter.sync(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
    );
  }

  @SubscribeMessage('guess-presence')
  async handleGuessPresence(
    @MessageBody() body: { roomId?: string; solo?: boolean; present?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.setPresence(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      Boolean(body?.present),
    );
  }

  @SubscribeMessage('guess-level')
  async handleGuessLevel(
    @MessageBody() body: { roomId?: string; solo?: boolean; level?: number },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.selectLevel(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.level,
    );
  }

  @SubscribeMessage('guess-ready')
  async handleGuessReady(
    @MessageBody() body: { roomId?: string; solo?: boolean; ready?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.setReady(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.ready !== false,
    );
  }

  @SubscribeMessage('guess-pick')
  async handleGuessPick(
    @MessageBody()
    body: { roomId?: string; solo?: boolean; character?: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.pick(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.character,
    );
  }

  @SubscribeMessage('guess-ask')
  async handleGuessAsk(
    @MessageBody() body: { roomId?: string; solo?: boolean; trait?: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.ask(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.trait,
    );
  }

  @SubscribeMessage('guess-guess')
  async handleGuessGuess(
    @MessageBody()
    body: { roomId?: string; solo?: boolean; character?: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.guess(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.character,
    );
  }

  @SubscribeMessage('guess-next')
  async handleGuessNext(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.next(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
    );
  }

  @SubscribeMessage('guess-abort')
  async handleGuessAbort(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.snakeDuelContext(client, body?.roomId);
    if (!ctx) return;
    this.guessCharacter.abort(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
    );
  }

  // ───────────── «Пазли» ─────────────

  /** Контекст гри для сокета: перевіряється в БД один раз (при `puzzle-session-sync`), далі береться з пам'яті сокета. */
  private async puzzleContext(client: SocketWithUser, rawRoomId: unknown) {
    const roomId = typeof rawRoomId === 'string' ? rawRoomId.trim() : '';
    const cached = client.data.puzzleCtx;
    if (cached && cached.roomId === roomId) return cached;
    const ctx = await this.snakeDuelContext(client, roomId);
    if (ctx) client.data.puzzleCtx = ctx;
    return ctx;
  }

  /** Відкрили гру / реконект: присутність, актуальний стан і каталог картин. */
  @SubscribeMessage('puzzle-session-sync')
  async handlePuzzleSessionSync(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    client.data.puzzleCtx = undefined;
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    await client.join(ctx.roomId);
    client.emit('puzzle-catalog', puzzleCatalog());
    this.puzzle.sync(ctx.roomId, ctx.players, ctx.userId, body?.solo === true);
  }

  @SubscribeMessage('puzzle-presence')
  async handlePuzzlePresence(
    @MessageBody() body: { roomId?: string; solo?: boolean; present?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.setPresence(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      Boolean(body?.present),
    );
  }

  @SubscribeMessage('puzzle-select')
  async handlePuzzleSelect(
    @MessageBody()
    body: { roomId?: string; solo?: boolean; mode?: unknown; character?: unknown },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.select(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.mode,
      body?.character,
    );
  }

  @SubscribeMessage('puzzle-count')
  async handlePuzzleCount(
    @MessageBody() body: { roomId?: string; solo?: boolean; count?: unknown },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.setCount(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.count,
    );
  }

  @SubscribeMessage('puzzle-start')
  async handlePuzzleStart(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.start(ctx.roomId, ctx.players, ctx.userId, body?.solo === true);
  }

  @SubscribeMessage('puzzle-again')
  async handlePuzzleAgain(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.again(ctx.roomId, ctx.players, ctx.userId, body?.solo === true);
  }

  @SubscribeMessage('puzzle-lobby')
  async handlePuzzleLobby(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.toLobby(ctx.roomId, ctx.players, ctx.userId, body?.solo === true);
  }

  @SubscribeMessage('puzzle-grab')
  async handlePuzzleGrab(
    @MessageBody() body: { roomId?: string; solo?: boolean; group?: unknown },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.grab(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.group,
    );
  }

  @SubscribeMessage('puzzle-move')
  async handlePuzzleMove(
    @MessageBody()
    body: { roomId?: string; solo?: boolean; group?: unknown; x?: unknown; y?: unknown },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.move(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.group,
      body?.x,
      body?.y,
    );
  }

  @SubscribeMessage('puzzle-drop')
  async handlePuzzleDrop(
    @MessageBody()
    body: { roomId?: string; solo?: boolean; group?: unknown; x?: unknown; y?: unknown },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.drop(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.group,
      body?.x,
      body?.y,
    );
  }

  @SubscribeMessage('puzzle-cursor')
  async handlePuzzleCursor(
    @MessageBody()
    body: { roomId?: string; solo?: boolean; x?: unknown; y?: unknown },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.cursor(
      ctx.roomId,
      ctx.players,
      ctx.userId,
      body?.solo === true,
      body?.x,
      body?.y,
    );
  }

  @SubscribeMessage('puzzle-gather')
  async handlePuzzleGather(
    @MessageBody() body: { roomId?: string; solo?: boolean },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const ctx = await this.puzzleContext(client, body?.roomId);
    if (!ctx) return;
    this.puzzle.gather(ctx.roomId, ctx.players, ctx.userId, body?.solo === true);
  }

  @SubscribeMessage('snake-state')
  async handleSnakeState(
    @MessageBody() body: SnakeStatePayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const access = await this.roomAccess.resolve(this.prisma, user.id, roomId);
    if (!access?.title?.startsWith('dm:')) return;

    const state = body?.state;
    if (!state) return;

    const headX = Number(state.headX);
    const headY = Number(state.headY);
    const foodX = Number(state.foodX);
    const foodY = Number(state.foodY);
    const score = Number(state.score);
    const emittedAt = Number(state.emittedAt);
    if (
      !Number.isFinite(headX) ||
      !Number.isFinite(headY) ||
      !Number.isFinite(foodX) ||
      !Number.isFinite(foodY) ||
      !Number.isFinite(score)
    ) {
      return;
    }

    const bodyPoints = Array.isArray(state.body)
      ? state.body
          .map((point) => ({
            x: Number(point?.x),
            y: Number(point?.y),
          }))
          .filter(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          )
          .slice(0, 180)
      : [];

    const scoreSession = this.recordGameScore(roomId, 'snake', user.id, score);

    this.server.to(roomId).emit('snake-state-updated', {
      roomId,
      userId: user.id,
      state: {
        headX,
        headY,
        foodX,
        foodY,
        score: Math.max(0, Math.min(999999, Math.floor(score))),
        alive: Boolean(state.alive),
        emittedAt: Number.isFinite(emittedAt)
          ? Math.floor(emittedAt)
          : Date.now(),
        body: bodyPoints,
      },
    });

    if (scoreSession) {
      this.broadcastGameSession(scoreSession);
    }
  }

  // ================= ВИХІД ІЗ КІМНАТИ =================
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = client.data.user;

    this.clearActiveRoomViewsForSocket(client, roomId);

    // 🔹 Видаляємо сокет із кімнати
    await client.leave(roomId);

    if (user) {
      client.to(roomId).emit('userLeftRoom', {
        roomId,
        userId: user.id,
        username: user.nickname || user.username,
      });
    }

    // Кімната спорожніла — партію більше нема кому продовжувати.
    if (!this.server.sockets.adapter.rooms.get(roomId)?.size) {
      this.clearGameSessionsForRoom(roomId);
    }
  }

  /** Видалити себе з кімнати (приватні чати та інші, окрім загального і «Поділися з Ісусом»). */
  @SubscribeMessage('removeSelfFromRoom')
  async handleRemoveSelfFromRoom(
    @MessageBody() body: { roomId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Не авторизован',
      });
      return;
    }

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'roomId обязателен',
      });
      return;
    }

    if (roomId === this.GLOBAL_ROOM) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Общий чат нельзя удалить',
      });
      return;
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, title: true },
    });

    if (!room) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Комната не найдена',
      });
      return;
    }

    if (room.title.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Этот чат нельзя удалить из списка',
      });
      return;
    }

    const member = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: user.id,
        },
      },
    });

    if (!member) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Нет доступа к чату',
      });
      return;
    }

    await this.prisma.roomMember.delete({
      where: {
        roomId_userId: {
          roomId,
          userId: user.id,
        },
      },
    });
    this.roomAccess.invalidate(user.id, roomId);

    await this.prisma.roomReadState.deleteMany({
      where: { roomId, userId: user.id },
    });

    await client.leave(roomId);

    client.emit('removeSelfFromRoomResult', {
      ok: true,
      roomId,
    });

    await this.emitMyRooms(client, user.id);
  }

  // ================= СТВОРЕННЯ ПРИВАТНОЇ КІМНАТИ =================
  @SubscribeMessage('createPrivateRoom')
  async handleCreatePrivateRoom(
    @MessageBody() body: { title: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const title = body?.title?.trim();
    if (!title) {
      client.emit('error', 'Название комнаты обязательно');
      return;
    }

    const existingRoom = await this.prisma.room.findUnique({
      where: { title },
      select: { id: true, title: true },
    });

    if (existingRoom) {
      client.emit('roomExists', {
        roomId: existingRoom.id,
        title: existingRoom.title,
      });
      return;
    }

    const room = await this.prisma.room.create({
      data: {
        title,
        members: {
          create: {
            userId: user.id,
          },
        },
      },
    });

    await client.join(room.id);

    client.emit('roomCreated', {
      roomId: room.id,
      title: room.title,
    });

    await this.emitMyRooms(client, user.id);
  }

  // ================= ВІДКРИТТЯ DIRECT-КІМНАТИ =================
  @SubscribeMessage('openDirectRoom')
  async handleOpenDirectRoom(
    @MessageBody() body: { targetUserId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const targetUserId = body?.targetUserId;
    if (!targetUserId) {
      client.emit('error', 'targetUserId обязателен');
      return;
    }

    if (targetUserId === user.id) {
      client.emit('error', 'Нельзя создать чат с собой');
      return;
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, nickname: true },
    });

    if (!targetUser) {
      client.emit('error', 'Пользователь не найден');
      return;
    }

    const [idA, idB] = [user.id, targetUser.id].sort();
    const title = `dm:${idA}:${idB}`;

    let room = await this.prisma.room.findUnique({
      where: { title },
      select: { id: true, title: true },
    });

    if (!room) {
      room = await this.prisma.room.create({
        data: {
          title,
          members: {
            create: [{ userId: user.id }, { userId: targetUser.id }],
          },
        },
        select: { id: true, title: true },
      });
    } else {
      await this.prisma.roomMember.upsert({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: user.id,
          },
        },
        update: {},
        create: {
          roomId: room.id,
          userId: user.id,
        },
      });

      await this.prisma.roomMember.upsert({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: targetUser.id,
          },
        },
        update: {},
        create: {
          roomId: room.id,
          userId: targetUser.id,
        },
      });
    }

    await client.join(room.id);

    client.emit('directRoomOpened', {
      roomId: room.id,
      title: room.title,
      targetUserId: targetUser.id,
      targetUsername: targetUser.nickname || targetUser.username,
    });

    await this.emitMyRooms(client, user.id);

    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (socket.data?.user?.id === targetUser.id) {
        const rooms = await this.getMyRoomsForUser(targetUser.id);
        socket.emit('myRooms', { rooms });
      }
    }
  }

  @SubscribeMessage('call-user')
  async handleCallUser(
    @MessageBody() body: CallUserPayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const caller = await this.resolveSocketUser(client);
    if (!caller) {
      client.emit('call-error', { error: 'Не авторизован' });
      return;
    }

    const targetUserId =
      typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : '';
    const channelName =
      typeof body?.channelName === 'string' ? body.channelName.trim() : '';

    if (!targetUserId || !channelName) {
      client.emit('call-error', {
        error: 'targetUserId и channelName обязательны',
      });
      return;
    }

    if (targetUserId === caller.id) {
      client.emit('call-error', { error: 'Нельзя позвонить самому себе' });
      return;
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!targetUser) {
      client.emit('call-error', { error: 'Пользователь не найден' });
      return;
    }

    const callerProfile = await this.prisma.user.findUnique({
      where: { id: caller.id },
      select: {
        username: true,
        nickname: true,
        avatarUrl: true,
      },
    });

    const targetSockets = await this.getSocketsByUserId(targetUserId);
    if (!targetSockets.length) {
      const initiatorName =
        callerProfile?.nickname?.trim() ||
        callerProfile?.username?.trim() ||
        caller.nickname ||
        caller.username;

      void this.pushService.sendCallPush({
        callerId: caller.id,
        callerName: initiatorName,
        targetUserId,
        targetUrl: `/chat/${caller.id}`,
      });

      client.emit('call-user-sent', {
        ok: true,
        offline: true,
        targetUserId,
        channelName,
      });
      return;
    }

    const initiatorName =
      callerProfile?.nickname?.trim() ||
      callerProfile?.username?.trim() ||
      caller.nickname ||
      caller.username;

    const incomingCallPayload = {
      channelName,
      initiator: {
        id: caller.id,
        username: callerProfile?.username || caller.username,
        nickname: callerProfile?.nickname || caller.nickname || null,
        name: initiatorName,
        avatarUrl: callerProfile?.avatarUrl || null,
      },
    };

    for (const targetSocket of targetSockets) {
      targetSocket.emit('incoming-call', incomingCallPayload);
    }

    client.emit('call-user-sent', {
      ok: true,
      targetUserId,
      channelName,
    });
  }

  @SubscribeMessage('call-response')
  async handleCallResponse(
    @MessageBody() body: CallResponsePayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const receiver = await this.resolveSocketUser(client);
    if (!receiver) {
      client.emit('call-error', { error: 'Не авторизован' });
      return;
    }

    const initiatorId =
      typeof body?.initiatorId === 'string' ? body.initiatorId.trim() : '';
    const channelName =
      typeof body?.channelName === 'string' ? body.channelName.trim() : '';
    if (!initiatorId || !channelName) {
      client.emit('call-error', {
        error: 'initiatorId и channelName обязательны',
      });
      return;
    }

    const accepted = body?.accepted === true;
    const initiatorSockets = await this.getSocketsByUserId(initiatorId);
    if (!initiatorSockets.length) {
      return;
    }

    const payload = {
      channelName,
      responder: {
        id: receiver.id,
        username: receiver.username,
        nickname: receiver.nickname ?? null,
      },
    };

    for (const socket of initiatorSockets) {
      socket.emit(accepted ? 'call-accepted' : 'call-declined', payload);
    }
  }

  // ================= ЗАПРОШЕННЯ КОРИСТУВАЧА ДО КІМНАТИ =================
  @SubscribeMessage('inviteUserToRoom')
  async handleInviteUserToRoom(
    @MessageBody() body: { roomId: string; userId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const inviter = await this.resolveSocketUser(client);
    if (!inviter) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const roomId = body?.roomId;
    const invitedUserId = body?.userId;

    if (!roomId || !invitedUserId) {
      client.emit('error', 'roomId и userId обязательны');
      return;
    }

    if (roomId === this.GLOBAL_ROOM) {
      client.emit('error', 'В глобальный чат приглашение не требуется');
      return;
    }

    const roomMeta = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { title: true },
    });

    if (!roomMeta) {
      client.emit('error', 'Комната не найдена');
      return;
    }

    if (roomMeta.title.startsWith('dm:')) {
      client.emit(
        'error',
        'В личный чат нельзя приглашать других пользователей',
      );
      return;
    }

    if (roomMeta.title.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
      client.emit('error', 'В этот чат нельзя приглашать других пользователей');
      return;
    }

    const inviterHasAccess = await canUserPostToRoom(
      this.prisma,
      inviter.id,
      roomId,
    );
    if (!inviterHasAccess) {
      client.emit('error', 'Нет доступа к комнате');
      return;
    }

    const invitedUser = await this.prisma.user.findUnique({
      where: { id: invitedUserId },
      select: { id: true, username: true, nickname: true },
    });

    if (!invitedUser) {
      client.emit('error', 'Пользователь не найден');
      return;
    }

    const existingMember = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: invitedUser.id,
        },
      },
    });

    if (existingMember) {
      client.emit('roomMemberExists', {
        roomId,
        userId: invitedUser.id,
      });
      return;
    }

    await this.prisma.roomMember.create({
      data: {
        roomId,
        userId: invitedUser.id,
      },
    });

    this.server.to(roomId).emit('userInvitedToRoom', {
      roomId,
      invitedUserId: invitedUser.id,
      invitedUsername: invitedUser.nickname || invitedUser.username,
      invitedByUserId: inviter.id,
      invitedByUsername: inviter.nickname || inviter.username,
    });

    client.emit('roomUserInvited', {
      roomId,
      userId: invitedUser.id,
      username: invitedUser.nickname || invitedUser.username,
    });

    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (socket.data?.user?.id === invitedUser.id) {
        socket.emit('userInvitedToRoom', {
          roomId,
          invitedUserId: invitedUser.id,
        });
      }
    }
  }

  // ================= МОЇ КІМНАТИ =================
  @SubscribeMessage('getMyRooms')
  async handleGetMyRooms(@ConnectedSocket() client: SocketWithUser) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    await this.emitMyRooms(client, user.id);
  }

  // ================= НАДСИЛАННЯ ПОВІДОМЛЕННЯ =================
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody()
    body: {
      roomId: string;
      content?: string;
      type?: string;
      fileUrl?: string;
      replyToId?: string;
      /** Клієнтський id відправки: повтор з тим самим id не створює дубль, ехо повертає його назад. */
      clientMessageId?: string;
    },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    if (this.isUserTemporarilyBlocked(user.id)) {
      const blockedUntil = this.tempBlockedUsers.get(user.id) ?? Date.now();
      client.emit('securityBlocked', {
        until: new Date(blockedUntil).toISOString(),
        reason: 'temporary-block',
        message:
          'Отправка сообщений временно ограничена системой безопасности.',
      });
      client.emit(
        'error',
        'Отправка сообщений временно ограничена системой безопасности.',
      );
      client.disconnect(true);
      return;
    }

    const { roomId } = body;

    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    const normalizedType = String(body?.type || '')
      .trim()
      .toLowerCase();
    const isVideoNote = normalizedType === 'video_note';

    const normalizedContent = String(body?.content || '').trim();
    const normalizedFileUrl = String(body?.fileUrl || '').trim();

    if (!isVideoNote && !normalizedContent) {
      return;
    }

    if (isVideoNote && !normalizedFileUrl) {
      client.emit('error', 'fileUrl обязателен для video_note');
      return;
    }

    if (!isVideoNote && this.isAttackPayload(normalizedContent)) {
      console.warn('[WS] suspicious message blocked', {
        roomId,
        userId: user.id,
        username: user.username,
      });
      await this.handleSuspiciousMessage(client, user, roomId);
      return;
    }

    try {
      // Усе, що потрібно ДО збереження, читаємо паралельно: до `emit` лишається один RTT до БД + insert.
      const clientMessageId = this.normalizeClientMessageId(body?.clientMessageId);
      const [hasAccess, existing, replyTarget] = await Promise.all([
        canUserPostToRoom(this.prisma, user.id, roomId),
        // Ідемпотентність: повтор з уже збереженим clientMessageId лише повертає ехо відправнику (решта вже отримала).
        clientMessageId
          ? this.messagesService.findByClientMessageId(user.id, clientMessageId)
          : null,
        // Некоректний replyToId (чужа кімната, видалене) тихо ігноруємо — це звичайне повідомлення.
        this.messagesService.resolveReplyTarget(roomId, body?.replyToId),
      ]);
      if (!hasAccess) {
        client.emit('error', 'Нет доступа');
        return;
      }

      if (existing) {
        if (existing.roomId === roomId) {
          client.emit(
            'newMessage',
            this.buildNewMessagePayload(roomId, existing),
          );
        }
        return;
      }

      let message;
      try {
        message = isVideoNote
          ? await this.messagesService.createRoomMessage({
              type: 'VIDEO_NOTE',
              fileUrl: normalizedFileUrl,
              senderId: user.id,
              sender: { username: user.username, nickname: user.nickname },
              roomId,
              replyToId: replyTarget?.id,
              clientMessageId,
            })
          : await this.messagesService.createRoomMessage({
              type: 'TEXT',
              content: normalizedContent,
              senderId: user.id,
              sender: { username: user.username, nickname: user.nickname },
              roomId,
              replyToId: replyTarget?.id,
              clientMessageId,
            });
      } catch (createError) {
        // Гонка двох однакових відправок: унікальний індекс відхилив другу — віддаємо ехо першої.
        const code = (createError as { code?: string } | null)?.code;
        const raced =
          code === 'P2002' && clientMessageId
            ? await this.messagesService.findByClientMessageId(
                user.id,
                clientMessageId,
              )
            : null;
        if (!raced) throw createError;
        if (raced.roomId === roomId) {
          client.emit('newMessage', this.buildNewMessagePayload(roomId, raced));
        }
        return;
      }

      await this.broadcastNewChatMessage(roomId, message, {
        repliedToUserId: replyTarget?.senderId,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] sendMessage failed:', {
        roomId,
        userId: user.id,
        reason,
      });
      client.emit('error', 'Ошибка сохранения сообщения');
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @MessageBody() body: { messageId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('deleteMessageResult', {
        ok: false,
        messageId: '',
        error: 'Не авторизован',
      });
      return;
    }

    const messageId = body?.messageId?.trim();
    if (!messageId) {
      client.emit('deleteMessageResult', {
        ok: false,
        messageId: '',
        error: 'messageId обязателен',
      });
      return;
    }

    try {
      const canModerateMessages = isAdminDashboardUsername(user.username);
      const result = await this.messagesService.deleteMessageForUser(
        messageId,
        user.id,
        {
          allowDeleteOthers: canModerateMessages,
        },
      );

      if (!result.ok) {
        const errorMessage =
          result.reason === 'not-found'
            ? 'Сообщение не найдено'
            : result.reason === 'not-owner'
              ? 'Можно удалять только свои сообщения'
              : result.reason === 'no-access'
                ? 'Нет доступа к этому чату'
                : 'Не удалось удалить сообщение';

        client.emit('deleteMessageResult', {
          ok: false,
          messageId,
          error: errorMessage,
        });
        return;
      }

      this.server.to(result.roomId).emit('messageDeleted', {
        messageId: result.messageId,
        roomId: result.roomId,
      });

      client.emit('deleteMessageResult', {
        ok: true,
        messageId: result.messageId,
        roomId: result.roomId,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] deleteMessage failed:', {
        messageId,
        userId: user.id,
        reason,
      });

      client.emit('deleteMessageResult', {
        ok: false,
        messageId,
        error: 'Ошибка удаления сообщения',
      });
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @MessageBody() body: EditMessagePayload,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('editMessageResult', {
        ok: false,
        messageId: '',
        error: 'Не авторизован',
      });
      return;
    }

    const messageId =
      typeof body?.messageId === 'string' ? body.messageId.trim() : '';
    const content =
      typeof body?.content === 'string' ? body.content.trim() : '';
    if (!messageId) {
      client.emit('editMessageResult', {
        ok: false,
        messageId: '',
        error: 'messageId обязателен',
      });
      return;
    }
    if (!content) {
      client.emit('editMessageResult', {
        ok: false,
        messageId,
        error: 'Текст сообщения не может быть пустым',
      });
      return;
    }

    try {
      const result = await this.messagesService.editOwnMessage(
        messageId,
        user.id,
        content,
      );
      if (!result.ok) {
        const errorMessage =
          result.reason === 'not-found'
            ? 'Сообщение не найдено'
            : result.reason === 'not-owner'
              ? 'Можно редактировать только свои сообщения'
              : result.reason === 'no-access'
                ? 'Нет доступа к этому чату'
                : 'Неверные данные для редактирования';

        client.emit('editMessageResult', {
          ok: false,
          messageId,
          error: errorMessage,
        });
        return;
      }

      this.server.to(result.roomId).emit('messageEdited', {
        messageId: result.messageId,
        roomId: result.roomId,
        content: result.content,
        isEdited: true,
      });

      client.emit('editMessageResult', {
        ok: true,
        messageId: result.messageId,
        roomId: result.roomId,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] editMessage failed:', {
        messageId,
        userId: user.id,
        reason,
      });

      client.emit('editMessageResult', {
        ok: false,
        messageId,
        error: 'Ошибка редактирования сообщения',
      });
    }
  }

  @SubscribeMessage('toggle-reaction')
  async handleReaction(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: ReactionEventBody,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const messageId =
      typeof data?.messageId === 'string' ? data.messageId.trim() : '';
    const chatId = typeof data?.chatId === 'string' ? data.chatId.trim() : '';
    const type = typeof data?.type === 'string' ? data.type.trim() : '';

    if (!messageId || !chatId || !type) {
      client.emit('error', 'messageId, chatId и type обязательны');
      return;
    }

    if (!ChatGateway.ALLOWED_REACTIONS.has(type)) {
      client.emit('error', 'Неподдерживаемая реакция');
      client.emit('reactionError', { messageId, reason: 'unsupported' });
      return;
    }

    const hasAccess = await canUserPostToRoom(this.prisma, user.id, chatId);
    if (!hasAccess) {
      client.emit('error', 'Нет доступа');
      client.emit('reactionError', { messageId, reason: 'forbidden' });
      return;
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, roomId: true },
    });

    if (!message || message.roomId !== chatId) {
      client.emit('error', 'Сообщение не найдено');
      client.emit('reactionError', { messageId, reason: 'not-found' });
      return;
    }

    const existing = await this.prisma.reaction.findFirst({
      where: { userId: user.id, messageId, type },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.reaction.create({
        data: { userId: user.id, messageId, type },
      });
    }

    const updatedReactions = await this.prisma.reaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        type: true,
        createdAt: true,
      },
    });

    this.server.to(chatId).emit('update-message-reactions', {
      messageId,
      reactions: updatedReactions,
    });
  }

  /** Знімок реалтайму для адмін-панелі: сокети, онлайн-користувачі, активні кімнати. */
  getRealtimeStats() {
    return {
      connectedSockets: this.server?.engine?.clientsCount ?? 0,
      onlineUsers: presence.onlineUserIds().length,
      activeRooms: this.server?.sockets?.adapter?.rooms?.size ?? 0,
    };
  }

  /** Повідомляє кімнату, що голосове прослухали (для індикатора в відправника). */
  emitVoiceListened(roomId: string, messageId: string, userId: string) {
    this.server.to(roomId).emit('voiceListened', { roomId, messageId, userId });
  }

  /**
   * Після збереження повідомлення в БД: read receipt, сокет і push (як при sendMessage).
   */
  async broadcastNewChatMessage(
    roomId: string,
    message: NewChatMessageInput,
    options: { repliedToUserId?: string } = {},
  ) {
    // Read receipt відправника пишемо паралельно з розсилкою, а не перед нею: `emit` не чекає запису в БД.
    const readReceipt = this.messagesService
      .markRoomAsRead(roomId, message.senderId, message.createdAt)
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.error('[WS] markRoomAsRead failed:', {
          roomId,
          userId: message.senderId,
          reason,
        });
      });

    this.server
      .to(roomId)
      .emit('newMessage', this.buildNewMessagePayload(roomId, message));

    void this.pushService
      .sendChatMessagePush({
        messageId: message.id,
        roomId,
        senderId: message.senderId,
        senderUsername: message.sender.nickname || message.sender.username,
        content: message.content ?? '',
        messageType: message.type,
        fileUrl: message.fileUrl,
        createdAt: message.createdAt,
        excludeUserIds: this.getActiveRoomViewerIds(roomId),
        repliedToUserId: options.repliedToUserId,
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.error('[Push] sendChatMessagePush failed:', {
          roomId,
          userId: message.senderId,
          reason,
        });
      });

    await readReceipt;
  }

  /** Тіло події `newMessage`; `clientMessageId` повертається відправнику, щоб ехо замінило саме його «бульбашку». */
  private buildNewMessagePayload(roomId: string, message: NewChatMessageInput) {
    return {
      id: message.id,
      content: message.content ?? '',
      type: message.type,
      fileUrl: message.fileUrl ?? undefined,
      voiceDuration: message.voiceDuration ?? undefined,
      mediaWidth: message.mediaWidth ?? undefined,
      mediaHeight: message.mediaHeight ?? undefined,
      fileSize: message.fileSize ?? undefined,
      username: message.sender.nickname || message.sender.username,
      handle: message.sender.username,
      senderId: message.senderId,
      createdAt: message.createdAt,
      roomId,
      reactions: [],
      replyToId: message.replyToId ?? undefined,
      replyTo: message.replyTo ?? undefined,
      clientMessageId: message.clientMessageId ?? undefined,
    };
  }

  private normalizeClientMessageId(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    return value && value.length <= 64 && /^[\w-]+$/.test(value)
      ? value
      : undefined;
  }

  private async emitMyRooms(client: SocketWithUser, userId: string) {
    const rooms = await this.getMyRoomsForUser(userId);
    client.emit('myRooms', { rooms });
  }

  private async getMyRoomsForUser(userId: string) {
    try {
      await this.ensureShareWithJesusRoomForUser(userId);

      const hasValidGlobalRoomId = this.isUuid(this.GLOBAL_ROOM);

      const where = hasValidGlobalRoomId
        ? {
            OR: [{ id: this.GLOBAL_ROOM }, { members: { some: { userId } } }],
          }
        : {
            members: { some: { userId } },
          };

      const rooms = await this.prisma.room.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          members: {
            where: {
              userId: {
                not: userId,
              },
            },
            select: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                  avatarUrl: true,
                  lastSeenAt: true,
                },
              },
            },
            take: 1,
          },
        },
      });

      return rooms
        .filter(
          (room) =>
            room.id === this.GLOBAL_ROOM ||
            userMayAccessRoomByTitle(userId, room.title),
        )
        .map((room) => {
          const directPeer = room.members[0]?.user;
          return {
            id: room.id,
            title: room.title,
            createdAt: room.createdAt,
            ...(directPeer
              ? {
                  directPeer: {
                    id: directPeer.id,
                    username: directPeer.username,
                    nickname: directPeer.nickname,
                    avatarUrl: directPeer.avatarUrl,
                    lastSeenAt: directPeer.lastSeenAt?.toISOString() ?? null,
                  },
                }
              : {}),
          };
        });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] emitMyRooms failed:', reason);
      return [];
    }
  }
}
