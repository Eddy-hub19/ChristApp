import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { WatchMemberStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Server } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import {
  AUTO_SYNC_PROVIDERS,
  applyControlCommand,
  clampPosition,
  initialManualState,
  isValidProviderRef,
  isValidVideoId,
  manualCountdownElapsed,
  manualDropReady,
  manualPause,
  manualResume,
  manualSetReady,
  manualStart,
  pickNextHost,
  projectPosition,
  resetManualState,
  type ControlCommand,
  type ManualSyncState,
  type WatchPlaybackState,
  type WatchProvider,
} from './watch-party.state';
import type { CreateWatchRoomDto } from './dto/watch-room.dto';

/** Скільки чекаємо, поки хост перепідключиться, перш ніж передати керування. */
const HOST_GRACE_MS = 15_000;
/** Heartbeat змінює лише пам'ять; у БД пишемо не частіше за цей інтервал. */
const HEARTBEAT_PERSIST_INTERVAL_MS = 15_000;
/** «Грає» у БД довше за цей час без оновлень — вважаємо, що сервер упав посеред сеансу, і ставимо паузу. */
const STALE_PLAYING_MS = 10 * 60 * 1000;
const CHAT_HISTORY_LIMIT = 60;
const MAX_INVITEES = 50;
const OEMBED_CACHE_MS = 10 * 60 * 1000;
const OEMBED_TIMEOUT_MS = 4_000;

export const WATCH_REACTIONS = [
  '❤️',
  '😂',
  '🔥',
  '🙏',
  '😮',
  '👏',
  '😭',
  '🕊️',
] as const;

export type VideoCheckResult =
  | { ok: true; title: string | null }
  | { ok: false; code: 'NOT_EMBEDDABLE' | 'NOT_FOUND' };

export type WatchStateReason =
  | 'sync'
  | 'play'
  | 'pause'
  | 'seek'
  | 'changeVideo'
  | 'heartbeat'
  | 'host'
  | 'hostAway';

type RoomRuntime = WatchPlaybackState & {
  roomId: string;
  videoTitle: string | null;
  thumbnailUrl: string | null;
  hostId: string;
  /** Монотонний номер стану: клієнт відкидає пакети, старші за вже застосований. */
  version: number;
  lastPersistAt: number;
  hostGraceTimer: ReturnType<typeof setTimeout> | null;
  /** Хост пішов, а передати не було кому — перший, хто зайде, отримає керування. */
  hostAway: boolean;
  /** Лише для IFRAME/MANUAL — див. watch-party.state.ts. Для інших провайдерів завжди idle/порожній. */
  manual: ManualSyncState;
  /** Таймер, що переводить countdown → running рівно в countdownEndsAtMs. */
  manualCountdownTimer: ReturnType<typeof setTimeout> | null;
};

const userPublicSelect = {
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true,
} as const;

export function watchSocketRoom(roomId: string) {
  return `watch:${roomId}`;
}

export function userSocketRoom(userId: string) {
  return `watch-user:${userId}`;
}

@Injectable()
export class WatchPartyService implements OnModuleDestroy {
  private readonly logger = new Logger(WatchPartyService.name);
  private server: Server | null = null;

  private readonly runtimes = new Map<string, RoomRuntime>();
  private readonly runtimeLoads = new Map<
    string,
    Promise<RoomRuntime | null>
  >();
  /** roomId → userId → socketId-и, що зараз тримають залу відкритою. */
  private readonly presence = new Map<string, Map<string, Set<string>>>();
  private readonly oembedCache = new Map<
    string,
    { at: number; result: VideoCheckResult }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  attachServer(server: Server) {
    this.server = server;
  }

  onModuleDestroy() {
    for (const runtime of this.runtimes.values()) {
      if (runtime.hostGraceTimer) clearTimeout(runtime.hostGraceTimer);
      if (runtime.manualCountdownTimer) clearTimeout(runtime.manualCountdownTimer);
    }
  }

  // ================= ВІДЕО =================

  async checkVideo(videoId: string): Promise<VideoCheckResult> {
    if (!isValidVideoId(videoId)) return { ok: false, code: 'NOT_FOUND' };

    const cached = this.oembedCache.get(videoId);
    if (cached && Date.now() - cached.at < OEMBED_CACHE_MS)
      return cached.result;

    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}`;

    let result: VideoCheckResult;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
      });
      if (res.ok) {
        const body = (await res.json()) as { title?: unknown };
        result = {
          ok: true,
          title:
            typeof body.title === 'string' ? body.title.slice(0, 200) : null,
        };
      } else if (res.status === 401 || res.status === 403) {
        // oEmbed відповідає 401, коли власник заборонив вбудовування або відео приватне.
        result = { ok: false, code: 'NOT_EMBEDDABLE' };
      } else if (res.status === 404 || res.status === 400) {
        result = { ok: false, code: 'NOT_FOUND' };
      } else {
        return { ok: true, title: null };
      }
    } catch {
      // YouTube недоступний із сервера — не блокуємо; плеєр сам покаже помилку, якщо що.
      return { ok: true, title: null };
    }

    this.oembedCache.set(videoId, { at: Date.now(), result });
    return result;
  }

  private async requireEmbeddableVideo(videoId: string) {
    if (!isValidVideoId(videoId)) {
      throw new BadRequestException({
        code: 'INVALID_VIDEO',
        message: 'Некоректне посилання на YouTube',
      });
    }
    const check = await this.checkVideo(videoId);
    if (!check.ok) {
      throw new BadRequestException({
        code: check.code,
        message:
          check.code === 'NOT_EMBEDDABLE'
            ? 'Власник відео заборонив його перегляд на інших сайтах'
            : 'Відео не знайдено',
      });
    }
    return check.title;
  }

  /**
   * YOUTUBE — як і раніше, сервер сам перевіряє відео через oEmbed (requireEmbeddableVideo).
   * Інші провайдери — лише формат ref (isValidProviderRef): клієнт уже пройшов
   * GET /watch-rooms/resolve-video (єдине місце, де сервер сам ходить у мережу за довільним
   * URL від клієнта, під SSRF-захистом із url-safety.ts) і передає готові title/thumbnailUrl —
   * повторний мережевий запит тут не робимо.
   */
  private async resolveAndValidate(
    provider: WatchProvider,
    videoId: string,
    clientTitle?: string,
    clientThumbnailUrl?: string,
  ): Promise<{ title: string | null; thumbnailUrl: string | null }> {
    if (provider === 'YOUTUBE') {
      const title = await this.requireEmbeddableVideo(videoId);
      return { title, thumbnailUrl: null };
    }
    if (!isValidProviderRef(provider, videoId)) {
      throw new BadRequestException({
        code: 'INVALID_VIDEO',
        message: 'Некоректне посилання',
      });
    }
    return {
      title: clientTitle?.trim().slice(0, 200) || null,
      thumbnailUrl: clientThumbnailUrl?.trim().slice(0, 1024) || null,
    };
  }

  // ================= СПИСОК / CRUD =================

  async listForUser(userId: string) {
    const rows = await this.prisma.watchRoomMember.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        invitedById: true,
        room: {
          select: {
            id: true,
            title: true,
            videoId: true,
            videoTitle: true,
            isPlaying: true,
            stateUpdatedAt: true,
            createdAt: true,
            host: { select: userPublicSelect },
            _count: {
              select: { members: { where: { status: 'JOINED' } } },
            },
          },
        },
      },
    });

    const inviterIds = [
      ...new Set(
        rows
          .map((row) => row.invitedById)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const inviters = inviterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: inviterIds } },
          select: userPublicSelect,
        })
      : [];
    const invitersById = new Map(inviters.map((u) => [u.id, u]));

    const toCard = (row: (typeof rows)[number]) => {
      const runtime = this.runtimes.get(row.room.id);
      return {
        id: row.room.id,
        title: row.room.title,
        videoId: runtime?.videoId ?? row.room.videoId,
        videoTitle: runtime?.videoTitle ?? row.room.videoTitle,
        isPlaying: runtime
          ? runtime.isPlaying
          : row.room.isPlaying &&
            Date.now() - row.room.stateUpdatedAt.getTime() < STALE_PLAYING_MS,
        host: row.room.host,
        memberCount: row.room._count.members,
        presentCount: this.presentUserIds(row.room.id).size,
        createdAt: row.room.createdAt.toISOString(),
      };
    };

    return {
      rooms: rows.filter((r) => r.status === 'JOINED').map(toCard),
      invitations: rows
        .filter((r) => r.status === 'INVITED')
        .map((row) => ({
          ...toCard(row),
          invitedBy: row.invitedById
            ? (invitersById.get(row.invitedById) ?? null)
            : null,
        })),
    };
  }

  async createRoom(userId: string, dto: CreateWatchRoomDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Вкажіть назву кімнати');

    const provider = dto.provider ?? 'YOUTUBE';
    const { title: videoTitle, thumbnailUrl } = await this.resolveAndValidate(
      provider,
      dto.videoId,
      dto.videoTitle,
      dto.thumbnailUrl,
    );
    const inviteeIds = await this.resolveInvitees(dto.inviteeIds ?? [], userId);

    const room = await this.prisma.watchRoom.create({
      data: {
        title,
        provider,
        videoId: dto.videoId,
        videoTitle,
        thumbnailUrl,
        positionSec: clampPosition(dto.startSec ?? 0),
        hostId: userId,
        inviteToken: this.generateInviteToken(),
        members: {
          create: [
            { userId, status: 'JOINED', joinedAt: new Date() },
            ...inviteeIds.map((id) => ({
              userId: id,
              status: WatchMemberStatus.INVITED,
              invitedById: userId,
            })),
          ],
        },
      },
      select: { id: true, title: true },
    });

    void this.notifyInvited(room.id, room.title, userId, inviteeIds);
    return { id: room.id };
  }

  async inviteUsers(roomId: string, userId: string, rawIds: string[]) {
    const room = await this.requireJoinedMember(roomId, userId);
    const candidateIds = await this.resolveInvitees(rawIds, userId);

    const existing = await this.prisma.watchRoomMember.findMany({
      where: { roomId, userId: { in: candidateIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((m) => m.userId));
    const newIds = candidateIds.filter((id) => !existingIds.has(id));

    if (newIds.length) {
      await this.prisma.watchRoomMember.createMany({
        data: newIds.map((id) => ({
          roomId,
          userId: id,
          status: WatchMemberStatus.INVITED,
          invitedById: userId,
        })),
        skipDuplicates: true,
      });
      void this.notifyInvited(roomId, room.title, userId, newIds);
      void this.broadcastMembers(roomId);
    }

    return { invited: newIds.length };
  }

  async acceptInvite(roomId: string, userId: string) {
    const updated = await this.prisma.watchRoomMember.updateMany({
      where: { roomId, userId, status: 'INVITED' },
      data: { status: 'JOINED', joinedAt: new Date() },
    });
    if (!updated.count) {
      await this.requireJoinedMember(roomId, userId);
    }
    void this.broadcastMembers(roomId);
    return { roomId };
  }

  async declineInvite(roomId: string, userId: string) {
    await this.prisma.watchRoomMember.deleteMany({
      where: { roomId, userId, status: 'INVITED' },
    });
    void this.broadcastMembers(roomId);
    return { ok: true };
  }

  async joinByToken(token: string, userId: string) {
    const room = await this.prisma.watchRoom.findUnique({
      where: { inviteToken: token },
      select: { id: true },
    });
    if (!room) throw new NotFoundException('Запрошення недійсне або застаріло');

    const existing = await this.prisma.watchRoomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
      select: { status: true },
    });
    if (existing?.status === 'JOINED') return { roomId: room.id };

    // joinedAt задає черговість автопередачі керування, тож для наявних учасників його не чіпаємо.
    await this.prisma.watchRoomMember.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      create: {
        roomId: room.id,
        userId,
        status: 'JOINED',
        joinedAt: new Date(),
      },
      update: { status: 'JOINED', joinedAt: new Date() },
    });
    void this.broadcastMembers(room.id);
    return { roomId: room.id };
  }

  async getInviteToken(roomId: string, userId: string) {
    await this.requireJoinedMember(roomId, userId);
    const room = await this.prisma.watchRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { inviteToken: true },
    });
    return { token: room.inviteToken };
  }

  async rotateInviteToken(roomId: string, userId: string) {
    await this.requireHost(roomId, userId);
    const room = await this.prisma.watchRoom.update({
      where: { id: roomId },
      data: { inviteToken: this.generateInviteToken() },
      select: { inviteToken: true },
    });
    return { token: room.inviteToken };
  }

  /**
   * Учасник виходить із кімнати назовсім. Якщо це хост — керування одразу переходить далі
   * (без грейсу: це свідома дія); якщо учасників не лишилося — кімната видаляється.
   */
  async leaveRoom(roomId: string, userId: string) {
    const membership = await this.prisma.watchRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { status: true, room: { select: { hostId: true } } },
    });
    if (!membership) return { ok: true, deleted: false };

    if (membership.room.hostId === userId) {
      const others = await this.joinedMemberIds(roomId, userId);
      const present = this.presentUserIds(roomId);
      const nextHost =
        pickNextHost(others, userId, present) ?? others[0] ?? null;
      if (!nextHost) {
        await this.deleteRoomInternal(roomId);
        return { ok: true, deleted: true };
      }
      await this.setHost(roomId, nextHost, 'host');
    }

    await this.prisma.watchRoomMember.delete({
      where: { roomId_userId: { roomId, userId } },
    });
    this.evictUserFromRoom(roomId, userId);
    void this.broadcastMembers(roomId);
    return { ok: true, deleted: false };
  }

  async deleteRoom(roomId: string, userId: string) {
    await this.requireHost(roomId, userId);
    await this.deleteRoomInternal(roomId);
    return { ok: true };
  }

  private async deleteRoomInternal(roomId: string) {
    const members = await this.prisma.watchRoomMember.findMany({
      where: { roomId },
      select: { userId: true },
    });
    await this.prisma.watchRoom.delete({ where: { id: roomId } });

    const runtime = this.runtimes.get(roomId);
    if (runtime?.hostGraceTimer) clearTimeout(runtime.hostGraceTimer);
    this.runtimes.delete(roomId);
    this.presence.delete(roomId);

    if (this.server) {
      const targets = [
        watchSocketRoom(roomId),
        ...members.map((m) => userSocketRoom(m.userId)),
      ];
      this.server.to(targets).emit('watch:roomDeleted', { roomId });
      this.server
        .in(watchSocketRoom(roomId))
        .socketsLeave(watchSocketRoom(roomId));
    }
  }

  // ================= ЗАЛА (СОКЕТИ) =================

  /**
   * Сокет відкрив залу. Повертає все, що потрібно, щоб одразу стрибнути в потрібне місце.
   * Запрошений, але ще не прийнятий — отримує `INVITED`, щоб клієнт показав «Прийняти».
   */
  async joinHall(roomId: string, userId: string, socketId: string) {
    const membership = await this.prisma.watchRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: {
        status: true,
        room: { select: { title: true } },
      },
    });
    if (!membership) return { ok: false as const, code: 'FORBIDDEN' as const };
    if (membership.status === 'INVITED') {
      return {
        ok: false as const,
        code: 'INVITED' as const,
        title: membership.room.title,
      };
    }

    const runtime = await this.getRuntime(roomId);
    if (!runtime) return { ok: false as const, code: 'NOT_FOUND' as const };

    let users = this.presence.get(roomId);
    if (!users) {
      users = new Map();
      this.presence.set(roomId, users);
    }
    let sockets = users.get(userId);
    if (!sockets) {
      sockets = new Set();
      users.set(userId, sockets);
    }
    sockets.add(socketId);

    if (runtime.hostAway && userId !== runtime.hostId) {
      await this.setHost(roomId, userId, 'host');
    }
    this.onPresenceChanged(roomId);

    const [members, messages, room] = await Promise.all([
      this.loadMembers(roomId),
      this.loadMessages(roomId),
      this.prisma.watchRoom.findUnique({
        where: { id: roomId },
        select: { title: true, inviteToken: true },
      }),
    ]);

    return {
      ok: true as const,
      room: {
        id: roomId,
        title: room?.title ?? membership.room.title,
        inviteToken: room?.inviteToken ?? null,
      },
      state: this.serializeState(runtime, 'sync'),
      members,
      presentUserIds: [...this.presentUserIds(roomId)],
      messages,
      reactions: WATCH_REACTIONS,
    };
  }

  leaveHall(roomId: string, userId: string, socketId: string) {
    const users = this.presence.get(roomId);
    const sockets = users?.get(userId);
    if (!users || !sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      users.delete(userId);
      // Вийшов з кімнати цілком (не просто ще одна вкладка) — "готовність" уже не інформативна.
      const runtime = this.runtimes.get(roomId);
      if (runtime && runtime.manual.readyUserIds.has(userId)) {
        runtime.manual = manualDropReady(runtime.manual, userId);
        this.broadcastManualState(runtime, 'sync');
      }
    }
    this.onPresenceChanged(roomId);
  }

  isPresent(roomId: string, userId: string) {
    return this.presence.get(roomId)?.has(userId) ?? false;
  }

  /** Команда керування плеєром. Приймається лише від хоста, який зараз у залі. */
  /**
   * @param originTag випадковий ярлик пристрою-відправника: той самий пристрій свій же стан
   *   не «виправляє», а інший пристрій того ж хоста — синхронізується.
   */
  async control(
    roomId: string,
    userId: string,
    command: ControlCommand,
    originTag?: string,
  ) {
    const runtime = this.runtimes.get(roomId);
    if (!runtime || !this.isPresent(roomId, userId)) {
      return { ok: false as const, code: 'NOT_IN_ROOM' as const };
    }
    if (runtime.hostId !== userId) {
      return {
        ok: false as const,
        code: 'NOT_HOST' as const,
        state: this.serializeState(runtime, 'sync'),
      };
    }

    if (command.type === 'changeVideo') {
      if (command.provider === 'YOUTUBE') {
        if (!isValidVideoId(command.videoId)) {
          return { ok: false as const, code: 'INVALID_VIDEO' as const };
        }
        const check = await this.checkVideo(command.videoId);
        if (!check.ok) return { ok: false as const, code: check.code };
        // Поки перевіряли відео, керування могло перейти до іншого.
        if (runtime.hostId !== userId || !this.runtimes.has(roomId)) {
          return { ok: false as const, code: 'NOT_HOST' as const };
        }
        runtime.videoTitle = check.title;
        runtime.thumbnailUrl = null;
      } else {
        // Не-YOUTUBE: лише формат ref, без повторного походу в мережу за URL від клієнта —
        // дивись коментар біля resolveAndValidate().
        if (!isValidProviderRef(command.provider, command.videoId)) {
          return { ok: false as const, code: 'INVALID_VIDEO' as const };
        }
        runtime.videoTitle = command.videoTitle?.trim().slice(0, 200) || null;
        runtime.thumbnailUrl = command.thumbnailUrl?.trim().slice(0, 1024) || null;
      }
      // Нове відео — попередній відлік/готовність більше не мають сенсу.
      this.clearManualCountdownTimer(runtime);
      runtime.manual = resetManualState();
    }

    const now = Date.now();
    const next = applyControlCommand(runtime, command, now);
    if (!next) return { ok: true as const };

    Object.assign(runtime, next);
    runtime.version += 1;

    const isHeartbeat = command.type === 'heartbeat';
    if (
      !isHeartbeat ||
      now - runtime.lastPersistAt > HEARTBEAT_PERSIST_INTERVAL_MS
    ) {
      void this.persist(runtime);
    }

    const state = this.serializeState(runtime, command.type, userId, originTag);
    this.server?.to(watchSocketRoom(roomId)).emit('watch:state', state);
    return { ok: true as const, state };
  }

  async transferHost(roomId: string, userId: string, targetUserId: string) {
    const runtime = this.runtimes.get(roomId);
    if (!runtime || runtime.hostId !== userId) {
      return { ok: false as const, code: 'NOT_HOST' as const };
    }
    if (targetUserId === userId) return { ok: true as const };
    if (!this.isPresent(roomId, targetUserId)) {
      return { ok: false as const, code: 'TARGET_NOT_PRESENT' as const };
    }
    await this.setHost(roomId, targetUserId, 'host');
    return { ok: true as const };
  }

  // ================= РУЧНА СИНХРОНІЗАЦІЯ (IFRAME/MANUAL) =================

  /** Будь-хто присутній у залі відмічає "Я готовий/готова" — не лише хост. */
  manualSetReady(roomId: string, userId: string, ready: boolean) {
    const runtime = this.runtimes.get(roomId);
    if (!runtime || !this.isPresent(roomId, userId)) {
      return { ok: false as const, code: 'NOT_IN_ROOM' as const };
    }
    if (AUTO_SYNC_PROVIDERS.has(runtime.provider)) {
      return { ok: false as const, code: 'NOT_MANUAL' as const };
    }
    runtime.manual = manualSetReady(runtime.manual, userId, ready);
    return { ok: true as const, state: this.broadcastManualState(runtime, 'sync') };
  }

  /** Хост: "Почати перегляд" — лише з idle, дає всім спільний відлік 3-2-1. */
  manualStart(roomId: string, userId: string) {
    return this.runManualTransition(roomId, userId, (runtime) =>
      manualStart(runtime.manual, Date.now()),
    );
  }

  /** Хост: "Пауза для всіх" — з running чи countdown, миттєво (без відліку). */
  manualPause(roomId: string, userId: string) {
    return this.runManualTransition(roomId, userId, (runtime) =>
      manualPause(runtime.manual, Date.now()),
    );
  }

  /** Хост: "Продовжуємо" після паузи для всіх — новий відлік 3-2-1, лише з paused. */
  manualResume(roomId: string, userId: string) {
    return this.runManualTransition(roomId, userId, (runtime) =>
      manualResume(runtime.manual, Date.now()),
    );
  }

  private runManualTransition(
    roomId: string,
    userId: string,
    transition: (runtime: RoomRuntime) => ManualSyncState | null,
  ) {
    const runtime = this.runtimes.get(roomId);
    if (!runtime || !this.isPresent(roomId, userId)) {
      return { ok: false as const, code: 'NOT_IN_ROOM' as const };
    }
    if (runtime.hostId !== userId) {
      return {
        ok: false as const,
        code: 'NOT_HOST' as const,
        state: this.serializeState(runtime, 'sync'),
      };
    }
    if (AUTO_SYNC_PROVIDERS.has(runtime.provider)) {
      return { ok: false as const, code: 'NOT_MANUAL' as const };
    }
    const next = transition(runtime);
    if (!next) return { ok: false as const, code: 'INVALID_PHASE' as const };

    this.clearManualCountdownTimer(runtime);
    runtime.manual = next;
    if (next.phase === 'countdown' && next.countdownEndsAtMs !== null) {
      const delay = Math.max(0, next.countdownEndsAtMs - Date.now());
      runtime.manualCountdownTimer = setTimeout(() => {
        runtime.manualCountdownTimer = null;
        const elapsed = manualCountdownElapsed(runtime.manual);
        if (!elapsed) return;
        runtime.manual = elapsed;
        this.broadcastManualState(runtime, 'sync');
      }, delay);
    }

    return { ok: true as const, state: this.broadcastManualState(runtime, 'sync') };
  }

  private clearManualCountdownTimer(runtime: RoomRuntime) {
    if (runtime.manualCountdownTimer) {
      clearTimeout(runtime.manualCountdownTimer);
      runtime.manualCountdownTimer = null;
    }
  }

  private broadcastManualState(runtime: RoomRuntime, reason: WatchStateReason) {
    runtime.version += 1;
    const state = this.serializeState(runtime, reason);
    this.server?.to(watchSocketRoom(runtime.roomId)).emit('watch:state', state);
    return state;
  }

  /** Сервер зараз вважає цього користувача хостом кімнати (для перевірок без БД). */
  currentState(roomId: string) {
    const runtime = this.runtimes.get(roomId);
    return runtime ? this.serializeState(runtime, 'sync') : null;
  }

  async postMessage(roomId: string, userId: string, rawContent: string) {
    const content = rawContent.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!content) return { ok: false as const, code: 'EMPTY' as const };

    const message = await this.prisma.watchMessage.create({
      data: { roomId, userId, content },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: userPublicSelect },
      },
    });
    const payload = {
      roomId,
      message: { ...message, createdAt: message.createdAt.toISOString() },
    };
    this.server?.to(watchSocketRoom(roomId)).emit('watch:message', payload);
    return { ok: true as const };
  }

  /**
   * Учасник (не обов'язково хост) пропонує відео з міні-YouTube. Хост бачить пропозицію
   * одразу (ефемерна подія, як реакції) і водночас вона лишається в історії чату як звичайне
   * повідомлення — так її видно й тим, хто в цей момент офлайн.
   */
  async suggestVideo(roomId: string, userId: string, videoId: string, rawTitle: string | null) {
    if (!isValidVideoId(videoId)) {
      return { ok: false as const, code: 'INVALID_VIDEO' as const };
    }
    const membership = await this.prisma.watchRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { status: true },
    });
    if (!membership || membership.status !== WatchMemberStatus.JOINED) {
      return { ok: false as const, code: 'FORBIDDEN' as const };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userPublicSelect,
    });
    if (!user) return { ok: false as const, code: 'FORBIDDEN' as const };

    const title = (rawTitle ?? videoId).trim().slice(0, 200) || videoId;
    this.server?.to(watchSocketRoom(roomId)).emit('watch:videoSuggested', {
      roomId,
      id: randomBytes(6).toString('hex'),
      videoId,
      title,
      user,
    });

    const displayName = user.nickname?.trim() || user.username;
    await this.postMessage(roomId, userId, `🎬 ${displayName} пропонує: «${title}»`);

    return { ok: true as const };
  }

  emitReaction(roomId: string, userId: string, emoji: string) {
    if (!(WATCH_REACTIONS as readonly string[]).includes(emoji)) {
      return { ok: false as const };
    }
    this.server?.to(watchSocketRoom(roomId)).emit('watch:reaction', {
      roomId,
      userId,
      emoji,
      id: randomBytes(6).toString('hex'),
    });
    return { ok: true as const };
  }

  // ================= ВНУТРІШНЄ: ХОСТ І ПРИСУТНІСТЬ =================

  presentUserIds(roomId: string): Set<string> {
    return new Set(this.presence.get(roomId)?.keys() ?? []);
  }

  /**
   * Правило для хоста, що зник:
   * — 15 с грейсу на перепідключення (мобільний інтернет рветься часто, а смикати керування не хочеться);
   * — далі керування отримує той, хто найдовше в кімнаті й зараз у залі;
   * — якщо в залі нікого — пауза, хост лишається; перший, хто зайде, отримає керування.
   */
  private onPresenceChanged(roomId: string) {
    const runtime = this.runtimes.get(roomId);
    const present = this.presentUserIds(roomId);

    this.server?.to(watchSocketRoom(roomId)).emit('watch:presence', {
      roomId,
      presentUserIds: [...present],
    });

    if (!runtime) return;

    if (present.has(runtime.hostId)) {
      if (runtime.hostGraceTimer) {
        clearTimeout(runtime.hostGraceTimer);
        runtime.hostGraceTimer = null;
      }
      runtime.hostAway = false;
      return;
    }

    if (!runtime.hostGraceTimer && !runtime.hostAway) {
      runtime.hostGraceTimer = setTimeout(() => {
        runtime.hostGraceTimer = null;
        void this.resolveHostAbsence(roomId).catch((error: unknown) => {
          this.logger.warn(
            `resolveHostAbsence(${roomId}) failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }, HOST_GRACE_MS);
    }

    if (present.size === 0 && runtime.hostAway) {
      this.evictRuntime(roomId);
    }
  }

  private async resolveHostAbsence(roomId: string) {
    const runtime = this.runtimes.get(roomId);
    if (!runtime) return;
    const present = this.presentUserIds(roomId);
    if (present.has(runtime.hostId)) return;

    const order = await this.joinedMemberIds(roomId);
    const nextHost = pickNextHost(order, runtime.hostId, present);
    if (nextHost) {
      await this.setHost(roomId, nextHost, 'host');
      return;
    }

    runtime.hostAway = true;
    if (runtime.isPlaying) {
      const now = Date.now();
      runtime.positionSec = projectPosition(runtime, now);
      runtime.isPlaying = false;
      runtime.updatedAtMs = now;
      runtime.version += 1;
      this.server
        ?.to(watchSocketRoom(roomId))
        .emit('watch:state', this.serializeState(runtime, 'hostAway'));
    }
    await this.persist(runtime);
    if (present.size === 0) this.evictRuntime(roomId);
  }

  private async setHost(
    roomId: string,
    hostId: string,
    reason: WatchStateReason,
  ) {
    await this.prisma.watchRoom.update({
      where: { id: roomId },
      data: { hostId },
    });
    const runtime = this.runtimes.get(roomId);
    if (!runtime) return;
    runtime.hostId = hostId;
    runtime.hostAway = false;
    if (runtime.hostGraceTimer) {
      clearTimeout(runtime.hostGraceTimer);
      runtime.hostGraceTimer = null;
    }
    runtime.version += 1;
    this.server
      ?.to(watchSocketRoom(roomId))
      .emit('watch:state', this.serializeState(runtime, reason));
    // Якщо новий хост теж не в залі (вихід через REST без нікого в залі) — запускаємо той самий грейс.
    this.onPresenceChanged(roomId);
  }

  private evictUserFromRoom(roomId: string, userId: string) {
    this.presence.get(roomId)?.delete(userId);
    this.server
      ?.in(userSocketRoom(userId))
      .socketsLeave(watchSocketRoom(roomId));
    this.server
      ?.to(userSocketRoom(userId))
      .emit('watch:removedFromRoom', { roomId });
    this.onPresenceChanged(roomId);
  }

  private evictRuntime(roomId: string) {
    const runtime = this.runtimes.get(roomId);
    if (!runtime) return;
    if (runtime.hostGraceTimer) clearTimeout(runtime.hostGraceTimer);
    if (runtime.manualCountdownTimer) clearTimeout(runtime.manualCountdownTimer);
    this.runtimes.delete(roomId);
    this.presence.delete(roomId);
    void this.persist(runtime);
  }

  private async getRuntime(roomId: string): Promise<RoomRuntime | null> {
    const existing = this.runtimes.get(roomId);
    if (existing) return existing;

    let loading = this.runtimeLoads.get(roomId);
    if (!loading) {
      loading = this.loadRuntime(roomId).finally(() =>
        this.runtimeLoads.delete(roomId),
      );
      this.runtimeLoads.set(roomId, loading);
    }
    return loading;
  }

  private async loadRuntime(roomId: string): Promise<RoomRuntime | null> {
    const room = await this.prisma.watchRoom.findUnique({
      where: { id: roomId },
      select: {
        provider: true,
        videoId: true,
        videoTitle: true,
        thumbnailUrl: true,
        isPlaying: true,
        positionSec: true,
        stateUpdatedAt: true,
        hostId: true,
      },
    });
    if (!room) return null;

    const updatedAtMs = room.stateUpdatedAt.getTime();
    const stale = room.isPlaying && Date.now() - updatedAtMs > STALE_PLAYING_MS;
    const runtime: RoomRuntime = {
      roomId,
      provider: room.provider as WatchProvider,
      videoId: room.videoId,
      videoTitle: room.videoTitle,
      thumbnailUrl: room.thumbnailUrl,
      // Застарілий «грає» — ознака падіння сервера посеред сеансу: не проєктуємо на години вперед.
      isPlaying: room.isPlaying && !stale,
      positionSec: room.positionSec,
      updatedAtMs: stale ? Date.now() : updatedAtMs,
      hostId: room.hostId,
      // Від часу завантаження, а не з нуля: після рестарту сервера версії лишаються зростаючими.
      version: Date.now(),
      lastPersistAt: Date.now(),
      hostGraceTimer: null,
      hostAway: false,
      manual: initialManualState(),
      manualCountdownTimer: null,
    };
    this.runtimes.set(roomId, runtime);
    return runtime;
  }

  private async persist(runtime: RoomRuntime) {
    runtime.lastPersistAt = Date.now();
    try {
      await this.prisma.watchRoom.updateMany({
        where: { id: runtime.roomId },
        data: {
          provider: runtime.provider,
          videoId: runtime.videoId,
          videoTitle: runtime.videoTitle,
          thumbnailUrl: runtime.thumbnailUrl,
          isPlaying: runtime.isPlaying,
          positionSec: runtime.positionSec,
          stateUpdatedAt: new Date(runtime.updatedAtMs),
          hostId: runtime.hostId,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `persist(${runtime.roomId}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private serializeState(
    runtime: RoomRuntime,
    reason: WatchStateReason,
    actorId?: string,
    originTag?: string,
  ) {
    return {
      roomId: runtime.roomId,
      provider: runtime.provider,
      videoId: runtime.videoId,
      videoTitle: runtime.videoTitle,
      thumbnailUrl: runtime.thumbnailUrl,
      isPlaying: runtime.isPlaying,
      positionSec: runtime.positionSec,
      updatedAt: runtime.updatedAtMs,
      serverNow: Date.now(),
      hostId: runtime.hostId,
      version: runtime.version,
      reason,
      actorId: actorId ?? null,
      originTag: originTag ?? null,
      manual: AUTO_SYNC_PROVIDERS.has(runtime.provider)
        ? null
        : {
            phase: runtime.manual.phase,
            // Дзеркалить updatedAt/serverNow вище: "Ms" — лише у внутрішній назві поля, назовні
            // так само як усі інші серверні мітки часу в цьому payload.
            countdownEndsAt: runtime.manual.countdownEndsAtMs,
            readyUserIds: [...runtime.manual.readyUserIds],
            accumulatedMs: runtime.manual.accumulatedMs,
            runningSince: runtime.manual.runningSinceMs,
          },
    };
  }

  // ================= ВНУТРІШНЄ: БД =================

  private async requireJoinedMember(roomId: string, userId: string) {
    const membership = await this.prisma.watchRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { status: true, room: { select: { title: true, hostId: true } } },
    });
    if (!membership) throw new NotFoundException('Кімнату не знайдено');
    if (membership.status !== 'JOINED') {
      throw new ForbiddenException('Спершу прийміть запрошення');
    }
    return membership.room;
  }

  private async requireHost(roomId: string, userId: string) {
    const room = await this.prisma.watchRoom.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) throw new NotFoundException('Кімнату не знайдено');
    const hostId = this.runtimes.get(roomId)?.hostId ?? room.hostId;
    if (hostId !== userId) {
      throw new ForbiddenException('Це може зробити лише хост кімнати');
    }
  }

  private async joinedMemberIds(roomId: string, excludeUserId?: string) {
    const rows = await this.prisma.watchRoomMember.findMany({
      where: {
        roomId,
        status: 'JOINED',
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
      orderBy: [{ joinedAt: 'asc' }, { createdAt: 'asc' }],
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private async resolveInvitees(rawIds: string[], selfId: string) {
    const ids = [...new Set(rawIds)].filter((id) => id && id !== selfId);
    if (ids.length > MAX_INVITEES) {
      throw new BadRequestException(
        `За раз можна запросити до ${MAX_INVITEES} людей`,
      );
    }
    if (!ids.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async loadMembers(roomId: string) {
    const rows = await this.prisma.watchRoomMember.findMany({
      where: { roomId },
      orderBy: [{ joinedAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        status: true,
        joinedAt: true,
        user: { select: userPublicSelect },
      },
    });
    return rows.map((row) => ({
      ...row.user,
      status: row.status,
      joinedAt: row.joinedAt?.toISOString() ?? null,
    }));
  }

  private async broadcastMembers(roomId: string) {
    if (!this.server) return;
    try {
      const members = await this.loadMembers(roomId);
      this.server
        .to(watchSocketRoom(roomId))
        .emit('watch:members', { roomId, members });
    } catch {
      // кімнату могли щойно видалити
    }
  }

  private async loadMessages(roomId: string) {
    const rows = await this.prisma.watchMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: CHAT_HISTORY_LIMIT,
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: userPublicSelect },
      },
    });
    return rows
      .reverse()
      .map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
  }

  private async notifyInvited(
    roomId: string,
    roomTitle: string,
    inviterId: string,
    userIds: string[],
  ) {
    if (!userIds.length) return;
    try {
      const inviter = await this.prisma.user.findUnique({
        where: { id: inviterId },
        select: { nickname: true, username: true },
      });
      const inviterName = inviter?.nickname || inviter?.username || '';

      this.server
        ?.to(userIds.map(userSocketRoom))
        .emit('watch:invited', { roomId, roomTitle, inviterName });

      await this.pushService.sendWatchInvitePush({
        targetUserIds: userIds,
        inviterName,
        roomTitle,
        roomId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `notifyInvited(${roomId}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private generateInviteToken() {
    return randomBytes(18).toString('base64url');
  }
}
