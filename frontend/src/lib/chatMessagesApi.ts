import { getHttpApiBase } from "@/lib/apiBase";
import { apiFetch } from "@/lib/apiFetch";

const API_URL = getHttpApiBase();

type FetchRoomMessagesParams = {
  token: string;
  roomId: string;
  limit?: number;
  skip?: number;
  /** Обрив зависшого запиту (холодний старт бекенду), щоб спрацював повтор. */
  timeoutMs?: number;
};

/** Помилка історії зі статусом HTTP: за ним вирішуємо, чи є сенс повторювати запит. */
export class RoomHistoryHttpError extends Error {
  constructor(readonly status: number) {
    super(`Не удалось загрузить историю комнаты (${status})`);
  }
}

export async function fetchRoomMessagesOrThrow({
  token,
  roomId,
  limit = 250,
  skip = 0,
  timeoutMs,
}: FetchRoomMessagesParams) {
  const response = await apiFetch(
    `${API_URL}/messages/room?roomId=${encodeURIComponent(roomId)}&limit=${limit}&skip=${skip}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      timeoutMs,
    },
  );

  if (!response.ok) {
    throw new RoomHistoryHttpError(response.status);
  }

  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed)
      ? (parsed as Array<Record<string, unknown>>)
      : [];
  } catch {
    throw new Error("История комнаты пришла в неверном формате");
  }
}

type FetchOlderRoomMessagesParams = {
  token: string;
  roomId: string;
  /** Повідомлення, старіше за яке треба дозавантажити (найстаріше з уже показаних). */
  beforeId: string;
  /** Догрузити історію щонайменше до цього повідомлення (оригінал цитати). */
  untilId?: string;
};

/** Старша частина історії кімнати — для переходу до цитати, якої ще немає у списку. */
export async function fetchOlderRoomMessages({
  token,
  roomId,
  beforeId,
  untilId,
}: FetchOlderRoomMessagesParams) {
  const query = new URLSearchParams({ roomId, beforeId });
  if (untilId) query.set("untilId", untilId);
  query.set("limit", "300");
  const response = await apiFetch(`${API_URL}/messages/room/older?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Не удалось догрузить историю (${response.status})`);
  }
  const parsed = (await response.json()) as {
    messages?: Array<Record<string, unknown>>;
    hasMore?: boolean;
  };
  return {
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    hasMore: Boolean(parsed.hasMore),
  };
}
