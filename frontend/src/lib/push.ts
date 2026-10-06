import { getHttpApiBase } from "@/lib/apiBase";
import { apiFetch } from "@/lib/apiFetch";

/** Без завершального `/`, інакше вийде `//push/...` і частина проксі віддає 404/500. */
const API_URL = getHttpApiBase().replace(/\/+$/, "");

export type PushServerStatus = {
  enabled: boolean;
  hasSubscription: boolean;
  subscriptionsCount: number;
  /** Є лише коли запит ішов із endpoint цього пристрою. */
  thisDeviceRegistered?: boolean;
};

export type PushTestResult = {
  ok: boolean;
  code: "SENT" | "FAILED" | "NO_SUBSCRIPTION" | "DISABLED";
  results: Array<{ ok: boolean; status: number | null; removed: boolean }>;
};

export type PushPublicKeyResponse = {
  enabled: boolean;
  publicKey: string | null;
};

export type UnreadSummaryRoomLastMessage = {
  id: string;
  /** Для медіа бекенд кладе запасний підпис; клієнт підписує за `type` мовою інтерфейсу. */
  type?: string;
  content: string;
  createdAt: string;
  senderId: string;
  senderUsername: string;
};

export type UnreadSummaryRoom = {
  roomId: string;
  unread: number;
  lastMessage: UnreadSummaryRoomLastMessage | null;
};

export type UnreadSummaryResponse = {
  totalUnread: number;
  rooms: UnreadSummaryRoom[];
};

export type PushSyncFailureReason =
  | "unsupported"
  | "permission-not-granted"
  | "public-key-fetch-failed"
  | "server-disabled"
  | "invalid-subscription"
  | "subscribe-request-failed"
  | "unexpected-error";

export type PushSyncResult =
  | { success: true }
  | { success: false; reason: PushSyncFailureReason };

export function isPushSupportedInBrowser() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function hasActivePushSubscription() {
  if (!isPushSupportedInBrowser()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

/** Підписка цього пристрою в браузері (endpoint) або null. */
export async function getLocalPushEndpoint(): Promise<string | null> {
  if (!isPushSupportedInBrowser()) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * Тестове сповіщення на цей пристрій. Повертає null, якщо запит не дійшов до сервера.
 */
export async function sendTestPush(token: string): Promise<PushTestResult | null> {
  try {
    const endpoint = await getLocalPushEndpoint();
    const response = await apiFetch(`${API_URL}/push/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(endpoint ? { endpoint } : {}),
    });
    if (!response.ok) return null;
    return (await response.json()) as PushTestResult;
  } catch {
    return null;
  }
}

export async function fetchPushStatus(
  token: string,
  endpoint?: string | null,
): Promise<PushServerStatus | null> {
  try {
    const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : "";
    const response = await apiFetch(`${API_URL}/push/status${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    return JSON.parse(trimmed) as PushServerStatus;
  } catch {
    return null;
  }
}

export async function fetchUnreadSummary(
  token: string,
): Promise<UnreadSummaryResponse | null> {
  try {
    const response = await apiFetch(`${API_URL}/push/unread-summary`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    return JSON.parse(trimmed) as UnreadSummaryResponse;
  } catch {
    return null;
  }
}

export async function fetchUnreadSummaryOrThrow(
  token: string,
): Promise<UnreadSummaryResponse> {
  const summary = await fetchUnreadSummary(token);
  if (!summary) {
    throw new Error("Не удалось получить unread-summary");
  }
  return summary;
}

export function getPushSyncErrorMessage(reason: PushSyncFailureReason) {
  switch (reason) {
    case "unsupported":
      return "Устройство или браузер не поддерживает Push API.";
    case "permission-not-granted":
      return "Браузер не выдал разрешение на уведомления.";
    case "public-key-fetch-failed":
      return "Не удалось получить push-ключ с сервера.";
    case "server-disabled":
      return "Push на сервере отключен или не настроен.";
    case "invalid-subscription":
      return "Браузер вернул некорректную push-подписку.";
    case "subscribe-request-failed":
      return "Сервер не принял push-подписку.";
    default:
      return "Не удалось подключить push из-за непредвиденной ошибки.";
  }
}

export async function syncBrowserPushSubscription(
  token: string,
): Promise<PushSyncResult> {
  if (!isPushSupportedInBrowser()) {
    return { success: false, reason: "unsupported" };
  }

  if (Notification.permission !== "granted") {
    return { success: false, reason: "permission-not-granted" };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const publicKeyResponse = await apiFetch(`${API_URL}/push/public-key`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (!publicKeyResponse.ok) {
        return { success: false, reason: "public-key-fetch-failed" };
      }

      const publicKeyPayload =
        (await publicKeyResponse.json()) as PushPublicKeyResponse;
      if (!publicKeyPayload.enabled || !publicKeyPayload.publicKey) {
        return { success: false, reason: "server-disabled" };
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKeyPayload.publicKey),
      });
    }

    const payload = subscriptionToPayload(subscription);
    if (!payload) {
      return { success: false, reason: "invalid-subscription" };
    }

    const subscribeResponse = await apiFetch(`${API_URL}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!subscribeResponse.ok) {
      return { success: false, reason: "subscribe-request-failed" };
    }

    return { success: true };
  } catch {
    return { success: false, reason: "unexpected-error" };
  }
}

function subscriptionToPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const keys = json.keys;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return null;
  }

  return {
    endpoint,
    expirationTime:
      typeof json.expirationTime === "number" ? json.expirationTime : null,
    keys: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
