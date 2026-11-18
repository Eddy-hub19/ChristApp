import { getHttpApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";

/**
 * Згортання/блокування екрана: сокет на телефоні ще кілька секунд лишається «живим», а подія `roomViewState`
 * по ньому може не встигнути. Цей запит (fetch + keepalive) доходить і під час закриття сторінки та миттєво
 * знімає з сервера всі «перегляди» цього сокета — з цієї миті пуші знову йдуть.
 */
export function clearServerViewState(socketId: string | undefined | null) {
  if (typeof window === "undefined" || !socketId) return;
  const token = getAuthToken();
  if (!token) return;
  try {
    void fetch(`${getHttpApiBase().replace(/\/+$/, "")}/push/view-state/clear`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ socketId }),
    }).catch(() => undefined);
  } catch {
    // best effort
  }
}
