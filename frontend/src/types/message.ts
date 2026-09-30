export type AppMessageType = "TEXT" | "VOICE" | "IMAGE" | "FILE" | "VIDEO_NOTE";
/** Емодзі реакції. Набір, що пропонується, — CHAT_REACTIONS; старі реакції (напр. 🤍) теж відображаються. */
export type AppReactionType = string;

export type MessageReply = {
  id: string;
  username: string;
  content: string;
  type?: AppMessageType;
  fileUrl?: string | null;
  /** Оригінал видалено — цитата показує "Повідомлення видалено". */
  deleted?: boolean;
};

export type Message = {
  sender?: string;
  id: string;
  /** Відображуване ім'я (нік). */
  username: string;
  /** Унікальний @username (латиниця, нижній регістр). */
  handle?: string;
  senderId?: string;
  content: string;
  type?: AppMessageType;
  fileUrl?: string | null;
  createdAt: string;
  isEdited?: boolean;
  replyTo?: MessageReply;
  reactions?: Array<{
    id: string;
    userId: string;
    type: AppReactionType;
    createdAt: string;
  }>;
};

type ChatUser = { id: string; username: string; nickname?: string };

export function isMessageFromCurrentUser(
  message: Message,
  user: ChatUser | null | undefined,
): boolean {
  if (!user) return false;
  if (message.sender === "me") return true;
  if (message.username === "Ты") return true;
  if (message.senderId && message.senderId === user.id) return true;
  if (message.handle && message.handle === user.username) return true;
  if (!message.senderId && !message.handle) {
    return (
      message.username === user.username || message.username === user.nickname
    );
  }
  return false;
}
