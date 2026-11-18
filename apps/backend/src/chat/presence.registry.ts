/**
 * «Онлайн» = застосунок хоча б на одному пристрої користувача ЗАРАЗ відкритий і видимий на екрані (як у Telegram).
 * Саме з'єднання сокета нічого не означає: на телефоні й у згорнутій вкладці сокет лишається живим довго.
 *
 * Облік по сокету (один сокет = один «пристрій»):
 *  - клієнт шле `active` при відкритті/поверненні в застосунок і heartbeat раз на ~20 с, поки застосунок видно;
 *  - `away` (сокет-подія або fetch keepalive) знімає онлайн цього пристрою негайно;
 *  - немає heartbeat 45 с → пристрій вважається таким, що пішов (на випадок, коли `away` не дійшов);
 *  - розрив сокета знімає пристрій, але офлайн користувача публікується з дебаунсом 5 с (швидкі перепідключення
 *    не мають блимати), а явний `away`/таймаут — без затримки.
 * Користувач онлайн, поки активний хоча б один пристрій. Реєстр лише в пам'яті: після рестарту бекенду
 * ніхто не онлайн, доки не надішле `active` (а `lastSeenAt` живе в БД і не губиться).
 *
 * Один процес — один реєстр (модульний синглтон, як і `roomViews`).
 */
export const PRESENCE_AWAY_AFTER_MS = 45_000;
export const PRESENCE_DISCONNECT_DEBOUNCE_MS = 5_000;
const SWEEP_INTERVAL_MS = 5_000;

export type PresenceChange = {
  userId: string;
  isOnline: boolean;
  /** Коли користувач востаннє був у мережі; для переходу в онлайн — null. */
  lastSeenAt: Date | null;
};

type Device = { userId: string; active: boolean; lastBeat: number };
type Listener = (change: PresenceChange) => void;

export class PresenceRegistry {
  private readonly devices = new Map<string, Device>();
  /** Опублікований стан: хто зараз вважається онлайн (до дебаунсу — включно з тими, кого вже відпускаємо). */
  private readonly online = new Set<string>();
  private readonly pendingOffline = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; since: number }
  >();
  private readonly listeners = new Set<Listener>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  onChange(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Запускає страхувальний обхід «немає heartbeat». Викликається при старті застосунку. */
  start() {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  /** Зупиняє всі таймери (graceful shutdown / тести). Стан не чіпає. */
  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const { timer } of this.pendingOffline.values()) clearTimeout(timer);
    this.pendingOffline.clear();
  }

  /** Забуває всіх: після старту бекенду ніхто не онлайн, доки не надішле `active`. Слухачів не сповіщає. */
  reset() {
    this.stop();
    this.devices.clear();
    this.online.clear();
  }

  /**
   * Новий сокет: пристрій відомий, але НЕ активний, доки клієнт не скаже, що застосунок видно.
   * Ідемпотентний: клієнт шле `presence:state` одразу на `connect`, і цей кадр може обігнати
   * реєстрацію в handleConnection — повторна реєстрація не має скидати вже активний пристрій.
   */
  connect(socketId: string, userId: string) {
    if (this.devices.has(socketId)) return;
    this.devices.set(socketId, { userId, active: false, lastBeat: Date.now() });
  }

  /**
   * `active: true` — застосунок видно (відкриття, повернення, heartbeat); `false` — згорнули/заблокували/закрили.
   * `onlyForUserId` — для HTTP-запиту: чужий сокет чіпати не можна. Повертає, чи сокет відомий.
   */
  setActive(socketId: string, active: boolean, onlyForUserId?: string) {
    const device = this.devices.get(socketId);
    if (!device) return false;
    if (onlyForUserId && device.userId !== onlyForUserId) return false;
    const now = Date.now();
    device.lastBeat = now;
    if (device.active === active && active) {
      // heartbeat: стан не змінився, але вже могло бути відкладене зняття онлайну — evaluate його скасує
      this.evaluate(device.userId, 'active', now);
      return true;
    }
    device.active = active;
    this.evaluate(device.userId, active ? 'active' : 'away', now);
    return true;
  }

  /** Сокет розірвано: пристрій зникає; офлайн користувача — з дебаунсом. */
  disconnect(socketId: string) {
    const device = this.devices.get(socketId);
    if (!device) return;
    this.devices.delete(socketId);
    this.evaluate(device.userId, 'disconnect', Date.now());
  }

  isOnline(userId: string) {
    return this.online.has(userId);
  }

  onlineUserIds() {
    return Array.from(this.online);
  }

  /** Скільки сокетів користувача відкрито (незалежно від того, активні вони чи ні). */
  socketCount(userId: string) {
    let count = 0;
    for (const device of this.devices.values()) {
      if (device.userId === userId) count += 1;
    }
    return count;
  }

  private hasActiveDevice(userId: string) {
    for (const device of this.devices.values()) {
      if (device.userId === userId && device.active) return true;
    }
    return false;
  }

  private sweep() {
    const now = Date.now();
    const staleLastBeat = new Map<string, number>();
    for (const device of this.devices.values()) {
      if (!device.active || now - device.lastBeat <= PRESENCE_AWAY_AFTER_MS) {
        continue;
      }
      device.active = false;
      staleLastBeat.set(
        device.userId,
        Math.max(staleLastBeat.get(device.userId) ?? 0, device.lastBeat),
      );
    }
    for (const [userId, lastBeat] of staleLastBeat) {
      this.evaluate(userId, 'stale', lastBeat);
    }
  }

  private evaluate(
    userId: string,
    reason: 'active' | 'away' | 'stale' | 'disconnect',
    at: number,
  ) {
    if (this.hasActiveDevice(userId)) {
      this.cancelPending(userId);
      if (!this.online.has(userId)) {
        this.online.add(userId);
        this.emit({ userId, isOnline: true, lastSeenAt: null });
      }
      return;
    }
    if (!this.online.has(userId)) return;

    if (reason === 'disconnect') {
      // Розрив сокета може бути перезавантаженням вкладки/мережевим кульгання — даємо шанс повернутись.
      if (!this.pendingOffline.has(userId)) {
        const timer = setTimeout(() => {
          this.pendingOffline.delete(userId);
          if (!this.hasActiveDevice(userId)) this.goOffline(userId, at);
        }, PRESENCE_DISCONNECT_DEBOUNCE_MS);
        timer.unref?.();
        this.pendingOffline.set(userId, { timer, since: at });
      }
      return;
    }

    // Явний `away` або таймаут heartbeat — без затримки (і відкладений розрив більше не потрібен).
    this.cancelPending(userId);
    this.goOffline(userId, at);
  }

  private goOffline(userId: string, at: number) {
    if (!this.online.delete(userId)) return;
    this.emit({ userId, isOnline: false, lastSeenAt: new Date(at) });
  }

  private cancelPending(userId: string) {
    const pending = this.pendingOffline.get(userId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingOffline.delete(userId);
  }

  private emit(change: PresenceChange) {
    for (const listener of this.listeners) listener(change);
  }
}

export const presence = new PresenceRegistry();
