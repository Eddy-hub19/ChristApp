import { fetchRoomMessagesOrThrow } from "@/lib/chatMessagesApi";
import {
  readCachedMessages,
  writeCachedMessages,
} from "@/lib/chatMessageCache";
import type { RawHistoryMessage } from "@/lib/chatHistoryCache";

/** Размер первой страницы истории (сокет и HTTP); старее подгружается постранично при прокрутке вверх. */
export const HISTORY_FIRST_PAGE = 50;
/** Максимум, который за раз берём дельтой «что нового после последнего закешованного». */
const DELTA_LIMIT = 200;

const timeOf = (m: RawHistoryMessage) => {
  const ts = Date.parse(String(m.createdAt ?? ""));
  return Number.isFinite(ts) ? ts : 0;
};

/** id последнего сообщения, которое уже есть на сервере (без локальных «отправляется»). */
function lastKnownId(list: RawHistoryMessage[]): string | undefined {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const id = list[i]?.id;
    if (id !== undefined && id !== null && !String(id).startsWith("tmp-")) {
      return String(id);
    }
  }
  return undefined;
}

/** Сливает кеш с дельтой: совпавшие id берут версию с сервера, новые добавляются, порядок - по времени. */
export function mergeRawHistory(
  cached: RawHistoryMessage[],
  delta: RawHistoryMessage[],
): RawHistoryMessage[] {
  if (delta.length === 0) return cached;
  const byId = new Map<string, RawHistoryMessage>();
  for (const m of cached) byId.set(String(m.id), m);
  for (const m of delta) byId.set(String(m.id), m);
  return [...byId.values()].sort((a, b) => timeOf(a) - timeOf(b));
}

/**
 * История комнаты с локальным кешем. Есть кеш - спрашиваем у сервера только новое после последнего известного
 * сообщения (пустой ответ, если нового нет), иначе грузим первую страницу. Результат пишем обратно в кеш.
 * Правки/удаления/реакции последних сообщений догоняет сокет (joinRoom отдаёт актуальное окно).
 */
export async function loadRoomHistoryWithCache(params: {
  token: string;
  roomId: string;
  userId: string | undefined;
  timeoutMs?: number;
}): Promise<RawHistoryMessage[]> {
  const { token, roomId, userId, timeoutMs } = params;
  const cached = userId
    ? await readCachedMessages<RawHistoryMessage>(userId, roomId)
    : null;
  const afterId = cached?.length ? lastKnownId(cached) : undefined;

  const result =
    cached && afterId
      ? mergeRawHistory(
          cached,
          (await fetchRoomMessagesOrThrow({
            token,
            roomId,
            afterId,
            limit: DELTA_LIMIT,
            timeoutMs,
          })) as RawHistoryMessage[],
        )
      : ((await fetchRoomMessagesOrThrow({
          token,
          roomId,
          limit: HISTORY_FIRST_PAGE,
          timeoutMs,
        })) as RawHistoryMessage[]);

  if (userId && result.length > 0) {
    void writeCachedMessages(userId, roomId, result);
  }
  return result;
}
