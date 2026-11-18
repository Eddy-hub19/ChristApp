"use client";

import { useEffect, useState } from "react";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";

type OnlinePayload = { userIds?: string[] };
type PresencePayload = { userId?: string; isOnline?: boolean; lastSeenAt?: string | null };

/** Хто зараз онлайн в застосунку і коли останні вийшли — з живих подій присутності (для списків людей). */
export function usePresenceOnline(enabled = true) {
  const { socket } = usePresenceSocket();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());
  const [lastSeenById, setLastSeenById] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!socket || !enabled) return;
    const onOnline = (payload: OnlinePayload) => {
      setOnlineIds(new Set(Array.isArray(payload?.userIds) ? payload.userIds : []));
    };
    const onChanged = (payload: PresencePayload) => {
      const { userId, isOnline, lastSeenAt } = payload ?? {};
      if (!userId || isOnline || !lastSeenAt) return;
      setLastSeenById((prev) => new Map(prev).set(userId, lastSeenAt));
    };
    socket.on("onlineUsers", onOnline);
    socket.on("userPresenceChanged", onChanged);
    // Список приходить лише при підключенні й зміні — просимо актуальний, бо компонент відкрили пізніше.
    socket.emit("getOnlineUsers");
    return () => {
      socket.off("onlineUsers", onOnline);
      socket.off("userPresenceChanged", onChanged);
    };
  }, [socket, enabled]);

  return { onlineIds, lastSeenById };
}
