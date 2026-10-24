import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import { getHttpApiBase } from "@/lib/apiBase";
import { getApiErrorMessage } from "@/lib/apiError";

/** PATCH /users/me с частью профиля; бросает Error с текстом сервера (или fallback). */
export async function patchMyProfile(body: Record<string, unknown>, fallbackError: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error(fallbackError);
  const res = await apiFetch(`${getHttpApiBase()}/users/me`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(data, fallbackError));
  }
}
