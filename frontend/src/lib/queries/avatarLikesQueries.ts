import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import { getHttpApiBase } from "@/lib/apiBase";

export type AvatarLikesMeResponse = {
  receivedCount: number;
};

export type AvatarLikesUserResponse = {
  receivedCount: number;
  likedByMe: boolean;
};

import { queryKeys } from "@/lib/queryKeys";

/** Помилка запиту лайків: статус потрібен політиці повторів (4xx не повторюємо), а не підміна нулями в кеші. */
export class AvatarLikesHttpError extends Error {
  constructor(readonly status: number) {
    super(`avatar-likes request failed: ${status}`);
  }
}

export const avatarLikesMeQueryKey = queryKeys.user.avatarLikesMe();

export const avatarLikesForUserQueryKey = (userId: string) =>
  queryKeys.user.avatarLikes(userId);

export async function fetchMyAvatarLikesReceived(): Promise<AvatarLikesMeResponse> {
  const token = getAuthToken();
  if (!token) {
    return { receivedCount: 0 };
  }
  const res = await apiFetch(`${getHttpApiBase()}/users/me/avatar-likes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new AvatarLikesHttpError(res.status);
  }
  return (await res.json()) as AvatarLikesMeResponse;
}

export async function fetchAvatarLikesForUser(
  userId: string,
): Promise<AvatarLikesUserResponse> {
  const token = getAuthToken();
  if (!token || !userId) {
    return { receivedCount: 0, likedByMe: false };
  }
  const res = await apiFetch(
    `${getHttpApiBase()}/users/${userId}/avatar-likes`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    throw new AvatarLikesHttpError(res.status);
  }
  return (await res.json()) as AvatarLikesUserResponse;
}

export async function toggleAvatarLikeForUser(
  userId: string,
): Promise<AvatarLikesUserResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("no auth");
  }
  const res = await apiFetch(
    `${getHttpApiBase()}/users/${userId}/avatar-likes/toggle`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err?.message === "string" ? err.message : "toggle failed",
    );
  }
  return (await res.json()) as AvatarLikesUserResponse;
}

/** Оптимістичне значення після перемикання лайка (до відповіді сервера). */
export function optimisticAvatarLikeToggle(
  current: AvatarLikesUserResponse | undefined,
): AvatarLikesUserResponse {
  const liked = current?.likedByMe ?? false;
  const count = current?.receivedCount ?? 0;
  return {
    likedByMe: !liked,
    receivedCount: Math.max(0, count + (liked ? -1 : 1)),
  };
}
