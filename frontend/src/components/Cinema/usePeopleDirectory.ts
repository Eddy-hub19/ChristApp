"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";
import { getDirectTargetUserId, type RoomSocketItem } from "@/lib/chatRooms";
import {
  fetchUsersDirectory,
  usersDirectoryQueryKey,
} from "@/lib/queries/usersQueries";
import { filterTesterUsers } from "@/lib/testerUsers";

export type DirectoryPerson = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  /** Є особистий чат із цією людиною — показуємо першою. */
  isChatPartner: boolean;
};

/** Люди для запрошення: співрозмовники з особистих чатів + увесь довідник для пошуку. */
export function usePeopleDirectory(currentUserId: string | undefined) {
  const { socket } = usePresenceSocket();
  const [partnerIds, setPartnerIds] = useState<Set<string>>(() => new Set());

  const directory = useQuery({
    queryKey: usersDirectoryQueryKey(),
    queryFn: fetchUsersDirectory,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!socket || !currentUserId) return;
    const onMyRooms = (payload: { rooms?: RoomSocketItem[] }) => {
      const ids = new Set<string>();
      for (const room of payload?.rooms ?? []) {
        const peer = getDirectTargetUserId(room.title, currentUserId);
        if (peer) ids.add(peer);
      }
      setPartnerIds(ids);
    };
    socket.on("myRooms", onMyRooms);
    socket.emit("getMyRooms");
    return () => {
      socket.off("myRooms", onMyRooms);
    };
  }, [socket, currentUserId]);

  const people = useMemo<DirectoryPerson[]>(() => {
    const rows = filterTesterUsers(
      (directory.data ?? []) as Array<{
        id: string;
        username?: string;
        nickname?: string | null;
        avatarUrl?: string | null;
        isActive?: boolean;
      }>,
    );
    return rows
      .filter((u) => u.id !== currentUserId && u.isActive !== false)
      .map((u) => ({
        id: u.id,
        username: u.username ?? "",
        nickname: u.nickname ?? null,
        avatarUrl: u.avatarUrl ?? null,
        isChatPartner: partnerIds.has(u.id),
      }));
  }, [directory.data, currentUserId, partnerIds]);

  return { people, isLoading: directory.isLoading };
}
