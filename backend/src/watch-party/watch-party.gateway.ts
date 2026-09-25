import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  WatchPartyService,
  userSocketRoom,
  watchSocketRoom,
} from './watch-party.service';
import { isWatchProvider, type ControlCommand } from './watch-party.state';

interface WatchSocket extends Socket {
  data: {
    /** Той самий сокет обслуговує і ChatGateway; тут тримаємо лише своє. */
    watchUserId?: string;
    watchRooms?: Set<string>;
    [key: string]: unknown;
  };
}

type RoomBody = { roomId?: unknown };
type ControlBody = RoomBody & {
  tag?: unknown;
  positionSec?: unknown;
  isPlaying?: unknown;
  sentAt?: unknown;
  videoId?: unknown;
  startSec?: unknown;
  provider?: unknown;
  videoTitle?: unknown;
  thumbnailUrl?: unknown;
};

/** Ковзне вікно: не більше `limit` подій за `windowMs` для ключа. */
class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  allow(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  forget(prefix: string) {
    for (const key of this.hits.keys()) {
      if (key.startsWith(prefix)) this.hits.delete(key);
    }
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRoomId(body: RoomBody | undefined): string | null {
  const value = body?.roomId;
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

function readTag(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value)
    ? value
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Realtime «Кіношки». Живе в тому самому namespace, що й чат, тож клієнт не відкриває
 * друге з'єднання; авторизацію перевіряє сам (JWT із handshake), не покладаючись на ChatGateway.
 */
@WebSocketGateway({
  cors: { origin: '*' },
})
export class WatchPartyGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly limiter = new RateLimiter();

  constructor(
    private readonly jwt: JwtService,
    private readonly watchParty: WatchPartyService,
  ) {}

  afterInit(server: Server) {
    this.watchParty.attachServer(server);
  }

  handleConnection(client: WatchSocket) {
    const userId = this.verifyUserId(client);
    if (!userId) return;
    client.data.watchUserId = userId;
    client.data.watchRooms = new Set();
    void client.join(userSocketRoom(userId));
  }

  handleDisconnect(client: WatchSocket) {
    const userId = client.data.watchUserId;
    this.limiter.forget(`${client.id}:`);
    if (!userId) return;
    for (const roomId of client.data.watchRooms ?? []) {
      this.watchParty.leaveHall(roomId, userId, client.id);
    }
  }

  /** NTP-подібна синхронізація годинника: клієнт міряє RTT і зсув відносно сервера. */
  @SubscribeMessage('watch:time')
  handleTime(@MessageBody() body: { t0?: unknown }) {
    return { t0: readNumber(body?.t0) ?? null, serverNow: Date.now() };
  }

  @SubscribeMessage('watch:join')
  async handleJoin(
    @MessageBody() body: RoomBody,
    @ConnectedSocket() client: WatchSocket,
  ) {
    const userId = client.data.watchUserId;
    const roomId = readRoomId(body);
    if (!userId) return { ok: false, code: 'UNAUTHORIZED' };
    if (!roomId) return { ok: false, code: 'NOT_FOUND' };

    const result = await this.watchParty.joinHall(roomId, userId, client.id);
    if (result.ok) {
      await client.join(watchSocketRoom(roomId));
      client.data.watchRooms?.add(roomId);
    }
    return result;
  }

  @SubscribeMessage('watch:leave')
  async handleLeave(
    @MessageBody() body: RoomBody,
    @ConnectedSocket() client: WatchSocket,
  ) {
    const userId = client.data.watchUserId;
    const roomId = readRoomId(body);
    if (!userId || !roomId) return { ok: false };
    client.data.watchRooms?.delete(roomId);
    await client.leave(watchSocketRoom(roomId));
    this.watchParty.leaveHall(roomId, userId, client.id);
    return { ok: true };
  }

  @SubscribeMessage('watch:play')
  handlePlay(
    @MessageBody() body: ControlBody,
    @ConnectedSocket() client: WatchSocket,
  ) {
    return this.runControl(client, body, {
      type: 'play',
      positionSec: readNumber(body?.positionSec),
      sentAt: readNumber(body?.sentAt),
    });
  }

  @SubscribeMessage('watch:pause')
  handlePause(
    @MessageBody() body: ControlBody,
    @ConnectedSocket() client: WatchSocket,
  ) {
    return this.runControl(client, body, {
      type: 'pause',
      positionSec: readNumber(body?.positionSec),
      sentAt: readNumber(body?.sentAt),
    });
  }

  @SubscribeMessage('watch:seek')
  handleSeek(
    @MessageBody() body: ControlBody,
    @ConnectedSocket() client: WatchSocket,
  ) {
    const positionSec = readNumber(body?.positionSec);
    if (positionSec === undefined) return { ok: false, code: 'BAD_REQUEST' };
    return this.runControl(client, body, {
      type: 'seek',
      positionSec,
      sentAt: readNumber(body?.sentAt),
    });
  }

  @SubscribeMessage('watch:changeVideo')
  handleChangeVideo(
    @MessageBody() body: ControlBody,
    @ConnectedSocket() client: WatchSocket,
  ) {
    if (typeof body?.videoId !== 'string')
      return { ok: false, code: 'INVALID_VIDEO' };
    // Старі клієнти не шлють provider — вважаємо YouTube, як і було до мультипровайдерності.
    const provider = isWatchProvider(body.provider) ? body.provider : 'YOUTUBE';
    return this.runControl(client, body, {
      type: 'changeVideo',
      provider,
      videoId: body.videoId,
      startSec: readNumber(body?.startSec),
      videoTitle: typeof body.videoTitle === 'string' ? body.videoTitle : undefined,
      thumbnailUrl: typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : undefined,
    });
  }

  @SubscribeMessage('watch:heartbeat')
  handleHeartbeat(
    @MessageBody() body: ControlBody,
    @ConnectedSocket() client: WatchSocket,
  ) {
    const positionSec = readNumber(body?.positionSec);
    if (positionSec === undefined || typeof body?.isPlaying !== 'boolean') {
      return { ok: false, code: 'BAD_REQUEST' };
    }
    return this.runControl(
      client,
      body,
      {
        type: 'heartbeat',
        positionSec,
        isPlaying: body.isPlaying,
        sentAt: readNumber(body?.sentAt),
      },
      'heartbeat',
    );
  }

  @SubscribeMessage('watch:transferHost')
  handleTransferHost(
    @MessageBody() body: RoomBody & { userId?: unknown },
    @ConnectedSocket() client: WatchSocket,
  ) {
    const userId = client.data.watchUserId;
    const roomId = readRoomId(body);
    if (!userId || !roomId || typeof body?.userId !== 'string') {
      return { ok: false, code: 'BAD_REQUEST' };
    }
    return this.watchParty.transferHost(roomId, userId, body.userId);
  }

  @SubscribeMessage('watch:message')
  handleMessage(
    @MessageBody() body: RoomBody & { content?: unknown },
    @ConnectedSocket() client: WatchSocket,
  ) {
    const userId = client.data.watchUserId;
    const roomId = readRoomId(body);
    if (!userId || !roomId || typeof body?.content !== 'string') {
      return { ok: false, code: 'BAD_REQUEST' };
    }
    if (!this.watchParty.isPresent(roomId, userId)) {
      return { ok: false, code: 'NOT_IN_ROOM' };
    }
    if (!this.limiter.allow(`${client.id}:msg`, 5, 5_000)) {
      return { ok: false, code: 'RATE_LIMITED' };
    }
    return this.watchParty.postMessage(roomId, userId, body.content);
  }

  @SubscribeMessage('watch:suggestVideo')
  handleSuggestVideo(
    @MessageBody() body: RoomBody & { videoId?: unknown; title?: unknown },
    @ConnectedSocket() client: WatchSocket,
  ) {
    const userId = client.data.watchUserId;
    const roomId = readRoomId(body);
    if (!userId || !roomId || typeof body?.videoId !== 'string') {
      return { ok: false, code: 'BAD_REQUEST' };
    }
    if (!this.watchParty.isPresent(roomId, userId)) {
      return { ok: false, code: 'NOT_IN_ROOM' };
    }
    if (!this.limiter.allow(`${client.id}:suggest`, 5, 10_000)) {
      return { ok: false, code: 'RATE_LIMITED' };
    }
    const title = typeof body.title === 'string' ? body.title : null;
    return this.watchParty.suggestVideo(roomId, userId, body.videoId, title);
  }

  @SubscribeMessage('watch:reaction')
  handleReaction(
    @MessageBody() body: RoomBody & { emoji?: unknown },
    @ConnectedSocket() client: WatchSocket,
  ) {
    const userId = client.data.watchUserId;
    const roomId = readRoomId(body);
    if (!userId || !roomId || typeof body?.emoji !== 'string') {
      return { ok: false };
    }
    if (!this.watchParty.isPresent(roomId, userId)) return { ok: false };
    if (!this.limiter.allow(`${client.id}:reaction`, 6, 3_000)) {
      return { ok: false, code: 'RATE_LIMITED' };
    }
    return this.watchParty.emitReaction(roomId, userId, body.emoji);
  }

  private runControl(
    client: WatchSocket,
    body: ControlBody,
    command: ControlCommand,
    bucket: 'control' | 'heartbeat' = 'control',
  ) {
    const userId = client.data.watchUserId;
    const roomId = readRoomId(body);
    if (!userId || !roomId) return { ok: false, code: 'BAD_REQUEST' };

    const allowed =
      bucket === 'heartbeat'
        ? this.limiter.allow(`${client.id}:hb`, 3, 3_000)
        : this.limiter.allow(`${client.id}:ctl`, 10, 2_000);
    if (!allowed) {
      return {
        ok: false,
        code: 'RATE_LIMITED',
        state: this.watchParty.currentState(roomId),
      };
    }
    return this.watchParty.control(roomId, userId, command, readTag(body?.tag));
  }

  private verifyUserId(client: WatchSocket): string | null {
    const raw =
      (client.handshake.auth as { token?: unknown } | undefined)?.token ??
      client.handshake.headers?.authorization;
    if (typeof raw !== 'string') return null;
    const token = raw.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    try {
      const payload = this.jwt.verify<{ sub?: string }>(token);
      return typeof payload?.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
