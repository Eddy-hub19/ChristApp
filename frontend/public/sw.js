const STATIC_CACHE = "christapp-static-v7";
const RUNTIME_CACHE = "christapp-runtime-v7";
/** SWR для cross-origin GET к Nest API (ключ кеша = полный Request, включая Authorization). */
const API_SWR_CACHE = "christapp-api-swr-v7";
const OFFLINE_URL = "/offline";

const APP_SHELL = [
  "/",
  OFFLINE_URL,
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== STATIC_CACHE &&
                key !== RUNTIME_CACHE &&
                key !== API_SWR_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Прибирає зі шторки всі сповіщення однієї кімнати й виставляє бейдж. */
async function dismissRoomNotifications(roomId, badgeCount) {
  try {
    const shown = await self.registration.getNotifications();
    for (const notification of shown) {
      if (!roomId || notification.data?.roomId === roomId) {
        notification.close();
      }
    }
  } catch {
    // getNotifications підтримується не всюди
  }

  if (typeof badgeCount === "number") {
    await applyAppBadgeFromPush(self.registration, badgeCount);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // Кімнату прочитано на цьому пристрої — сповіщення з неї більше не потрібні.
  if (event.data?.type === "CHAT_ROOM_READ") {
    const roomId =
      typeof event.data.roomId === "string" ? event.data.roomId : undefined;
    const badgeRaw = event.data.badgeCount;
    const badgeCount =
      typeof badgeRaw === "number" && Number.isFinite(badgeRaw)
        ? Math.max(0, Math.floor(badgeRaw))
        : undefined;
    event.waitUntil(dismissRoomNotifications(roomId, badgeCount));
  }
});

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/_next/image") ||
      /\.(?:js|css|png|jpg|jpeg|svg|webp|avif|ico|woff2?|ttf)$/i.test(
        url.pathname,
      ))
  );
}

function isHttpOrHttps(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Не перехватываем: не-GET, WebSocket-прокси, явные auth-эндпоинты.
 * GET к API с Bearer кешируются отдельно (разные заголовки → разные записи в Cache API).
 */
function shouldBypassSwFetch(request) {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization");

  if (!isHttpOrHttps(url)) {
    return true;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return true;
  }

  if (typeof authorization === "string" && authorization.trim()) {
    return true;
  }

  if (url.pathname.startsWith("/socket.io/")) {
    return true;
  }

  /** Виджет Telegram Login грузит скрипт и iframe с этих доменов — SWR-кеш для Nest API им только мешает (свой CSP у sw.js не пускает connect-src). */
  if (url.hostname === "telegram.org" || url.hostname.endsWith(".telegram.org")) {
    return true;
  }

  const p = url.pathname;
  if (p === "/login" || p === "/register") {
    return true;
  }
  if (p.includes("/auth/me")) {
    return true;
  }
  if (p.includes("/auth/refresh") || p.includes("/auth/logout")) {
    return true;
  }
  /** Персональные данные + счётчики: SWR ломал превью и бейджи в списке чатов. */
  if (p.includes("/push/unread-summary")) {
    return true;
  }

  return false;
}

async function networkFirst(request) {
  const requestUrl = new URL(request.url);
  const canUseCacheApi = isHttpOrHttps(requestUrl);

  try {
    const response = await fetch(request);

    if (canUseCacheApi && response && response.ok) {
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      } catch {
        // chrome-extension: и др. схемы не кладутся в Cache
      }
    }

    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    if (isNavigationRequest(request)) {
      const offlinePage = await caches.match(OFFLINE_URL);
      if (offlinePage) {
        return offlinePage;
      }
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const requestUrl = new URL(request.url);
  const canUseCacheApi = isHttpOrHttps(requestUrl);

  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (canUseCacheApi && response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response("", { status: 504, statusText: "Gateway Timeout" });
}

/** Stale-While-Revalidate для JSON/API на другом origin (Nest). */
async function staleWhileRevalidateApi(request) {
  const requestUrl = new URL(request.url);
  const canUseCacheApi = isHttpOrHttps(requestUrl);

  const cache = await caches.open(API_SWR_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (canUseCacheApi && response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response("", { status: 504, statusText: "Gateway Timeout" });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (shouldBypassSwFetch(request)) {
    return;
  }

  const url = new URL(request.url);

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(staleWhileRevalidateApi(request));
    return;
  }
});

function parsePushPayload(event) {
  if (!event.data) {
    return {
      title: "ChristApp",
      body: "Новое сообщение в чате",
      targetUrl: "/chat",
      roomId: "unknown",
      messageId: "",
      badgeCount: undefined,
    };
  }

  try {
    const payload = event.data.json();
    const badgeRaw = payload?.badgeCount;
    const badgeCount =
      typeof badgeRaw === "number" && Number.isFinite(badgeRaw)
        ? Math.max(0, Math.floor(badgeRaw))
        : undefined;

    return {
      title:
        typeof payload?.title === "string" && payload.title.trim()
          ? payload.title
          : "ChristApp",
      body:
        typeof payload?.body === "string" && payload.body.trim()
          ? payload.body
          : "Новое сообщение в чате",
      targetUrl:
        typeof payload?.targetUrl === "string" ? payload.targetUrl : "/chat",
      roomId: typeof payload?.roomId === "string" ? payload.roomId : "unknown",
      senderId:
        typeof payload?.senderId === "string" ? payload.senderId : undefined,
      createdAt:
        typeof payload?.createdAt === "string" ? payload.createdAt : undefined,
      messageId:
        typeof payload?.messageId === "string" ? payload.messageId : "",
      badgeCount,
      kind: payload?.kind === "read-sync" ? "read-sync" : undefined,
      readRoomId:
        typeof payload?.readRoomId === "string"
          ? payload.readRoomId
          : undefined,
    };
  } catch {
    return {
      title: "ChristApp",
      body: "Новое сообщение в чате",
      targetUrl: "/chat",
      roomId: "unknown",
      messageId: "",
      badgeCount: undefined,
    };
  }
}

async function applyAppBadgeFromPush(registration, badgeCount) {
  try {
    if (typeof registration.setAppBadge !== "function") {
      return;
    }
    if (badgeCount === undefined) {
      return;
    }
    if (badgeCount <= 0) {
      if (typeof registration.clearAppBadge === "function") {
        await registration.clearAppBadge();
      } else {
        await registration.setAppBadge();
      }
      return;
    }
    const n = Math.min(badgeCount, 99);
    await registration.setAppBadge(n);
  } catch {
    // не все платформы поддерживают Badging API
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const registration = self.registration;

  // Службовий пуш: користувач прочитав кімнату на іншому пристрої.
  // Нічого не показуємо — лише прибираємо сповіщення цієї кімнати й правимо бейдж.
  if (payload.kind === "read-sync") {
    event.waitUntil(
      dismissRoomNotifications(payload.readRoomId, payload.badgeCount ?? 0),
    );
    return;
  }

  const tag =
    payload.messageId && payload.messageId.length > 0
      ? `christ-msg-${payload.messageId}`
      : `room-${payload.roomId}`;

  const ts = Date.parse(payload.createdAt || "") || Date.now();

  event.waitUntil(
    (async () => {
      await registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        tag,
        renotify: true,
        vibrate: [160, 80, 160],
        timestamp: ts,
        silent: false,
        requireInteraction: false,
        data: {
          url: payload.targetUrl,
          roomId: payload.roomId,
          senderId: payload.senderId,
          createdAt: payload.createdAt,
          messageId: payload.messageId,
        },
      });

      await applyAppBadgeFromPush(registration, payload.badgeCount);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetPath =
    typeof event.notification?.data?.url === "string"
      ? event.notification.data.url
      : "/chat";
  const destinationUrl = new URL(targetPath, self.location.origin);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (
            clientUrl.pathname === destinationUrl.pathname &&
            "focus" in client
          ) {
            return client.focus();
          }
        }

        for (const client of clientList) {
          if ("navigate" in client && "focus" in client) {
            return client
              .navigate(destinationUrl.toString())
              .then(() => client.focus());
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(destinationUrl.toString());
        }

        return undefined;
      }),
  );
});
