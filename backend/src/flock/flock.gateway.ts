import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { FLOCK_CONFIG, NUM_SKINS } from './flock.config';
import { FlockManager } from './flock.manager';
import { decodeInput } from './protocol';

interface FlockSocket extends Socket {
  data: { userId?: string; name?: string };
}

/**
 * Окремий namespace `/flock`: арена не ділить сокет із чатами. Клієнт підключається
 * тільки при відкритій грі. Автентифікація - той самий JWT, що й у чату.
 */
@WebSocketGateway({
  namespace: '/flock',
  cors: { origin: '*' },
})
export class FlockGateway
  implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly log = new Logger(FlockGateway.name);
  private ns!: Namespace;
  private manager: FlockManager;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {
    this.manager = new FlockManager((connKey, event, payload) => {
      const sock = this.ns?.sockets.get(connKey);
      if (!sock) return;
      if (payload instanceof Uint8Array) {
        const data = Buffer.from(
          payload.buffer,
          payload.byteOffset,
          payload.byteLength,
        );
        // Стан - volatile: застарілий кадр на повільному каналі не варто ставити в чергу.
        // Таблиця лідерів йде слідом у тому ж тіку і не має губитись (volatile її відкидав би).
        if (event === 's') sock.volatile.emit(event, data);
        else sock.emit(event, data);
      } else {
        sock.emit(event, payload);
      }
    });
  }

  afterInit(ns: Namespace) {
    this.ns = ns;
    ns.use(async (socket: FlockSocket, next) => {
      try {
        const raw =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization ||
          '';
        const token =
          typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '').trim() : '';
        if (!token) return next(new Error('unauthorized'));
        const payload = this.jwt.verify(token);
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
        });
        if (!user) return next(new Error('unauthorized'));
        socket.data.userId = user.id;
        socket.data.name = user.nickname ?? user.username;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  @SubscribeMessage('j')
  join(
    @ConnectedSocket() client: FlockSocket,
    @MessageBody()
    body: {
      skin?: unknown;
      resume?: unknown;
      arena?: unknown;
      resumeOnly?: unknown;
    },
  ) {
    const skin = typeof body?.skin === 'number' ? Math.floor(body.skin) : 0;
    const resume =
      typeof body?.resume === 'string' && /^[0-9a-f]{32}$/.test(body.resume)
        ? body.resume
        : undefined;
    const arena =
      typeof body?.arena === 'number' &&
      Number.isInteger(body.arena) &&
      body.arena > 0
        ? body.arena
        : undefined;
    const res = this.manager.join(
      client.id,
      client.data.userId!,
      client.data.name ?? 'Овечка',
      Math.max(0, Math.min(NUM_SKINS - 1, skin)),
      { resume, arena, resumeOnly: body?.resumeOnly === true },
    );
    if (!res.ok) {
      client.emit('e', { code: res.error, resumeFailed: !!res.resumeFailed });
      return;
    }
    client.emit('w', {
      pid: res.pid,
      arenaId: res.arenaId,
      resumeToken: res.token,
      resumed: !!res.resumed,
      resumeFailed: !!res.resumeFailed,
      pauseMs: FLOCK_CONFIG.resumePauseMs,
      world: FLOCK_CONFIG.worldSize,
      chunk: FLOCK_CONFIG.chunkSize,
      tickHz: FLOCK_CONFIG.tickHz,
      radiusK: FLOCK_CONFIG.radiusK,
      speed: {
        base: FLOCK_CONFIG.baseSpeed,
        exp: FLOCK_CONFIG.speedMassExp,
        min: FLOCK_CONFIG.minSpeed,
        boost: FLOCK_CONFIG.speedMultiplier,
      },
      durations: FLOCK_CONFIG.bonusDurations,
      magnetRadius: FLOCK_CONFIG.magnetRadius,
      view: {
        base: FLOCK_CONFIG.viewBase,
        perSqrtMass: FLOCK_CONFIG.viewPerSqrtMass,
        max: FLOCK_CONFIG.viewMax,
      },
    });
  }

  @SubscribeMessage('i')
  input(@ConnectedSocket() client: FlockSocket, @MessageBody() body: unknown) {
    const msg = decodeInput(body as ArrayBuffer | Uint8Array);
    if (!msg) return;
    this.manager.input(
      client.id,
      msg.angle,
      msg.power,
      msg.split,
      msg.throw,
      msg.aspect,
    );
  }

  @SubscribeMessage('x')
  leave(@ConnectedSocket() client: FlockSocket) {
    this.manager.leave(client.id);
  }

  /** Розрив зʼєднання не з волі гравця: овечка лишається в паузі (явний вихід іде через `x`). */
  handleDisconnect(client: FlockSocket) {
    this.manager.disconnect(client.id);
  }

  /** Чи є зараз живі гравці (для статусу "грає в Отару"). */
  getStats() {
    return this.manager.stats();
  }

  onModuleDestroy() {
    this.manager.dispose();
    this.log.log('flock arenas disposed');
  }
}
