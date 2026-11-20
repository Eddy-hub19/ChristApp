/** Закреплённое сообщение чата (с сервера: RoomPinDto). */
export type RoomPin = {
  id: string;
  messageId: string;
  createdAt: string;
  pinnedById: string;
  message: {
    id: string;
    type: string;
    /** Начало текста (до 140 символов); для медиа подпись по `type` строится на клиенте. */
    content: string;
    senderId: string;
    senderName: string;
    senderAvatarUrl: string | null;
  };
};
