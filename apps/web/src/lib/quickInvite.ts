import createSocket from "socket.io-client";
import { getDirectApiOrigin } from "@/lib/apiBase";

type Sock = ReturnType<typeof createSocket>;

export type InviteSendResult =
  | { ok: true }
  /** `retryAfterSec` — сервер відмовив через ліміт частоти (запрошення в «Отару» у загальний чат). */
  | { ok: false; retryAfterSec?: number };

export interface QuickInviteClient {
  /** Відкриває (або створює) особисту кімнату з користувачем і повертає її id. */
  openDirect(targetUserId: string): Promise<string | null>;
  send(roomId: string, content: string): Promise<InviteSendResult>;
  /** Id власної кімнати «Поділися з Ісусом» (контейнер для одиночних ігор із сервером, напр. Пазлів). */
  resolveSelfRoom(): Promise<string | null>;
  /** Сам сокет — для ігор, що працюють поверх нього (закривається разом із `close`). */
  readonly socket: Sock;
  close(): void;
}

/**
 * Короткоживучий чат-сокет для разової відправки запрошення з-поза екрана кімнати
 * (загальний чат → «Отара» усім / виклик конкретної людини на гру). Повідомлення йдуть тим самим
 * `sendMessage` з `clientMessageId`, що й у чаті; ехо з нашим id = сервер прийняв.
 */
export function openQuickInvite(token: string): QuickInviteClient {
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
    socket,
    async resolveSelfRoom() {
      try {
        await whenConnected();
      } catch {
        return null;
      }
      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          socket.off("shareWithJesusRoomIdResolved", onResolved);
          resolve(null);
        }, 8000);
        const onResolved = (p: { ok?: boolean; roomId?: string }) => {
          clearTimeout(timer);
          socket.off("shareWithJesusRoomIdResolved", onResolved);
          resolve(p?.ok && p.roomId ? p.roomId : null);
        };
        socket.on("shareWithJesusRoomIdResolved", onResolved);
        socket.emit("resolveShareWithJesusRoomId");
      });
    },
    async openDirect(targetUserId) {
      try {
        await whenConnected();
      } catch {
        return null;
      }
      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          socket.off("directRoomOpened", onOpened);
          resolve(null);
        }, 8000);
        const onOpened = (p: { roomId?: string; targetUserId?: string }) => {
          if (p?.targetUserId !== targetUserId) return;
          clearTimeout(timer);
          socket.off("directRoomOpened", onOpened);
          resolve(p.roomId ?? null);
        };
        socket.on("directRoomOpened", onOpened);
        socket.emit("openDirectRoom", { targetUserId });
      });
    },
    async send(roomId, content) {
      try {
        await whenConnected();
      } catch {
        return { ok: false };
      }
      return new Promise<InviteSendResult>((resolve) => {
        const clientMessageId = `invite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
