import { queryKeys } from "@/lib/queryKeys";

export function chatRoomHistoryQueryKey(roomId: string | null | undefined) {
  return queryKeys.chat.history(roomId);
}
