import { queryKeys } from "@/lib/queryKeys";

export function chatMyRoomsQueryKey(userId: string | null | undefined) {
  return queryKeys.chat.list(userId);
}
