import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { authUserCache } from 'src/auth/auth-user-cache';
import { PrismaService } from 'src/prisma/prisma.service';
import { RadioService } from './radio.service';

type RadioSocket = Socket<any, any, any, { userId?: string }>;

const LISTENERS_THROTTLE_MS = 1000;
/** Сколько слушателей отдаём списком (счётчик всегда полный). */
const LISTENERS_LIST_MAX = 50;

export interface RadioListener {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Отдельный namespace `/radio`: клиент подключается на экране «Музыка» и пока слушает эфир. Авторизация - тот же JWT, что в чате.
 * `radio:join`/`radio:leave` - «слушаю/не слушаю»; слушатель считается по userId (несколько вкладок = один слушатель).
 */
@WebSocketGateway({ namespace: '/radio', cors: { origin: '*' } })
export class RadioGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
  private readonly log = new Logger(RadioGateway.name);
  private ns!: Namespace;
  /** userId -> id сокетов, которые сейчас в эфире. */
  private readonly listeners = new Map<string, Set<string>>();
  /** Имя и аватар слушателей (подгружаются при `radio:join`, живут пока человек в эфире). */
  private readonly info = new Map<string, RadioListener>();
  private pushTimer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly radio: RadioService,
  ) {}

  afterInit(ns: Namespace) {
    this.ns = ns;
    ns.use(async (socket: RadioSocket, next) => {
      try {
        const raw = socket.handshake.auth?.token || socket.handshake.headers?.authorization || '';
        const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '').trim() : '';
        if (!token) return next(new Error('unauthorized'));
        const payload = this.jwt.verify(token);
        const cached = authUserCache.get(payload.sub) as { id: string } | undefined;
        const user = cached ?? (await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } }));
        if (!user) return next(new Error('unauthorized'));
        socket.data.userId = user.id;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
    ns.on('connection', (socket: RadioSocket) => {
      socket.emit('radio:state', this.radio.getState());
      socket.emit('radio:listeners', this.listenersPayload());
    });
    this.unsubscribe = this.radio.onChange((state) => this.ns?.emit('radio:state', state));
    this.log.log('Radio gateway ready');
  }

  onModuleDestroy() {
    this.unsubscribe?.();
    if (this.pushTimer) clearTimeout(this.pushTimer);
  }

  private listenersPayload() {
    const users: RadioListener[] = [];
    for (const id of this.listeners.keys()) {
      const u = this.info.get(id);
      if (u) users.push(u);
      if (users.length >= LISTENERS_LIST_MAX) break;
    }
    return { count: this.listeners.size, users };
  }

  private async loadInfo(userId: string) {
    if (this.info.has(userId)) return;
    const row = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { username: true, nickname: true, avatarUrl: true } })
      .catch(() => null);
    this.info.set(userId, {
      id: userId,
      name: row?.nickname?.trim() || row?.username || '?',
      avatarUrl: row?.avatarUrl ?? null,
    });
  }

  @SubscribeMessage('radio:join')
  async join(@ConnectedSocket() client: RadioSocket) {
    const userId = client.data.userId;
    if (!userId) return { ok: false };
    await this.loadInfo(userId);
    // пока грузили профиль, сокет мог закрыться: не оставляем «призрака» в списке слушателей
    if (!client.connected) return { ok: false };
    const set = this.listeners.get(userId) ?? new Set<string>();
    set.add(client.id);
    this.listeners.set(userId, set);
    this.scheduleListenersPush();
    // свежее состояние в ответ: клиент берёт его для расчёта позиции и сдвига часов
    return { ok: true, state: this.radio.getState(), ...this.listenersPayload() };
  }

  @SubscribeMessage('radio:leave')
  leave(@ConnectedSocket() client: RadioSocket) {
    this.drop(client);
    return { ok: true };
  }

  handleDisconnect(client: RadioSocket) {
    this.drop(client);
  }

  private drop(client: RadioSocket) {
    const userId = client.data.userId;
    if (!userId) return;
    const set = this.listeners.get(userId);
    if (!set) return;
    set.delete(client.id);
    if (set.size === 0) {
      this.listeners.delete(userId);
      this.info.delete(userId);
    }
    this.scheduleListenersPush();
  }

  /** Не чаще раза в секунду: массовое подключение не должно засыпать всех сообщениями. */
  private scheduleListenersPush() {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.ns?.emit('radio:listeners', this.listenersPayload());
    }, LISTENERS_THROTTLE_MS);
    this.pushTimer.unref?.();
  }
}
