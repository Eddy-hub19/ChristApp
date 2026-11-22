/**
 * Тонкие помощники над `track()` для событий, которым нужна доменная логика (классификация, без передачи данных).
 * Вызывающий код отдаёт сюда сырые значения (id комнаты, текст), наружу они не уходят — только категория.
 */
import { GLOBAL_ROOM_ID } from "@/lib/chatRooms";
import { track, type AnalyticsEvents } from "@/lib/analytics";

const MENTION = /(^|\s)@[\p{L}\p{N}_]{2,}/u;

export function chatKindOfRoom(roomId: string | null | undefined): "dm" | "global" {
  return roomId === GLOBAL_ROOM_ID ? "global" : "dm";
}

/** Отправка сообщения в чат: только тип и вид чата. Текст используется лишь для проверки на @упоминание и не отправляется. */
export function trackChatMessageSent(
  kind: AnalyticsEvents["chat_message_sent"]["kind"],
  roomId: string | null | undefined,
  text?: string,
): void {
  track("chat_message_sent", { kind, chat: chatKindOfRoom(roomId) });
  if (text && MENTION.test(text)) track("mention_used");
}

/** Секунды, округлённые до целого и ограниченные сверху (защита от «залипших» таймеров). */
export function secondsSince(startedAtMs: number): number {
  return Math.min(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)), 24 * 3600);
}
