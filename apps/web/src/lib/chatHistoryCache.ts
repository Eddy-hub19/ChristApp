import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Дзеркало історії кімнати в кеші React Query (сирі повідомлення сервера). Сокет-події (нове, правка, видалення,
 * реакції, «прослухано») застосовуються до цього масиву чистими функціями й записуються через `setQueryData`,
 * а не інвалідацією — повторного HTTP-запиту всієї історії не потрібно.
 */
export type RawHistoryMessage = {
  id?: string | number;
  roomId?: string;
  content?: string;
  isEdited?: boolean;
  reactions?: unknown[];
  voiceListens?: Array<{ userId?: string }>;
  replyTo?: { id?: string | number; deleted?: boolean } | null;
  [key: string]: unknown;
};

const sameId = (a: unknown, b: unknown) =>
  a !== undefined && a !== null && String(a) === String(b);

export function appendRawMessage<T extends RawHistoryMessage>(
  list: T[],
  message: T,
): T[] {
  if (message.id === undefined || message.id === null) return list;
  if (list.some((item) => sameId(item.id, message.id))) return list;
  return [...list, message];
}

export function patchRawMessage<T extends RawHistoryMessage>(
  list: T[],
  messageId: string | number,
  patch: Partial<RawHistoryMessage>,
): T[] {
  let changed = false;
  const next = list.map((item) => {
    if (!sameId(item.id, messageId)) return item;
    changed = true;
    return { ...item, ...patch };
  });
  return changed ? next : list;
}

/** Видаляє повідомлення і позначає цитати на нього як видалені (як це робить UI). */
export function removeRawMessage<T extends RawHistoryMessage>(
  list: T[],
  messageId: string | number,
): T[] {
  if (!list.some((item) => sameId(item.id, messageId))) return list;
  return list
    .filter((item) => !sameId(item.id, messageId))
    .map((item) =>
      item.replyTo && sameId(item.replyTo.id, messageId)
        ? { ...item, replyTo: { ...item.replyTo, deleted: true } }
        : item,
    );
}

export function addRawVoiceListen<T extends RawHistoryMessage>(
  list: T[],
  messageId: string | number,
  userId: string,
): T[] {
  let changed = false;
  const next = list.map((item) => {
    if (!sameId(item.id, messageId)) return item;
    if (item.voiceListens?.some((l) => l.userId === userId)) return item;
    changed = true;
    return { ...item, voiceListens: [...(item.voiceListens ?? []), { userId }] };
  });
  return changed ? next : list;
}

/** Записує актуальний масив у кеш історії кімнати (без інвалідації й без запиту). */
export function writeHistoryCache<T extends RawHistoryMessage>(
  queryClient: QueryClient,
  roomId: string | null | undefined,
  messages: T[],
) {
  if (!roomId) return;
  queryClient.setQueryData(queryKeys.chat.history(roomId), messages);
}

/**
 * Нове повідомлення в кімнаті, чиєї сторінки зараз немає на екрані: дописуємо до вже закешованої історії.
 * Якщо історії в кеші нема — нічого не створюємо (частковий список ввів би в оману); якщо кімната відкрита
 * (є спостерігачі) — її веде сама сторінка.
 */
export function appendToCachedHistory(
  queryClient: QueryClient,
  roomId: string | null | undefined,
  message: RawHistoryMessage,
) {
  if (!roomId) return;
  const key = queryKeys.chat.history(roomId);
  const query = queryClient.getQueryCache().find({ queryKey: key });
  if (!query || query.getObserversCount() > 0) return;
  const current = query.state.data as RawHistoryMessage[] | undefined;
  if (!Array.isArray(current)) return;
  const next = appendRawMessage(current, message);
  if (next !== current) queryClient.setQueryData(key, next);
}
