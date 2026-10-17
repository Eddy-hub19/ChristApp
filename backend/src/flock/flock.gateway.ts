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
import { FlockRubiesService } from './flock.rubies.service';
import { createSender } from './flock.transport';
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
    private readonly rubies: FlockRubiesService,
  ) {
    this.manager = new FlockManager(
      createSender((key) => this.ns?.sockets.get(key)),
      Math.random,
      Date.now,
      {
        onTop1: (userId, connKey) => void this.rewardTop1(userId, connKey),
        onDeath: (userId, run) =>
          void this.rubies
            .recordRun(userId, run)
            .catch((e) => this.log.error(`recordRun: ${String(e)}`)),
      },
    );
  }

  /** Нагорода за 1-ше місце: сервер пише в БД і лише потім повідомляє клієнта (подія `r`). */
  private async rewardTop1(userId: string, connKey: string | null) {
    try {
      const res = await this.rubies.awardTop1(userId);
      if (res && connKey) this.ns?.sockets.get(connKey)?.emit('r', res);
    } catch (e) {
      this.log.error(`awardTop1: ${String(e)}`);
    }
  }

  afterInit(ns: Namespace) {
    this.ns = ns;
    // Стиснення кадрів (permessage-deflate) їсть CPU на кожен пакет стану, а виграє копійки (пакет ~70 Б).
    // За замовчуванням воно вимкнене; якщо хтось увімкне його в налаштуваннях сервера - скажемо про це в лог.
    const engineOpts = (
      ns.server as unknown as {
        engine?: { opts?: { perMessageDeflate?: unknown } };
      }
    ).engine?.opts;
    if (engineOpts?.perMessageDeflate) {
      this.log.warn(
        'socket.io perMessageDeflate увімкнено: це зайве навантаження на CPU для ігрового namespace /flock',
      );
    }
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
  async join(
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
    const userId = client.data.userId!;
    const wanted = Math.max(0, Math.min(NUM_SKINS - 1, skin));
    // Скін перевіряє сервер: платний без покупки на арену не пускаємо (не підміняємо мовчки).
    // Перевіряємо завжди, навіть із resume: токен міг не підійти, і тоді створюється нова овечка з цим скіном.
    if (!(await this.rubies.canUseSkin(userId, wanted))) {
      client.emit('e', { code: 'skin_locked' });
      return;
    }
    if (!client.connected) return;
    const res = this.manager.join(
      client.id,
      userId,
      client.data.name ?? 'Овечка',
      wanted,
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
    // число (одним текстовим кадром) - основний формат; бінарні 3-4 байти - сумісність зі старими клієнтами
    const msg = decodeInput(body as number | ArrayBuffer | Uint8Array);
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
