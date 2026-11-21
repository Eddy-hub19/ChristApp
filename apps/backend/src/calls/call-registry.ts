import { randomUUID } from 'crypto';
import type { CallsConfig } from './calls.config';

/** ringing → accepted | declined | cancelled | missed; busy - попытка, отбитая «занято» (запись не создаётся). */
export type CallStatus =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'missed';

export interface CallRecord {
  callId: string;
  callerId: string;
  calleeId: string;
  channelName: string;
  status: CallStatus;
  createdAt: number;
  /** Когда звонок перестал быть активным (ответ, отказ, отмена, таймаут, конец принятого). */
  endedAt: number | null;
  /** Звонящий - клиент нового образца (шлёт v: 2): только ему и его звонкам пишется системная запись. */
  modern: boolean;
  /** Личный чат пары (для системной записи); null - не нашли. */
  roomId: string | null;
  /** Сколько push «звонит» уже ушло (0 - ни одного: отменять и «закрывать» нечего). */
  pushesSent: number;
}

export type StartDenied =
  | 'self'
  | 'rate-limited'
  | 'cooldown'
  | 'caller-busy'
  | 'callee-busy';

export type StartResult =
  | { ok: true; call: CallRecord }
  | { ok: false; reason: StartDenied; retryAfterMs?: number };

const isActive = (c: CallRecord) =>
  c.endedAt === null && (c.status === 'ringing' || c.status === 'accepted');

/**
 * Состояние звонков в памяти: никаких запросов к БД на события звонка. Один процесс - один реестр
 * (как presence и roomViews). Время и генератор id подменяются в проверках.
 */
export class CallRegistry {
  private readonly calls = new Map<string, CallRecord>();
  /** userId → callId активного (ringing/accepted) звонка: «один активный звонок на пользователя». */
  private readonly activeByUser = new Map<string, string>();
  /** `${callerId}>${calleeId}` → время последнего принятого к обработке звонка. */
  private readonly lastCallAt = new Map<string, number>();
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly config: CallsConfig,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = randomUUID,
  ) {}

  /** Проверки (спам, занято) и создание записи. Не трогает БД: права и настройки проверяет вызывающий ДО start. */
  start(input: {
    callerId: string;
    calleeId: string;
    channelName: string;
    modern: boolean;
    roomId: string | null;
  }): StartResult {
    // попытка уже посчитана в check() до походов в БД: здесь повторяем лишь проверки состояния
    const check = this.check(input.callerId, input.calleeId, false);
    if (!check.ok) return check;
    const t = this.now();
    const call: CallRecord = {
      callId: this.newId(),
      callerId: input.callerId,
      calleeId: input.calleeId,
      channelName: input.channelName,
      status: 'ringing',
      createdAt: t,
      endedAt: null,
      modern: input.modern,
      roomId: input.roomId,
      pushesSent: 0,
    };
    this.calls.set(call.callId, call);
    this.activeByUser.set(call.callerId, call.callId);
    this.activeByUser.set(call.calleeId, call.callId);
    this.lastCallAt.set(`${input.callerId}>${input.calleeId}`, t);
    return { ok: true, call };
  }

  /**
   * Дешёвые проверки без побочных эффектов, кроме учёта попытки: счётчик спама растёт при каждом вызове
   * (в том числе неудачном), чтобы перебор не был бесплатным. Порядок: сам себе → спам → «занято» → кулдаун.
   */
  check(
    callerId: string,
    calleeId: string,
    countAttempt = true,
  ): { ok: true } | { ok: false; reason: StartDenied; retryAfterMs?: number } {
    if (callerId === calleeId) return { ok: false, reason: 'self' };
    const t = this.now();
    if (countAttempt) {
      const window = this.attempts.get(callerId)?.filter((x) => t - x < this.config.attemptsWindowMs) ?? [];
      if (window.length >= this.config.attemptsMax) {
        this.attempts.set(callerId, window);
        return { ok: false, reason: 'rate-limited', retryAfterMs: this.config.attemptsWindowMs - (t - window[0]) };
      }
      window.push(t);
      this.attempts.set(callerId, window);
    }
    if (this.activeFor(callerId)) return { ok: false, reason: 'caller-busy' };
    if (this.activeFor(calleeId)) return { ok: false, reason: 'callee-busy' };
    const last = this.lastCallAt.get(`${callerId}>${calleeId}`);
    if (last !== undefined && t - last < this.config.perPeerCooldownMs) {
      return { ok: false, reason: 'cooldown', retryAfterMs: this.config.perPeerCooldownMs - (t - last) };
    }
    return { ok: true };
  }

  get(callId: string): CallRecord | undefined {
    return this.calls.get(callId);
  }

  /** Активный (звонит или идёт) звонок пользователя. */
  activeFor(userId: string): CallRecord | undefined {
    const id = this.activeByUser.get(userId);
    const call = id ? this.calls.get(id) : undefined;
    if (call && isActive(call)) return call;
    if (id) this.activeByUser.delete(userId);
    return undefined;
  }

  /** Звонящий звонит получателю: для старых клиентов, что отвечают без callId (по паре и каналу). */
  findRinging(callerId: string, calleeId: string, channelName?: string): CallRecord | undefined {
    const call = this.activeFor(calleeId);
    if (!call || call.status !== 'ringing' || call.callerId !== callerId) return undefined;
    if (channelName && call.channelName !== channelName) return undefined;
    return call;
  }

  /** Звонок, который сейчас звонит этому получателю. */
  ringingFor(calleeId: string): CallRecord | undefined {
    const call = this.activeFor(calleeId);
    return call && call.status === 'ringing' && call.calleeId === calleeId ? call : undefined;
  }

  /** ringing → accepted | declined | cancelled | missed. Возвращает запись, если переход состоялся. */
  resolve(callId: string, to: Exclude<CallStatus, 'ringing'>): CallRecord | undefined {
    const call = this.calls.get(callId);
    if (!call || call.status !== 'ringing' || call.endedAt !== null) return undefined;
    call.status = to;
    if (to !== 'accepted') this.release(call);
    return call;
  }

  /** Принятый звонок закончился (клиент сообщил, участник пропал, истёк предел). */
  end(callId: string): CallRecord | undefined {
    const call = this.calls.get(callId);
    if (!call || call.status !== 'accepted' || call.endedAt !== null) return undefined;
    this.release(call);
    return call;
  }

  markPushSent(callId: string) {
    const call = this.calls.get(callId);
    if (call) call.pushesSent += 1;
  }

  /** Чистка: старые принятые звонки без конца, завершённые записи и учёт спама. Дёшево, раз в десяток секунд. */
  sweep(): CallRecord[] {
    const t = this.now();
    const expired: CallRecord[] = [];
    for (const call of this.calls.values()) {
      if (call.endedAt === null && call.status === 'accepted' && t - call.createdAt > this.config.acceptedMaxMs) {
        this.release(call);
        expired.push(call);
      } else if (call.endedAt !== null && t - call.endedAt > this.config.finishedKeepMs) {
        this.calls.delete(call.callId);
      }
    }
    for (const [k, last] of this.lastCallAt) if (t - last > this.config.perPeerCooldownMs) this.lastCallAt.delete(k);
    for (const [k, list] of this.attempts) {
      const live = list.filter((x) => t - x < this.config.attemptsWindowMs);
      if (live.length) this.attempts.set(k, live);
      else this.attempts.delete(k);
    }
    return expired;
  }

  private release(call: CallRecord) {
    call.endedAt = this.now();
    if (this.activeByUser.get(call.callerId) === call.callId) this.activeByUser.delete(call.callerId);
    if (this.activeByUser.get(call.calleeId) === call.callId) this.activeByUser.delete(call.calleeId);
  }
}
