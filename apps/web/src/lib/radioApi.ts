import { getHttpApiBase } from "@/lib/apiBase";
import { apiFetch, type ApiFetchInit } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";

export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  audioUrl: string;
  durationSec: number;
}

export interface RadioState {
  online: boolean;
  track: RadioTrack | null;
  startedAtMs: number | null;
  /** Время сервера в момент ответа: по нему считается сдвиг часов клиента. */
  serverNow: number;
}

export interface RadioListener {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface RadioRecent {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  startedAtMs: number;
}

export type RadioAdminTrack = RadioTrack & { position: number };

export class RadioApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new RadioApiError(401, "unauthorized");
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await apiFetch(`${getHttpApiBase()}/api/radio${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(isForm ? {} : { "Content-Type": "application/json" }), ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new RadioApiError(res.status, message || `radio request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const fetchRadioState = () => call<RadioState>("/state");
export const fetchRadioRecent = () => call<RadioRecent[]>("/recent");
export const fetchRadioTracks = () => call<RadioAdminTrack[]>("/tracks");
export const uploadRadioTrack = (form: FormData) => call<{ ok: true; id: string }>("/tracks", { method: "POST", body: form, timeoutMs: 120_000 });
export const deleteRadioTrack = (id: string) => call<{ ok: true }>(`/tracks/${encodeURIComponent(id)}`, { method: "DELETE" });
export const moveRadioTrack = (id: string, direction: "up" | "down") =>
  call<{ ok: true }>(`/tracks/${encodeURIComponent(id)}/move`, { method: "PATCH", body: JSON.stringify({ direction }) });
export const playRadioTrackNext = (id: string) => call<{ ok: true }>(`/tracks/${encodeURIComponent(id)}/play-next`, { method: "POST" });
