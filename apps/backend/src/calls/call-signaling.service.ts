import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService, type PushSubscriptionRecord } from 'src/push/push.service';
import { presence } from 'src/chat/presence.registry';
import { CALLS_CONFIG } from './calls.config';
import { CallRegistry, type CallRecord, type StartDenied } from './call-registry';

/**
 * Сигналинг звонков. События сокета (сервер → клиент), везде есть `callId`:
 *  incoming-call {callId, channelName, roomId, initiator, ringTimeoutMs, remainingMs} - получателю (и при call-sync);
 *  call-user-sent {ok, callId, targetUserId, channelName, offline?} - инициирующему сокету;
 *  call-accepted / call-declined {callId, channelName, responder} - звонящему;
 *  call-handled {callId, accepted} - остальным устройствам получателя («ответили на другом устройстве»);
 *  call-cancelled {callId, channelName} - получателю (звонящий сбросил);
 *  call-missed {callId, channelName} - обоим (таймаут);
 *  call-busy {channelName, targetUserId} / call-unavailable {channelName, reason} - звонящему;
 *  call-state {callId, status, ended} - ответ на call-sync и на запоздалый call-response;
 *  call-error {error, code} - инициирующему сокету.
 * Клиент → сервер: call-user {targetUserId, channelName, v?: 2}, call-response {callId?, initiatorId, channelName, accepted},
 * call-cancel {callId}, call-end {callId}, call-sync {callId?}. Старые клиенты (без callId и v) продолжают работать:
 * ответ сопоставляется по паре и каналу, а недоставленные новые события для них заменяются старыми (call-error).
 */

export interface CallActor {
  id: string;
  username: string;
  nickname?: string | null;
}

/** Что сервис берёт у шлюза: доставка по пользователю и запись в чат. */
export interface CallSocketDirectory {
  emitToUser(userId: string, event: string, payload: unknown, exceptSocketId?: string): Promise<number>;
  postMissedCallMessage(input: { roomId: string; callerId: string; callId: string }): Promise<void>;
}

type Reply = (event: string, payload: unknown) => void;

interface CallRuntime {
  ringTimer: ReturnType<typeof setTimeout> | null;
  pushTimer: ReturnType<typeof setTimeout> | null;
  subs: PushSubscriptionRecord[] | null;
  pushRound: number;
  caller: { id: string; username: string; nickname: string | null; name: string; avatarUrl: string | null };
}

const DENIED_TEXT: Record<StartDenied | 'no-user' | 'not-participant' | 'unavailable', string> = {
  self: 'Нельзя позвонить самому себе',
  'rate-limited': 'Слишком много звонков, попробуйте позже',
  cooldown: 'Подождите немного перед повторным звонком',
  'caller-busy': 'Вы уже в звонке',
  'callee-busy': 'Занято',
  'no-user': 'Пользователь не найден',
  'not-participant': 'Звонить можно только в личном чате',
  unavailable: 'Недоступно',
};

@Injectable()
export class CallSignalingService implements OnModuleDestroy {
  private readonly logger = new Logger(CallSignalingService.name);
  readonly registry = new CallRegistry({ ...CALLS_CONFIG });
  private readonly runtime = new Map<string, CallRuntime>();
  private readonly goneTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private directory: CallSocketDirectory | null = null;
  private readonly sweeper: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 15_000);
    this.sweeper.unref?.();
  }

  setDirectory(directory: CallSocketDirectory) {
    this.directory = directory;
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
    for (const rt of this.runtime.values()) this.clearTimers(rt);
    for (const t of this.goneTimers.values()) clearTimeout(t);
    this.runtime.clear();
    this.goneTimers.clear();
  }

  // ---------- клиент → сервер ----------

  async callUser(actor: CallActor, body: unknown, reply: Reply) {
    const b = (body ?? {}) as { targetUserId?: unknown; channelName?: unknown; v?: unknown };
    const targetUserId = typeof b.targetUserId === 'string' ? b.targetUserId.trim() : '';
    const channelName = typeof b.channelName === 'string' ? b.channelName.trim() : '';
    const modern = b.v === 2;
    if (!targetUserId || !channelName) {
      reply('call-error', { error: 'targetUserId и channelName обязательны', code: 'bad-request' });
      return;
    }

    // 1) дешёвые проверки в памяти до любых запросов к БД (спам, «занято», кулдаун)
    const pre = this.registry.check(actor.id, targetUserId);
    if (!pre.ok) {
      this.denyCall(actor.id, targetUserId, channelName, pre.reason, modern, reply, pre.retryAfterMs);
      return;
    }

    // 2) один раз на звонок: получатель (настройка «Звонки»), профиль звонящего, личный чат пары
    const [idA, idB] = [actor.id, targetUserId].sort();
    const [callee, callerProfile, room] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, callsEnabled: true } }),
      this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { username: true, nickname: true, avatarUrl: true },
      }),
      this.prisma.room.findUnique({
        where: { title: `dm:${idA}:${idB}` },
        select: { id: true, members: { select: { userId: true } } },
      }),
    ]);
    if (!callee) {
      this.denyCall(actor.id, targetUserId, channelName, 'no-user', modern, reply);
      return;
    }
    const memberIds = new Set(room?.members.map((m) => m.userId) ?? []);
    if (!room || !memberIds.has(actor.id) || !memberIds.has(targetUserId)) {
      this.denyCall(actor.id, targetUserId, channelName, 'not-participant', modern, reply);
      return;
    }
    if (!callee.callsEnabled) {
      this.denyCall(actor.id, targetUserId, channelName, 'unavailable', modern, reply);
      return;
    }

    const started = this.registry.start({
      callerId: actor.id,
      calleeId: targetUserId,
      channelName,
      modern,
      roomId: room.id,
    });
    if (!started.ok) {
      this.denyCall(actor.id, targetUserId, channelName, started.reason, modern, reply, started.retryAfterMs);
      return;
    }
    const call = started.call;
    const name = callerProfile?.nickname?.trim() || callerProfile?.username?.trim() || actor.nickname || actor.username;
    const rt: CallRuntime = {
      ringTimer: null,
      pushTimer: null,
      subs: null,
      pushRound: 0,
      caller: {
        id: actor.id,
        username: callerProfile?.username || actor.username,
        nickname: callerProfile?.nickname || actor.nickname || null,
        name,
        avatarUrl: callerProfile?.avatarUrl || null,
      },
    };
    this.runtime.set(call.callId, rt);
    rt.ringTimer = setTimeout(() => void this.expire(call.callId), CALLS_CONFIG.ringTimeoutMs);
    rt.ringTimer.unref?.();

    const delivered = (await this.directory?.emitToUser(targetUserId, 'incoming-call', this.incomingPayload(call, rt))) ?? 0;
    reply('call-user-sent', {
      ok: true,
      callId: call.callId,
      roomId: room.id,
      targetUserId,
      channelName,
      ...(delivered === 0 ? { offline: true } : {}),
    });
    // push - если у получателя сейчас нет видимого окна приложения (сокет в фоне или его нет вовсе)
    void this.pushTick(call.callId);
    this.schedulePushRepeat(call.callId);
  }

  async callResponse(actor: CallActor, body: unknown, reply: Reply, socketId?: string) {
    const b = (body ?? {}) as { callId?: unknown; initiatorId?: unknown; channelName?: unknown; accepted?: unknown };
    const callId = typeof b.callId === 'string' ? b.callId.trim() : '';
    const initiatorId = typeof b.initiatorId === 'string' ? b.initiatorId.trim() : '';
    const channelName = typeof b.channelName === 'string' ? b.channelName.trim() : '';
    if (!callId && (!initiatorId || !channelName)) {
      reply('call-error', { error: 'initiatorId и channelName обязательны', code: 'bad-request' });
      return;
    }
    const accepted = b.accepted === true;

    const known = callId ? this.registry.get(callId) : undefined;
    const call = known ?? (callId ? undefined : this.registry.findRinging(initiatorId, actor.id, channelName));

    if (!call) {
      if (callId) {
        reply('call-state', { callId, status: 'unknown', ended: true });
        return;
      }
      // Звонок неизвестен реестру (рестарт сервера, очень старый клиент): прежнее поведение - просто переслать ответ звонящему
      await this.directory?.emitToUser(initiatorId, accepted ? 'call-accepted' : 'call-declined', {
        channelName,
        responder: { id: actor.id, username: actor.username, nickname: actor.nickname ?? null },
      });
      return;
    }
    if (call.calleeId !== actor.id) {
      reply('call-error', { error: 'Нет доступа', code: 'forbidden' });
      return;
    }
    const resolved = this.registry.resolve(call.callId, accepted ? 'accepted' : 'declined');
    if (!resolved) {
      // уже не звонит (отменён, пропущен, ответили на другом устройстве): устаревшее окно закрываем
      reply('call-state', { callId: call.callId, status: call.status, ended: true });
      return;
    }
    await this.settle(resolved, accepted ? 'accepted' : 'declined', socketId, actor);
  }

  async callCancel(actor: CallActor, body: unknown, reply: Reply) {
    const callId = typeof (body as { callId?: unknown } | null)?.callId === 'string' ? (body as { callId: string }).callId.trim() : '';
    const call = callId ? this.registry.get(callId) : this.registry.activeFor(actor.id);
    if (!call || call.callerId !== actor.id) {
      if (callId) reply('call-state', { callId, status: call?.status ?? 'unknown', ended: true });
      return;
    }
    const resolved = this.registry.resolve(call.callId, 'cancelled');
    if (!resolved) {
      reply('call-state', { callId: call.callId, status: call.status, ended: call.status !== 'accepted' });
      return;
    }
    await this.settle(resolved, 'cancelled');
  }

  /** Принятый звонок закончился: освобождаем «занято» (иначе оба оставались бы занятыми до предела). */
  callEnd(actor: CallActor, body: unknown) {
    const callId = typeof (body as { callId?: unknown } | null)?.callId === 'string' ? (body as { callId: string }).callId.trim() : '';
    const call = callId ? this.registry.get(callId) : this.registry.activeFor(actor.id);
    if (!call || (call.callerId !== actor.id && call.calleeId !== actor.id)) return;
    this.registry.end(call.callId);
    this.dropRuntime(call.callId);
  }

  /** Клиент (открыл приложение, нажал на push) спрашивает про звонок: если ещё звонит - получатель снова получает incoming-call. */
  async callSync(actor: CallActor, body: unknown, reply: Reply) {
    const callId = typeof (body as { callId?: unknown } | null)?.callId === 'string' ? (body as { callId: string }).callId.trim() : '';
    const ringing = this.registry.ringingFor(actor.id);
    if (ringing && (!callId || ringing.callId === callId)) {
      const rt = this.runtime.get(ringing.callId);
      if (rt) reply('incoming-call', this.incomingPayload(ringing, rt));
      return;
    }
    if (callId) {
      const known = this.registry.get(callId);
      reply('call-state', { callId, status: known?.status ?? 'unknown', ended: !known || known.status !== 'ringing' });
    }
  }

  // ---------- жизненный цикл соединений ----------

  /** Пользователь снова на связи: отменяем «пропал». */
  onUserConnected(userId: string) {
    const t = this.goneTimers.get(userId);
    if (t) {
      clearTimeout(t);
      this.goneTimers.delete(userId);
    }
  }

  /** Последний сокет пользователя закрылся: звонящий пропал → отмена; участник принятого звонка пропал → конец (после паузы). */
  onUserDisconnected(userId: string) {
    const call = this.registry.activeFor(userId);
    if (!call) return;
    const ringingCaller = call.status === 'ringing' && call.callerId === userId;
    const grace = ringingCaller ? CALLS_CONFIG.callerGoneGraceMs : call.status === 'accepted' ? CALLS_CONFIG.acceptedGoneGraceMs : 0;
    if (!grace) return;
    const prev = this.goneTimers.get(userId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.goneTimers.delete(userId);
      if (presence.socketCount(userId) > 0) return;
      const current = this.registry.activeFor(userId);
      if (!current || current.callId !== call.callId) return;
      if (current.status === 'ringing' && current.callerId === userId) {
        const resolved = this.registry.resolve(current.callId, 'cancelled');
        if (resolved) void this.settle(resolved, 'cancelled');
      } else if (current.status === 'accepted') {
        this.registry.end(current.callId);
        this.dropRuntime(current.callId);
      }
    }, grace);
    timer.unref?.();
    this.goneTimers.set(userId, timer);
  }

  // ---------- внутреннее ----------

  private incomingPayload(call: CallRecord, rt: CallRuntime) {
    return {
      callId: call.callId,
      channelName: call.channelName,
      roomId: call.roomId,
      initiator: { ...rt.caller },
      ringTimeoutMs: CALLS_CONFIG.ringTimeoutMs,
      remainingMs: Math.max(0, CALLS_CONFIG.ringTimeoutMs - (Date.now() - call.createdAt)),
    };
  }

  /** Отказ в звонке: клиенту нового образца - своё событие, старому - привычный call-error. */
  private denyCall(
    callerId: string,
    targetUserId: string,
    channelName: string,
    reason: StartDenied | 'no-user' | 'not-participant' | 'unavailable',
    modern: boolean,
    reply: Reply,
    retryAfterMs?: number,
  ) {
    const error = DENIED_TEXT[reason];
    if (modern && reason === 'callee-busy') {
      reply('call-busy', { channelName, targetUserId });
    } else if (modern && reason === 'unavailable') {
      reply('call-unavailable', { channelName, reason: 'disabled' });
    } else {
      reply('call-error', { error, code: reason, ...(retryAfterMs ? { retryAfterMs } : {}) });
    }
    this.logger.log(`call denied reason=${reason} caller=${callerId}`);
  }

  /** Звонок получил итог (принят, отклонён, отменён, пропущен): события, push, таймеры. */
  private async settle(
    call: CallRecord,
    how: 'accepted' | 'declined' | 'cancelled' | 'missed',
    socketId?: string,
    responder?: CallActor,
  ) {
    const rt = this.runtime.get(call.callId);
    if (rt) this.clearTimers(rt);
    const dir = this.directory;
    const base = { callId: call.callId, channelName: call.channelName };

    if (how === 'accepted' || how === 'declined') {
      await dir?.emitToUser(call.callerId, how === 'accepted' ? 'call-accepted' : 'call-declined', {
        ...base,
        responder: {
          id: call.calleeId,
          username: responder?.username,
          nickname: responder?.nickname ?? null,
        },
      });
      // остальные устройства получателя закрывают своё окно «входящий»
      await dir?.emitToUser(call.calleeId, 'call-handled', { callId: call.callId, accepted: how === 'accepted' }, socketId);
    } else if (how === 'cancelled') {
      await dir?.emitToUser(call.calleeId, 'call-cancelled', base);
      await dir?.emitToUser(call.callerId, 'call-cancelled', base);
    } else {
      await dir?.emitToUser(call.calleeId, 'call-missed', base);
      await dir?.emitToUser(call.callerId, 'call-missed', base);
    }

    // push: закрыть «звонит» (ответили/сбросили) или заменить его на «пропущенный»
    if (rt) {
      const hadRing = call.pushesSent > 0;
      if (how === 'missed') {
        if (hadRing || !presence.hasVisibleDevice(call.calleeId)) await this.pushOnce(call, rt, 'missed');
      } else if (hadRing) {
        await this.pushOnce(call, rt, 'cancel');
      }
    }

    if (how === 'missed' && call.modern && call.roomId) {
      void dir?.postMissedCallMessage({ roomId: call.roomId, callerId: call.callerId, callId: call.callId }).catch((error: unknown) => {
        this.logger.warn(`missed-call message failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    if (how !== 'accepted') this.dropRuntime(call.callId);
  }

  private async expire(callId: string) {
    const resolved = this.registry.resolve(callId, 'missed');
    if (resolved) await this.settle(resolved, 'missed');
  }

  /** Один пуш «звонит», если у получателя сейчас нет видимого окна приложения. */
  private async pushTick(callId: string) {
    const call = this.registry.get(callId);
    const rt = this.runtime.get(callId);
    if (!call || !rt || call.status !== 'ringing') return;
    if (presence.hasVisibleDevice(call.calleeId)) return;
    await this.pushOnce(call, rt, 'ring');
  }

  private schedulePushRepeat(callId: string) {
    const rt = this.runtime.get(callId);
    if (!rt) return;
    if (rt.pushRound >= CALLS_CONFIG.pushMaxRepeats) return;
    rt.pushTimer = setTimeout(() => {
      const current = this.runtime.get(callId);
      if (!current) return;
      current.pushRound += 1;
      void this.pushTick(callId);
      this.schedulePushRepeat(callId);
    }, CALLS_CONFIG.pushRepeatEveryMs);
    rt.pushTimer.unref?.();
  }

  private async pushOnce(call: CallRecord, rt: CallRuntime, what: 'ring' | 'cancel' | 'missed') {
    try {
      if (rt.subs === null) rt.subs = await this.push.loadCallSubscriptions(call.calleeId);
      if (!rt.subs.length) return;
      const results = await this.push.sendCallPush({
        what,
        callId: call.callId,
        callerId: call.callerId,
        callerName: rt.caller.name,
        subscriptions: rt.subs,
        repeat: rt.pushRound,
      });
      if (what === 'ring' && results.some((r) => r.ok)) this.registry.markPushSent(call.callId);
      // устаревшие подписки (404/410) уже удалены в БД: выкидываем и из памяти
      rt.subs = rt.subs.filter((_, i) => !results[i]?.removed);
    } catch (error) {
      this.logger.warn(`call push failed (${what}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private clearTimers(rt: CallRuntime) {
    if (rt.ringTimer) clearTimeout(rt.ringTimer);
    if (rt.pushTimer) clearTimeout(rt.pushTimer);
    rt.ringTimer = null;
    rt.pushTimer = null;
  }

  private dropRuntime(callId: string) {
    const rt = this.runtime.get(callId);
    if (rt) this.clearTimers(rt);
    this.runtime.delete(callId);
  }

  private sweep() {
    for (const call of this.registry.sweep()) this.dropRuntime(call.callId);
    for (const id of this.runtime.keys()) {
      const call = this.registry.get(id);
      if (!call || call.endedAt !== null) this.dropRuntime(id);
    }
  }
}
