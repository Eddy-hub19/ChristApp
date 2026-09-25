import { getHttpApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";
import { getApiErrorMessage } from "@/lib/apiError";
import type { WatchProvider } from "@/lib/watchSync";

const API_URL = getHttpApiBase();

export type WatchUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
};

export type WatchRoomCard = {
  id: string;
  title: string;
  videoId: string;
  videoTitle: string | null;
  isPlaying: boolean;
  host: WatchUser;
  memberCount: number;
  presentCount: number;
  createdAt: string;
};

export type WatchInvitationCard = WatchRoomCard & {
  invitedBy: WatchUser | null;
};

export type WatchRoomsList = {
  rooms: WatchRoomCard[];
  invitations: WatchInvitationCard[];
};

export type VideoCheck =
  | { ok: true; title: string | null }
  | { ok: false; code: "NOT_EMBEDDABLE" | "NOT_FOUND" };

export type ResolvedVideo =
  | {
      ok: true;
      provider: WatchProvider;
      /** YOUTUBE/VIMEO/DAILYMOTION — id відео. FILE/IFRAME/MANUAL — повний URL. */
      videoId: string;
      title: string | null;
      thumbnailUrl: string | null;
      /** http:// на захищеній (https) сторінці застосунку — браузер може заблокувати завантаження. */
      mixedContent: boolean;
    }
  | { ok: false; code: "NOT_FOUND" | "NOT_EMBEDDABLE" | "INVALID_VIDEO" | "UNSAFE_URL" };

export type VideoSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  isShort: boolean;
};

/** Помилка API з машинним кодом (`NOT_EMBEDDABLE`, …), щоб показати перекладений текст. */
export class WatchApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function watchRoomsQueryKey(userId: string | undefined) {
  return ["watch-rooms", userId ?? "anonymous"] as const;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new WatchApiError("Unauthorized", 401);

  const res = await apiFetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    timeoutMs: 20_000,
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const code =
      body && typeof body === "object" && "code" in body
        ? String((body as { code: unknown }).code)
        : undefined;
    throw new WatchApiError(
      getApiErrorMessage(body, `HTTP ${res.status}`),
      res.status,
      code,
    );
  }
  return body as T;
}

export function fetchWatchRooms() {
  return request<WatchRoomsList>("/watch-rooms");
}

export function checkWatchVideo(videoId: string) {
  return request<VideoCheck>(
    `/watch-rooms/video-check/${encodeURIComponent(videoId)}`,
  );
}

/** Визначає провайдера з довільного посилання (YouTube/Vimeo/Dailymotion/файл/інше). */
export function resolveWatchVideoLink(url: string) {
  return request<ResolvedVideo>(`/watch-rooms/resolve-video?url=${encodeURIComponent(url)}`);
}

export function searchWatchVideos(query: string) {
  return request<VideoSearchItem[]>(
    `/watch-rooms/video-search?q=${encodeURIComponent(query)}`,
  );
}

export function fetchPopularWatchVideos() {
  return request<VideoSearchItem[]>("/watch-rooms/video-popular");
}

export function createWatchRoom(input: {
  title: string;
  provider?: WatchProvider;
  videoId: string;
  videoTitle?: string;
  thumbnailUrl?: string;
  startSec?: number;
  inviteeIds: string[];
}) {
  return request<{ id: string }>("/watch-rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function inviteToWatchRoom(roomId: string, userIds: string[]) {
  return request<{ invited: number }>(`/watch-rooms/${roomId}/invite`, {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
}

export function fetchWatchInviteToken(roomId: string) {
  return request<{ token: string }>(`/watch-rooms/${roomId}/invite-token`);
}

export function rotateWatchInviteToken(roomId: string) {
  return request<{ token: string }>(
    `/watch-rooms/${roomId}/invite-token/rotate`,
    { method: "POST" },
  );
}

export function acceptWatchInvite(roomId: string) {
  return request<{ roomId: string }>(`/watch-rooms/${roomId}/accept`, {
    method: "POST",
  });
}

export function declineWatchInvite(roomId: string) {
  return request<{ ok: true }>(`/watch-rooms/${roomId}/decline`, {
    method: "POST",
  });
}

export function leaveWatchRoom(roomId: string) {
  return request<{ ok: true; deleted: boolean }>(
    `/watch-rooms/${roomId}/leave`,
    { method: "POST" },
  );
}

export function deleteWatchRoom(roomId: string) {
  return request<{ ok: true }>(`/watch-rooms/${roomId}`, { method: "DELETE" });
}

export function joinWatchRoomByToken(token: string) {
  return request<{ roomId: string }>(
    `/watch-rooms/join/${encodeURIComponent(token)}`,
    { method: "POST" },
  );
}

export function watchUserName(user: Pick<WatchUser, "nickname" | "username"> | null | undefined) {
  return user?.nickname?.trim() || user?.username || "";
}
