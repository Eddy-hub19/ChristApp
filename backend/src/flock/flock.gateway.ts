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
import { authUserCache } from 'src/auth/auth-user-cache';
import { PrismaService } from 'src/prisma/prisma.service';
import { FLOCK_CONFIG, NUM_SKINS, isRemovedSkin } from './flock.config';
import { FlockManager } from './flock.manager';
import { FlockDailyService } from './flock.daily.service';
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
    private readonly daily: FlockDailyService,
  ) {
    this.manager = new FlockManager(
      createSender((key) => this.ns?.sockets.get(key)),
      Math.random,
      Date.now,
      {
        onTop1: (userId, connKey) => void this.rewardTop1(userId, connKey),
        onBossKill: (userId, connKey) => void this.rewardBossKill(userId, connKey),
        onCircleWin: (userId, connKey) => void this.rewardCircleWin(userId, connKey),
        onMass: (userId, mass) => void this.daily.recordMass(userId, mass),
        getStreak: () => this.daily.streakHolder,
        onDeath: (userId, run) =>
          void this.rubies
            .recordRun(userId, run)
            .catch((e) => this.log.error(`recordRun: ${String(e)}`)),
      },
    );
    this.daily.onStreakChange(() => this.manager.streakChanged());
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

  /** Нагорода за Вожака: так само пише в БД, а потім шле клієнту подію `r`. */
  private async rewardBossKill(userId: string, connKey: string | null) {
    try {
      const res = await this.rubies.awardBossKill(userId);
      if (res && connKey) this.ns?.sockets.get(connKey)?.emit('r', res);
    } catch (e) {
      this.log.error(`awardBossKill: ${String(e)}`);
    }
  }

  /** Нагорода за перемогу в режимі «Звужуване коло»: у межах добового ліміту арени, пише сервер, клієнту - подія `r`. */
  private async rewardCircleWin(userId: string, connKey: string | null) {
    try {
      const res = await this.rubies.awardCircleWin(userId);
      if (res && connKey) this.ns?.sockets.get(connKey)?.emit('r', res);
    } catch (e) {
      this.log.error(`awardCircleWin: ${String(e)}`);
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
        // той самий кеш, що в JwtStrategy: перепідключення (мережа блимнула) не б'є в БД
        const cached = authUserCache.get(payload.sub) as
          | { id: string; username: string; nickname: string | null }
          | undefined;
        const user =
          cached ??
          (await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, username: true, nickname: true },
          }));
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
      /** Бажаний артефакт; сервер перевіряє покупку в БД (куплений - надіваємо, інакше `artifact_locked`). */
      artifact?: unknown;
      resume?: unknown;
      arena?: unknown;
      resumeOnly?: unknown;
      /** Режим арени: 'circle' - «Звужуване коло» (окрема арена); без поля - звичайна. */
      mode?: unknown;
      /** Версія протоколу клієнта: 2+ читає кущі з `welcome`, без поля - старий клієнт. */
      v?: unknown;
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
    // знятий скін (збережений вибір із минулого) на арену не потрапляє: замість нього біла овечка
    const clamped = Math.max(0, Math.min(NUM_SKINS - 1, skin));
    const wanted = isRemovedSkin(clamped) ? 0 : clamped;
    // Скін перевіряє сервер: платний без покупки на арену не пускаємо (не підміняємо мовчки).
    // Перевіряємо завжди, навіть із resume: токен міг не підійти, і тоді створюється нова овечка з цим скіном.
    if (!(await this.rubies.canUseSkin(userId, wanted))) {
      client.emit('e', { code: 'skin_locked' });
      return;
    }
    // Артефакт: клієнт лише просить, бонус дає сервер за покупкою в БД (підміна неможлива). Без поля (старий клієнт) - береться надітий у профілі.
    const artifact = await this.rubies.resolveArtifact(
      userId,
      typeof body?.artifact === 'number' ? Math.floor(body.artifact) : undefined,
    );
    if (artifact === null) {
      client.emit('e', { code: 'artifact_locked' });
      return;
    }
    if (!client.connected) return;
    const res = this.manager.join(
      client.id,
      userId,
      client.data.name ?? 'Овечка',
      wanted,
      {
        artifact,
        resume,
        arena,
        resumeOnly: body?.resumeOnly === true,
        mode: body?.mode === 'circle' ? 'circle' : 'normal',
        legacyThorns: !(typeof body?.v === 'number' && body.v >= 2),
      },
    );
    if (!res.ok) {
      client.emit('e', { code: res.error, resumeFailed: !!res.resumeFailed, waitMs: res.waitMs });
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
      /** Кущі арени: один раз тут, у пакетах стану їх більше нема (для клієнтів v2+). */
      thorns: res.thorns,
      /** Вид карти арени (палітра на клієнті); без поля (старий сервер) - 0. */
      map: res.mapId,
      /** Вигляд кущів карти (bush | autumn | fir): клієнт малює спрайт за ним; без поля - за номером карти. */
      thornStyle: res.thornStyle,
      /** Річка лави карти «Вулкан»: { y0, y1, bridges: [{x0,x1}] }; без поля - лави нема. */
      lava: res.lava,
      /** Зірки «Зорепаду» на момент входу: { id, x, y, fall - мс до приземлення }. */
      stars: res.stars,
      /** «Дощ» на момент входу: { l, y, d, p: [[id, x, y, r]] }; без поля - дощу нема. */
      rain: res.rain,
      /** Режим арени ('circle' - «Звужуване коло») і стан кола: { x, y, r0, r1, hold, shrink, stage, stages }. */
      mode: res.mode,
      circle: res.circle,
      /** На скільки калюжа уповільнює клітини (частка), для передбачення на клієнті. */
      rainSlow: FLOCK_CONFIG.rain.slowFraction,
      /** Серія днів на 1-му місці: { p - pid держателя тут (0 - нема), d - днів }; далі приходить подією `sk`. */
      streak: res.streak,
      /** Піврозмір спрайта їжі (світові одиниці). */
      foodRadius: FLOCK_CONFIG.foodRadius,
      chunk: FLOCK_CONFIG.chunkSize,
      tickHz: FLOCK_CONFIG.tickHz,
      radiusK: FLOCK_CONFIG.radiusK,
      speed: {
        base: FLOCK_CONFIG.baseSpeed,
        exp: FLOCK_CONFIG.speedMassExp,
        min: FLOCK_CONFIG.minSpeed,
        boost: FLOCK_CONFIG.speedMultiplier,
        /** Розгін на старті: +частка швидкості, що спадає до 0 за durations.boost. */
        spawnBoost: FLOCK_CONFIG.spawnBoost.speedBonus,
        /** «Прискорення»: клієнт передбачає ту саму формулу (flockModel.speedOf). */
        sprint: { ...FLOCK_CONFIG.sprint },
      },
      durations: {
        ...FLOCK_CONFIG.bonusDurations,
        boost: FLOCK_CONFIG.spawnBoost.durationMs,
      },
      magnetRadius: FLOCK_CONFIG.magnetRadius,
      view: {
        base: FLOCK_CONFIG.viewBase,
        perSqrtMass: FLOCK_CONFIG.viewPerSqrtMass,
        max: FLOCK_CONFIG.viewMax,
      },
      /** «Орлиний зір»: у скільки разів камера клієнта відсувається, поки діє бонус. */
      eagleZoom: FLOCK_CONFIG.eagle.zoom,
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
      msg.sprint,
    );
  }

  /** Швидка фраза: тіло - лише id (число). Невідомий id / частота / мертвий гравець - мовчки ігноруються. */
  @SubscribeMessage('q')
  phrase(@ConnectedSocket() client: FlockSocket, @MessageBody() body: unknown) {
    // рядок - свій текст (очищення, фільтр, мут, суворий ліміт); число - готова фраза
    if (typeof body === 'string') {
      const res = this.manager.sayText(client.id, body);
      if (!res.ok && (res.reason === 'profanity' || res.reason === 'muted' || res.reason === 'disabled'))
        client.emit('qr', { r: res.reason });
      return;
    }
    this.manager.say(client.id, body);
  }

  /** Заглушити гравця (свій текст) на minutes хв; 0 - зняти. Лише пам'ять процесу. */
  muteUser(userId: string, minutes: number) {
    return this.manager.muteUser(userId, minutes);
  }
  mutedUntil(userId: string) {
    return this.manager.mutedUntil(userId);
  }
  recentSays() {
    return this.manager.recentSays();
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

  /** Арени для адмінки «Процеси»: без важких полів (розбивка тіка, байти), лише те, що показуємо. */
  getAdminStats() {
    return this.manager.stats().map((a) => ({
      id: a.id,
      humans: a.humans,
      bots: a.bots,
      botsActive: a.botsActive,
      botsRetiring: a.botsRetiring,
      botsTarget: a.botsTarget,
      botsLoadCap: a.botsLoadCap,
      hz: a.hz,
      load: a.load,
      decisions: a.decisions.slice(-10),
    }));
  }

  onModuleDestroy() {
    this.manager.dispose();
    this.log.log('flock arenas disposed');
  }
}
