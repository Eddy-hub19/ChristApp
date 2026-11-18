/**
 * Хто зараз ДИВИТЬСЯ на кімнату: застосунок відкритий і видимий, ця кімната (чат або зала кінотеатру) на екрані.
 * Лише таким людям пуш не шлемо. Облік по сокету: розрив сокета знімає «перегляд» миттєво,
 * а клієнт додатково знімає його запитом із keepalive при згортанні/блокуванні (сокет iOS тоді ще живий кілька секунд).
 *
 * Один процес — один реєстр (модульний синглтон, як і сокети, що в ньому живуть).
 */
export const CHAT_VIEW_KEY = (roomId: string) => `chat:${roomId}`;
export const WATCH_VIEW_KEY = (roomId: string) => `watch:${roomId}`;

export class RoomViewRegistry {
  /** socketId → (userId, ключі кімнат, які цей сокет зараз тримає на екрані). */
  private readonly sockets = new Map<string, { userId: string; keys: Set<string> }>();

  setViewing(socketId: string, userId: string, key: string, active: boolean) {
    let entry = this.sockets.get(socketId);
    if (!active) {
      if (!entry) return;
      entry.keys.delete(key);
      if (!entry.keys.size) this.sockets.delete(socketId);
      return;
    }
    if (!entry) {
      entry = { userId, keys: new Set() };
      this.sockets.set(socketId, entry);
    }
    entry.keys.add(key);
  }

  /** Сокет відключився або клієнт повідомив «я більше не дивлюсь»: знімаємо всі його перегляди. */
  clearSocket(socketId: string, onlyForUserId?: string) {
    const entry = this.sockets.get(socketId);
    if (!entry) return false;
    if (onlyForUserId && entry.userId !== onlyForUserId) return false;
    this.sockets.delete(socketId);
    return true;
  }

  viewerIds(key: string): string[] {
    const ids = new Set<string>();
    for (const { userId, keys } of this.sockets.values()) {
      if (keys.has(key)) ids.add(userId);
    }
    return [...ids];
  }

  isViewing(userId: string, key: string) {
    for (const entry of this.sockets.values()) {
      if (entry.userId === userId && entry.keys.has(key)) return true;
    }
    return false;
  }
}

export const roomViews = new RoomViewRegistry();
