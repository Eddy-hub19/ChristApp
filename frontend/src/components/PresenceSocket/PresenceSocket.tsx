"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import createSocket from "socket.io-client";
import { getDirectApiOrigin } from "@/lib/apiBase";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { attachPresenceReporter } from "@/lib/presenceReporter";
import { usePathname } from "@/i18n/navigation";
import { getCinemaSessionActive, subscribeCinemaSession } from "@/lib/cinemaSessionStore";

const WS_URL = getDirectApiOrigin();
type PresenceSocket = ReturnType<typeof createSocket>;

type PresenceSocketContextValue = {
  socket: PresenceSocket | null;
  isConnected: boolean;
};

const PresenceSocketContext = createContext<PresenceSocketContextValue>({
  socket: null,
  isConnected: false,
});

export function usePresenceSocket() {
  return useContext(PresenceSocketContext);
}

type PresenceSocketProviderProps = {
  children: ReactNode;
};

const PresenceSocketProvider = ({ children }: PresenceSocketProviderProps) => {
  const pathname = usePathname();
  // Активна сесія «Кіношки» (зала або мініплеєр) тримає сокет і на /chat/<id>, інакше синхронізація обірветься.
  const cinemaSessionActive = useSyncExternalStore(
    subscribeCinemaSession,
    getCinemaSessionActive,
    () => false,
  );
  const shouldUsePresenceSocket =
    cinemaSessionActive || pathname === "/chat" || !pathname?.startsWith("/chat/");
  const socketRef = useRef<PresenceSocket | null>(null);
  const currentTokenRef = useRef<string | null>(null);
  const detachPresenceRef = useRef<(() => void) | null>(null);
  const [socket, setSocket] = useState<PresenceSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const detachPresence = () => {
      detachPresenceRef.current?.();
      detachPresenceRef.current = null;
    };

    const disconnectSocket = () => {
      detachPresence();
      currentTokenRef.current = null;
      setIsConnected(false);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
    };

    const syncPresenceSocket = async () => {
      if (!shouldUsePresenceSocket) {
        disconnectSocket();
        return;
      }

      let token = getAuthToken();
      if (!token) {
        try {
          token = await ensureAccessToken();
        } catch {
          token = null;
        }
      }

      if (!token) {
        disconnectSocket();
        return;
      }

      const hasTokenChanged = currentTokenRef.current !== token;
      if (socketRef.current && !hasTokenChanged) {
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
        return;
      }

      if (socketRef.current) {
        detachPresence();
        socketRef.current.disconnect();
      }

      const nextSocket = createSocket(WS_URL, {
        auth: { token },
        transports: ["websocket"],
      });
      nextSocket.on("connect", () => setIsConnected(true));
      nextSocket.on("disconnect", () => setIsConnected(false));
      // «Онлайн» = застосунок видно, а не «сокет підключений» — див. presenceReporter.
      detachPresenceRef.current = attachPresenceReporter(nextSocket);

      socketRef.current = nextSocket;
      setSocket(nextSocket);
      setIsConnected(nextSocket.connected);
      currentTokenRef.current = token;
    };

    void syncPresenceSocket();

    const onAuthChanged = () => {
      void syncPresenceSocket();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("focus", onAuthChanged);
    document.addEventListener("visibilitychange", onAuthChanged);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("focus", onAuthChanged);
      document.removeEventListener("visibilitychange", onAuthChanged);
      disconnectSocket();
    };
  }, [shouldUsePresenceSocket]);

  const contextValue = useMemo(
    () => ({
      socket,
      isConnected,
    }),
    [isConnected, socket],
  );

  return (
    <PresenceSocketContext.Provider value={contextValue}>
      {children}
    </PresenceSocketContext.Provider>
  );
};

export default PresenceSocketProvider;
