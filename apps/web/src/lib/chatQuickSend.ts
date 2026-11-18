import createSocket from "socket.io-client";
import { getDirectApiOrigin } from "@/lib/apiBase";
import type { MyRoomItem } from "@/types/chat/socket.types";

type Sock = ReturnType<typeof createSocket>;

export type QuickSendResult =
  | { ok: true }
  /** `retryAfterSec` — сервер відмовив через ліміт частоти (запрошення в «Отару» в загальний чат). */
  | { ok: false; retryAfterSec?: number };

export interface QuickChat {
  /** З `lastMessageAt` у кожній кімнаті — для сортування списку за активністю. */
  rooms(): Promise<MyRoomItem[]>;
  send(roomId: string, content: string): Promise<QuickSendResult>;
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
        socket.emit("getMyRooms", { withLastMessageAt: true });
      });
    },
    async send(roomId, content) {
      try {
        await whenConnected();
      } catch {
        return { ok: false };
      }
      return new Promise<QuickSendResult>((resolve) => {
        const clientMessageId = `flock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        // ехо з нашим clientMessageId = сервер прийняв повідомлення
        const onEcho = (m: { clientMessageId?: string }) => {
          if (m?.clientMessageId === clientMessageId) {
            cleanup();
            resolve({ ok: true });
          }
        };
        const onRateLimited = (m: { clientMessageId?: string; retryAfterSec?: number }) => {
          if (m?.clientMessageId === clientMessageId) {
            cleanup();
            resolve({ ok: false, retryAfterSec: m.retryAfterSec ?? 60 });
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve({ ok: false });
        }, 8000);
        const cleanup = () => {
          clearTimeout(timer);
          socket.off("newMessage", onEcho);
          socket.off("flockInviteRateLimited", onRateLimited);
        };
        socket.on("newMessage", onEcho);
        socket.on("flockInviteRateLimited", onRateLimited);
        socket.emit("sendMessage", { roomId, content, clientMessageId });
      });
    },
    close() {
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
