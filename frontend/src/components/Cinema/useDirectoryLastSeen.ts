"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePresenceOnline } from "@/hooks/usePresenceOnline";
import { laterIso } from "@/lib/memberActivity";
import { fetchUsersDirectory, usersDirectoryQueryKey } from "@/lib/queries/usersQueries";

/** userId → lastSeenAt: довідник (з відновленням по повідомленнях/входах) + живі виходи з мережі. */
export function useDirectoryLastSeen(): Map<string, string> {
  const directory = useQuery({
    queryKey: usersDirectoryQueryKey(),
    queryFn: fetchUsersDirectory,
    staleTime: 60_000,
  });
  const { lastSeenById } = usePresenceOnline();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const row of directory.data ?? []) {
      const seen = laterIso(row.lastSeenAt as string | null | undefined, lastSeenById.get(row.id));
      if (seen) map.set(row.id, seen);
    }
    return map;
  }, [directory.data, lastSeenById]);
}
