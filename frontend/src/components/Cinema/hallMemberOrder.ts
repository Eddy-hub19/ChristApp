import { sortByActivity } from "@/lib/memberActivity";
import type { HallMember } from "./useWatchHall";

/** Учасники зали за активністю: у залі зараз → недавно заходили → давно (lastSeenAt з довідника). */
export function orderHallMembers(
  members: readonly HallMember[],
  presentIds: Set<string>,
  lastSeenById: Map<string, string>,
): HallMember[] {
  return sortByActivity(
    members.filter((m) => m.status === "JOINED"),
    (m) => ({
      name: m.nickname || m.username,
      isOnline: presentIds.has(m.id),
      lastSeenAt: lastSeenById.get(m.id),
    }),
  );
}
