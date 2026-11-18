/** Кеш поточного користувача (синхронно з useAuth і списком /users). */
import { queryKeys } from "@/lib/queryKeys";

export const AUTH_ME_QUERY_ROOT = queryKeys.auth.root;

export function currentUserQueryKey(userId: string | undefined) {
  return queryKeys.auth.me(userId);
}
