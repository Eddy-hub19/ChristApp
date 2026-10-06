import { getGameActivityDef } from './game-activity.registry';

/** Без heartbeat (клієнт шле раз на ~15 с) статус знімається за цей час — щоб не «залипав». */
export const ACTIVITY_TTL_MS = 30_000;
/** Не більше стількох подій `presence:activity` від одного сокета за вікно (heartbeat сюди теж входить). */
export const ACTIVITY_RATE_LIMIT = 8;
export const ACTIVITY_RATE_WINDOW_MS = 10_000;

export type ActivityUser = { id: string; username: string };

export type PublicActivity = {
  roomId: string;
  userId: string;
  username: string;
  game: string;
  joinable: boolean;
  sessionId: string;
};

type Entry = {
  roomId: string;
  game: string;
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

  /** false — сокет перевищив ліміт, подію слід відкинути. */
  allow(socketId: string, now: number): boolean {
    const recent = (this.rate.get(socketId) ?? []).filter(
      (ts) => now - ts < ACTIVITY_RATE_WINDOW_MS,
    );
    if (recent.length >= ACTIVITY_RATE_LIMIT) {
      this.rate.set(socketId, recent);
      return false;
    }
    recent.push(now);
    this.rate.set(socketId, recent);
    return true;
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
  ): string[] {
    const prev = this.bySocket.get(socketId);
    const def = game === null ? undefined : getGameActivityDef(game);
    if (game !== null && !def) return [];

    if (!def) {
      if (!prev) return [];
      this.bySocket.delete(socketId);
      return [prev.roomId];
    }

    if (prev && prev.roomId === roomId && prev.game === def.id) {
      prev.lastBeat = now;
      return [];
    }
    this.bySocket.set(socketId, { roomId, game: def.id, user, lastBeat: now });
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
    const players = new Map<string, number>();
    for (const entry of perUser.values()) {
      players.set(entry.game, (players.get(entry.game) ?? 0) + 1);
    }
    return [...perUser.values()].map((entry) => {
      const def = getGameActivityDef(entry.game);
      return {
        roomId,
        userId: entry.user.id,
        username: entry.user.username,
        game: entry.game,
        joinable:
          Boolean(def?.joinable) &&
          (players.get(entry.game) ?? 0) < (def?.maxPlayers ?? 0),
        sessionId: `${roomId}:${entry.game}`,
      };
    });
  }

  activeRoomIds(): string[] {
    return [...new Set([...this.bySocket.values()].map((e) => e.roomId))];
  }
}
