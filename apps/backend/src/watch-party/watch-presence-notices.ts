/**
 * Службові рядки чату Киношки про вихід/вхід учасників.
 *
 * Сервер сам вирішує, коли показувати подію (за таймерами присутності), щоб у всіх було однаково:
 * — явний вихід (закрив мініплеєр, пішов з кімнати) — рядок одразу;
 * — зникнення сокета (вкладку закрито, застосунок згорнуто, обрив мережі) — рядок, лише якщо людина
 *   не повернулась за `AWAY_GRACE_MS`; коротке перепідключення не показується взагалі;
 * — повернення протягом `BACK_WINDOW_MS` після показаного «вийшов» — той самий рядок стає «знову в залі»;
 * — повернення пізніше — окремий рядок «приєднався».
 */

export type PresenceEvent = 'left' | 'joined' | 'back';

export type PresenceNoticeData = {
  event: PresenceEvent;
  /** ISO-час події; для «back» — час повернення (рядок сидить на місці «left»). */
  at: string;
  /** Той, хто вийшов, був хостом. */
  wasHost?: boolean;
  /** Керування перейшло до цього користувача. */
  toUserId?: string;
  /** Хост пішов, передати не було кому — показ на паузі. */
  paused?: boolean;
};

export const AWAY_GRACE_MS = 30_000;
export const BACK_WINDOW_MS = 2 * 60_000;
/** Не більше стількох нових рядків на людину в кімнаті за вікно — захист від «блимання» мережі. */
const MAX_NOTICES_PER_WINDOW = 6;
const NOTICE_WINDOW_MS = 10 * 60_000;

export type PresenceNoticeDeps = {
  /** Скільки чекати, поки хост-вихідець передасть керування (HOST_GRACE_MS + запас). */
  hostHandoverDelayMs: number;
  /** Створює SYSTEM-повідомлення й розсилає його; повертає id або null, якщо не вдалося. */
  create: (
    roomId: string,
    userId: string,
    data: PresenceNoticeData,
  ) => Promise<string | null>;
  /** Змінює дані наявного SYSTEM-повідомлення й розсилає оновлення. */
  update: (
    roomId: string,
    messageId: string,
    data: PresenceNoticeData,
  ) => Promise<void>;
  /** Останнє службове повідомлення людини в кімнаті (після рестарту сервера стан в памʼяті втрачено). */
  lastEvent: (roomId: string, userId: string) => Promise<PresenceEvent | null>;
  isJoined: (roomId: string, userId: string) => Promise<boolean>;
  /** Кому дісталось керування / чи пауза; викликається в момент публікації «left» для хоста. */
  hostOutcome: (
    roomId: string,
    userId: string,
  ) => { toUserId?: string; paused?: boolean };
  onError?: (error: unknown) => void;
  now?: () => number;
};

type PairState = {
  timer: ReturnType<typeof setTimeout> | null;
  /** Сокетів немає, людина «відсутня». */
  away: boolean;
  wasHost: boolean;
  leftMessageId: string | null;
  leftAt: number;
  created: number[];
};

export class PresenceNotices {
  private readonly pairs = new Map<string, PairState>();
  private readonly now: () => number;

  constructor(private readonly deps: PresenceNoticeDeps) {
    this.now = deps.now ?? Date.now;
  }

  private key(roomId: string, userId: string) {
    return `${roomId}:${userId}`;
  }

  /**
   * Останній сокет людини в залі зник.
   * `immediate` — вихід уже остаточний (вийшла з кімнати, передача хоста вже відбулась).
   */
  departed(
    roomId: string,
    userId: string,
    opts: { explicit: boolean; wasHost: boolean; immediate?: boolean },
  ) {
    const key = this.key(roomId, userId);
    let state = this.pairs.get(key);
    if (!state) {
      state = this.freshState();
      this.pairs.set(key, state);
    }
    // Уже відсутня й рядок «left» вже показано — нічого не дублюємо.
    if (state.away && state.leftMessageId) return;
    if (state.timer && !opts.explicit) return;

    state.away = true;
    state.wasHost = state.wasHost || opts.wasHost;
    if (state.timer) clearTimeout(state.timer);

    const delay = opts.immediate
      ? 0
      : opts.explicit
        ? state.wasHost
          ? this.deps.hostHandoverDelayMs
          : 0
        : AWAY_GRACE_MS;
    const fire = () => {
      state.timer = null;
      void this.publishLeft(roomId, userId, state, opts.immediate === true).catch(
        (e) => this.deps.onError?.(e),
      );
    };
    if (delay === 0) {
      state.timer = null;
      fire();
    } else {
      state.timer = setTimeout(fire, delay);
    }
  }

  /** Перший сокет людини зʼявився в залі. */
  arrived(roomId: string, userId: string) {
    void this.handleArrival(roomId, userId).catch((e) => this.deps.onError?.(e));
  }

  clearRoom(roomId: string) {
    for (const [key, state] of this.pairs) {
      if (!key.startsWith(`${roomId}:`)) continue;
      if (state.timer) clearTimeout(state.timer);
      this.pairs.delete(key);
    }
  }

  dispose() {
    for (const state of this.pairs.values()) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.pairs.clear();
  }

  private freshState(): PairState {
    return {
      timer: null,
      away: false,
      wasHost: false,
      leftMessageId: null,
      leftAt: 0,
      created: [],
    };
  }

  private allowCreate(state: PairState) {
    const now = this.now();
    state.created = state.created.filter((t) => now - t < NOTICE_WINDOW_MS);
    if (state.created.length >= MAX_NOTICES_PER_WINDOW) return false;
    state.created.push(now);
    return true;
  }

  private async publishLeft(
    roomId: string,
    userId: string,
    state: PairState,
    skipMembershipCheck: boolean,
  ) {
    if (!state.away) return;
    if (!skipMembershipCheck && !(await this.deps.isJoined(roomId, userId))) {
      this.pairs.delete(this.key(roomId, userId));
      return;
    }
    if (!state.away || !this.allowCreate(state)) return;

    const outcome = state.wasHost ? this.deps.hostOutcome(roomId, userId) : {};
    const data: PresenceNoticeData = {
      event: 'left',
      at: new Date(this.now()).toISOString(),
      ...(state.wasHost ? { wasHost: true } : {}),
      ...outcome,
    };
    const id = await this.deps.create(roomId, userId, data);
    if (!id) return;
    state.leftMessageId = id;
    state.leftAt = this.now();
    // Людина встигла повернутись, поки писали рядок: одразу перетворюємо його на «знову в залі».
    if (!state.away) await this.markBack(roomId, state, id);
  }

  private async markBack(roomId: string, state: PairState, messageId: string) {
    state.leftMessageId = null;
    await this.deps.update(roomId, messageId, {
      event: 'back',
      at: new Date(this.now()).toISOString(),
    });
  }

  private async handleArrival(roomId: string, userId: string) {
    const key = this.key(roomId, userId);
    const state = this.pairs.get(key);

    if (!state) {
      // Стану немає: перший візит або рестарт сервера. Якщо востаннє людину вже показали «в залі» — мовчимо.
      const fresh = this.freshState();
      this.pairs.set(key, fresh);
      const last = await this.deps.lastEvent(roomId, userId);
      if (last === 'joined' || last === 'back') return;
      if (!this.allowCreate(fresh)) return;
      await this.deps.create(roomId, userId, {
        event: 'joined',
        at: new Date(this.now()).toISOString(),
      });
      return;
    }

    const wasAway = state.away;
    state.away = false;
    state.wasHost = false;

    // Коротке перепідключення: «left» ще не показували — ні вихід, ні вхід не публікуємо.
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
      return;
    }
    if (!wasAway) return;

    const leftId = state.leftMessageId;
    if (!leftId) return;
    if (this.now() - state.leftAt <= BACK_WINDOW_MS) {
      await this.markBack(roomId, state, leftId);
      return;
    }
    state.leftMessageId = null;
    if (!this.allowCreate(state)) return;
    await this.deps.create(roomId, userId, {
      event: 'joined',
      at: new Date(this.now()).toISOString(),
    });
  }
}
