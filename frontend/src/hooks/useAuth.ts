"use client";

import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAppBadgeIfSupported } from "@/lib/appBadge";
import {
  AUTH_ME_QUERY_ROOT,
  currentUserQueryKey,
} from "@/lib/queries/authQueries";
import {
  usersDirectoryQueryKey,
  usersDirectoryQueryOptions,
} from "@/lib/queries/usersQueries";
import { getAuthToken, setAuthToken } from "@/lib/auth";
import { saveRecentAuthIdentity } from "@/lib/authAutocomplete";
import {
  getNetworkFailureHint,
  messageFromApiResponseBody,
} from "@/lib/apiError";
import { recordDailyVisit } from "@/lib/appStreak";
import { filterTesterUsers } from "@/lib/testerUsers";
import { applyUserAppearanceToDocument } from "@/lib/userAppearance";
import {
  fetchCurrentUser,
  getAuthSessionSnapshot,
  initializeApp,
  loginWithPassword,
  registerWithPassword,
  logout as performLogout,
  patchAuthenticatedUser,
  refreshToken,
  setAuthenticatedUser as setAuthenticatedUserStore,
  subscribeAuthSession,
  type AuthSessionPayload,
  type AuthUser,
} from "@/lib/authSession";

export type { AuthSessionPayload, AuthUser } from "@/lib/authSession";

type UseAuthOptions = {
  redirectIfUnauthenticated?: string;
};

const EMPTY_USERS: AuthUser[] = [];

/** Тестові акаунти ховаємо при читанні, а не в кеші: ключ спільний з іншими споживачами довідника. */
function selectVisibleUsers(list: unknown): AuthUser[] {
  return Array.isArray(list)
    ? filterTesterUsers(list as AuthUser[])
    : EMPTY_USERS;
}

function mergeUserIntoDirectoryList(
  list: AuthUser[] | undefined,
  nextUser: AuthUser,
): AuthUser[] | undefined {
  if (!Array.isArray(list)) {
    return list;
  }
  let found = false;
  const mapped = list.map((row) => {
    if (row.id !== nextUser.id) {
      return row;
    }
    found = true;
    return { ...row, ...nextUser };
  });
  return found ? mapped : list;
}

export function useAuth(options?: UseAuthOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const redirectIfUnauthenticated = options?.redirectIfUnauthenticated;

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authSnapshot = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getAuthSessionSnapshot,
  );
  const user = authSnapshot.user;
  const loading = !authSnapshot.initialized;

  /** Довідник людей — один запит на всю сесію (кеш RQ, 5 хв), а не /users на кожен монтаж сторінки. */
  const directoryQuery = useQuery({
    ...usersDirectoryQueryOptions(),
    enabled: Boolean(user),
    select: selectVisibleUsers,
  });
  const users = directoryQuery.data ?? EMPTY_USERS;

  const setAuthenticatedUser = useCallback(
    (u: AuthUser) => {
      setAuthenticatedUserStore(u);
      applyUserAppearanceToDocument(u);
      queryClient.setQueryData(currentUserQueryKey(u.id), u);
    },
    [queryClient],
  );

  const clearAuthenticatedUser = useCallback(() => {
    setAuthenticatedUserStore(null);
    applyUserAppearanceToDocument(null);
    queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_ROOT });
  }, [queryClient]);

  const replaceUser = useCallback(
    (u: AuthUser) => {
      setAuthenticatedUser(u);
      queryClient.setQueryData(usersDirectoryQueryKey(), (list) =>
        mergeUserIntoDirectoryList(list as AuthUser[] | undefined, u),
      );
    },
    [queryClient, setAuthenticatedUser],
  );

  const patchUser = useCallback(
    (patch: Partial<AuthUser>) => {
      if (!user) {
        return;
      }
      const next = { ...user, ...patch } as AuthUser;
      queryClient.setQueryData(currentUserQueryKey(next.id), next);
      queryClient.setQueryData(usersDirectoryQueryKey(), (list) => {
        if (!Array.isArray(list)) {
          return list;
        }
        return list.map((row) =>
          row.id === next.id ? ({ ...row, ...patch } as AuthUser) : row,
        );
      });
      applyUserAppearanceToDocument(next);
      patchAuthenticatedUser(patch);
    },
    [queryClient, user],
  );

  /** Примусове оновлення довідника (після зміни профілю/сесії): інвалідуємо ключ, активні спостерігачі перезапитають. */
  const fetchUsers = useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: usersDirectoryQueryKey() }),
    [queryClient],
  );

  const applyAuthPayload = useCallback(
    (data: AuthSessionPayload) => {
      setAuthToken(data.access_token);
      if (data.user) {
        setAuthenticatedUser(data.user);
        recordDailyVisit();
      }
      void fetchUsers();
    },
    [fetchUsers, setAuthenticatedUser],
  );

  const checkAuth = useCallback(async () => {
    try {
      await initializeApp();
      const snapshot = getAuthSessionSnapshot();
      if (!snapshot.user) {
        clearAuthenticatedUser();
        if (redirectIfUnauthenticated) {
          router.push(redirectIfUnauthenticated);
        }
        return;
      }

      setAuthenticatedUser(snapshot.user);
      recordDailyVisit();
    } catch {
      clearAuthenticatedUser();
    }
  }, [
    clearAuthenticatedUser,
    redirectIfUnauthenticated,
    router,
    setAuthenticatedUser,
  ]);

  const refreshSession = useCallback(async () => {
    await refreshToken();
    const me = await fetchCurrentUser();
    replaceUser(me);
    recordDailyVisit();
    void fetchUsers();
  }, [fetchUsers, replaceUser]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    try {
      setIsSubmitting(true);
      setError(null);
      const data = await loginWithPassword(email, password);

      saveRecentAuthIdentity({
        email,
        username:
          typeof data?.user?.username === "string"
            ? data.user.username
            : undefined,
      });
      if (data.user) {
        setAuthenticatedUser(data.user);
        recordDailyVisit();
      } else {
        await refreshSession();
      }
      void fetchUsers();

      return true;
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : "";
      setError(
        messageFromApiResponseBody(rawMessage, 401, getNetworkFailureHint(err)),
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Той самий флоу, що й `login`: спільне збереження сесії, однакова обробка помилок. */
  const register = async (input: {
    email: string;
    username: string;
    password: string;
  }) => {
    try {
      setIsSubmitting(true);
      setError(null);
      const data = await registerWithPassword(input);

      saveRecentAuthIdentity({
        email: input.email,
        username:
          typeof data?.user?.username === "string"
            ? data.user.username
            : input.username,
      });
      if (data.user) {
        setAuthenticatedUser(data.user);
        recordDailyVisit();
      } else {
        await refreshSession();
      }
      void fetchUsers();

      return true;
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : "";
      setError(
        messageFromApiResponseBody(rawMessage, 400, getNetworkFailureHint(err)),
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    void clearAppBadgeIfSupported();
    queryClient.clear();
    applyUserAppearanceToDocument(null);
    await performLogout({ redirectTo: "/" });
  };

  return {
    user,
    users,
    loading,
    error,
    isSubmitting,
    login,
    register,
    logout,
    refreshUsers: fetchUsers,
    refreshSession,
    applyAuthPayload,
    patchUser,
    replaceUser,
  };
}
