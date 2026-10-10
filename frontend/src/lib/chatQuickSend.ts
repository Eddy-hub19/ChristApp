import createSocket from "socket.io-client";
import { getDirectApiOrigin } from "@/lib/apiBase";
import type { MyRoomItem } from "@/types/chat/socket.types";

type Sock = ReturnType<typeof createSocket>;

export interface QuickChat {
  rooms(): Promise<MyRoomItem[]>;
  send(roomId: string, content: string): Promise<boolean>;
  close(): void;
}

/**
 * Короткоживучий чат-сокет для разових відправок з-поза екрана чату (запрошення з гри).
 * Список кімнат - подією `getMyRooms`, повідомлення - `sendMessage` (з `clientMessageId`, як у чаті).
 */
export function openQuickChat(token: string): QuickChat {
  const socket: Sock = createSocket(getDirectApiOrigin(), {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  });

  const whenConnected = () =>
    new Promise<void>((resolve, reject) => {
      if (socket.connected) return resolve();
      const timer = setTimeout(() => reject(new Error("timeout")), 8000);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("connect_error", () => {
        clearTimeout(timer);
        reject(new Error("connect_error"));
      });
    });

  return {
    async rooms() {
      await whenConnected();
      return new Promise<MyRoomItem[]>((resolve) => {
        const timer = setTimeout(() => resolve([]), 8000);
        socket.once("myRooms", (data: { rooms?: MyRoomItem[] }) => {
          clearTimeout(timer);
          resolve(data?.rooms ?? []);
        });
        socket.emit("getMyRooms");
      });
    },
    async send(roomId, content) {
      try {
        await whenConnected();
      } catch {
        return false;
      }
      return new Promise<boolean>((resolve) => {
        const clientMessageId = `flock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        // ехо з нашим clientMessageId = сервер прийняв повідомлення
        const onEcho = (m: { clientMessageId?: string }) => {
          if (m?.clientMessageId === clientMessageId) {
            cleanup();
            resolve(true);
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve(false);
        }, 8000);
        const cleanup = () => {
          clearTimeout(timer);
          socket.off("newMessage", onEcho);
        };
        socket.on("newMessage", onEcho);
        socket.emit("sendMessage", { roomId, content, clientMessageId });
      });
    },
    close() {
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
