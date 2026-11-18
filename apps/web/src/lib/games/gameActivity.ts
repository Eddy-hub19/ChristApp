import { GLOBAL_ROOM_ID } from "@/lib/chatRooms";
import { isGameId, type GameId } from "@/lib/games/gameRegistry";

export type GameActivity = {
  roomId: string;
  userId: string;
  username: string;
  game: GameId;
  /** Рахує сервер: гра мультиплеєрна й у сесії ще є місце. */
  joinable: boolean;
  sessionId: string;
};

/** Heartbeat кожні ~15 с; сервер знімає статус, якщо тиші більше ~30 с. */
export const GAME_ACTIVITY_HEARTBEAT_MS = 15_000;
/** У чаті показуємо не більше стількох рядків (різні ігри), решта — «+N». */
export const GAME_ACTIVITY_MAX_LINES = 2;

/** У загальному чаті статус не показуємо та не шлемо — там забагато учасників. */
export function isGameActivityRoom(roomId: string | null | undefined): roomId is string {
  return Boolean(roomId) && roomId !== GLOBAL_ROOM_ID;
}

export function parseGameActivities(raw: unknown, selfUserId?: string | null): GameActivity[] {
  if (!Array.isArray(raw)) return [];
  const out: GameActivity[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.roomId !== "string" ||
      typeof r.userId !== "string" ||
      typeof r.username !== "string" ||
      !isGameId(r.game)
    ) {
      continue;
    }
    if (selfUserId && r.userId === selfUserId) continue;
    out.push({
      roomId: r.roomId,
      userId: r.userId,
      username: r.username,
      game: r.game,
      joinable: r.joinable === true,
      sessionId: typeof r.sessionId === "string" ? r.sessionId : `${r.roomId}:${r.game}`,
    });
  }
  return out;
}

export type GameActivityLine = {
  game: GameId;
  names: string[];
  /** Є ким приєднатися: хоч одна з цих активностей joinable. */
  joinable: boolean;
  /** Сесія, до якої можна приєднатися (з першої joinable-активності). */
  sessionId: string | null;
};

/** Групує за грою: «Ед і Neko грають у Snake», різні ігри — окремими рядками (до MAX, далі «+N»). */
export function groupGameActivities(activities: GameActivity[]): {
  lines: GameActivityLine[];
  hiddenLines: number;
} {
  const byGame = new Map<GameId, GameActivityLine>();
  for (const a of activities) {
    const line = byGame.get(a.game) ?? {
      game: a.game,
      names: [],
      joinable: false,
      sessionId: null,
    };
    line.names.push(a.username);
    if (a.joinable && !line.joinable) {
      line.joinable = true;
      line.sessionId = a.sessionId;
    }
    byGame.set(a.game, line);
  }
  const all = [...byGame.values()];
  return {
    lines: all.slice(0, GAME_ACTIVITY_MAX_LINES),
    hiddenLines: Math.max(0, all.length - GAME_ACTIVITY_MAX_LINES),
  };
}
