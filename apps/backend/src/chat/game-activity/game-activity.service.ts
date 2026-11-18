import {
  getGameActivityDef,
  parseGameActivityMode,
} from './game-activity.registry';

/**
 * Без heartbeat (клієнт шле раз на ~15 с) статус знімається за цей час — щоб не «залипав».
 * Запас у 4 інтервали: фонова вкладка з throttled-таймерами не має «блимати».
 */
export const ACTIVITY_TTL_MS = 60_000;
/** Не більше стількох подій `presence:activity` від одного сокета за вікно (heartbeat сюди теж входить). */
export const ACTIVITY_RATE_LIMIT = 8;
export const ACTIVITY_RATE_WINDOW_MS = 10_000;

export type ActivityUser = { id: string; username: string };

export type PublicActivity = {
  roomId: string;
  userId: string;
  username: string;
  game: string;
  /** Режим гри (Snake: classic | duel); undefined — ще в лобі. */
  mode?: string;
  joinable: boolean;
  sessionId: string;
};

type Entry = {
  roomId: string;
  game: string;
  mode?: string;
  user: ActivityUser;
  lastBeat: number;
};

/**
 * «Хто зараз у якій грі» — лише в пам'яті, без БД і пушів.
 * Один сокет = не більше однієї активності (відкрив іншу гру/кімнату — попередня замінюється).
 */
export class GameActivityService {
  private readonly bySocket = new Map<string, Entry>();
  private readonly rate = new Map<string, number[]>();
  /** Скільки подій відкинуто лімітом (для діагностики; логуємо не частіше разу на вікно). */
  private droppedTotal = 0;
  private lastDropLogAt = 0;

  /** Скільки подій `presence:activity` відкинуто лімітом від старту процесу. */
  get droppedCount(): number {
    return this.droppedTotal;
  }

  /**
   * Реєструє відкинуту подію; true — час записати в лог (не частіше разу на вікно), щоб не засипати логи.
   */
  noteDropped(now: number): boolean {
    this.droppedTotal += 1;
    if (now - this.lastDropLogAt < ACTIVITY_RATE_WINDOW_MS) return false;
    this.lastDropLogAt = now;
    return true;
  }

  /**
   * false — сокет перевищив ліміт, подію слід відкинути. `critical` (зміна гри/режиму, зняття статусу)
   * не відкидається ніколи, але теж записується у вікно, тож heartbeat-и після нього притримуються.
   */
  allow(socketId: string, now: number, critical = false): boolean {
    const recent = (this.rate.get(socketId) ?? []).filter(
      (ts) => now - ts < ACTIVITY_RATE_WINDOW_MS,
    );
    if (recent.length >= ACTIVITY_RATE_LIMIT) {
      if (critical) {
        recent.push(now);
        this.rate.set(socketId, recent);
        return true;
      }
      this.rate.set(socketId, recent);
      return false;
    }
    recent.push(now);
    this.rate.set(socketId, recent);
    return true;
  }

  /** true — подія змінює видимий стан (нова гра/кімната/режим або зняття статусу), а не просто heartbeat. */
  isStateChange(
    socketId: string,
    roomId: string,
    game: string | null,
    rawMode?: unknown,
  ): boolean {
    const prev = this.bySocket.get(socketId);
    if (game === null) return Boolean(prev);
    const def = getGameActivityDef(game);
    if (!def) return false;
    if (!prev || prev.roomId !== roomId || prev.game !== def.id) return true;
    return prev.mode !== parseGameActivityMode(def.id, rawMode);
  }

  /**
   * Виставляє (game) або знімає (null) активність сокета й повертає кімнати, де змінився
   * видимий стан; heartbeat тієї ж гри лише продовжує TTL і нічого не повертає.
   */
  set(
    socketId: string,
    user: ActivityUser,
    roomId: string,
    game: string | null,
    now: number,
    rawMode?: unknown,
  ): string[] {
    const prev = this.bySocket.get(socketId);
    const def = game === null ? undefined : getGameActivityDef(game);
    if (game !== null && !def) return [];

    if (!def) {
      if (!prev) return [];
      this.bySocket.delete(socketId);
      return [prev.roomId];
    }

    const mode = parseGameActivityMode(def.id, rawMode);
    if (prev && prev.roomId === roomId && prev.game === def.id) {
      prev.lastBeat = now;
      if (prev.mode === mode) return [];
      // Той самий гравець перейшов в інший режим (напр., Класика → Дуель): видимий стан змінився.
      prev.mode = mode;
      return [roomId];
    }
    this.bySocket.set(socketId, {
      roomId,
      game: def.id,
      mode,
      user,
      lastBeat: now,
    });
    return prev && prev.roomId !== roomId ? [prev.roomId, roomId] : [roomId];
  }

  removeSocket(socketId: string): string[] {
    this.rate.delete(socketId);
    const prev = this.bySocket.get(socketId);
    if (!prev) return [];
    this.bySocket.delete(socketId);
    return [prev.roomId];
  }

  /** Знімає протухлі статуси; повертає кімнати, які змінились. */
  sweep(now: number): string[] {
    const rooms = new Set<string>();
    for (const [socketId, entry] of this.bySocket) {
      if (now - entry.lastBeat > ACTIVITY_TTL_MS) {
        this.bySocket.delete(socketId);
        rooms.add(entry.roomId);
      }
    }
    return [...rooms];
  }

  /** Активності кімнати: одна на людину (береться найсвіжіша). `joinable` рахується тут, на сервері. */
  snapshot(roomId: string): PublicActivity[] {
    const perUser = new Map<string, Entry>();
    for (const entry of this.bySocket.values()) {
      if (entry.roomId !== roomId) continue;
      const cur = perUser.get(entry.user.id);
      if (!cur || entry.lastBeat > cur.lastBeat)
        perUser.set(entry.user.id, entry);
    }
    // Місця рахуємо в межах режиму: Дуель може бути зайнята, а до Класики приєднатись усе ще можна.
    const seatKey = (entry: Entry) => `${entry.game}:${entry.mode ?? ''}`;
    const players = new Map<string, number>();
    for (const entry of perUser.values()) {
      players.set(seatKey(entry), (players.get(seatKey(entry)) ?? 0) + 1);
    }
    return [...perUser.values()].map((entry) => {
      const def = getGameActivityDef(entry.game);
      return {
        roomId,
        userId: entry.user.id,
        username: entry.user.username,
        game: entry.game,
        ...(entry.mode ? { mode: entry.mode } : {}),
        joinable:
          Boolean(def?.joinable) &&
          (players.get(seatKey(entry)) ?? 0) < (def?.maxPlayers ?? 0),
        sessionId: `${roomId}:${entry.game}`,
      };
    });
  }

  activeRoomIds(): string[] {
    return [...new Set([...this.bySocket.values()].map((e) => e.roomId))];
  }
}
