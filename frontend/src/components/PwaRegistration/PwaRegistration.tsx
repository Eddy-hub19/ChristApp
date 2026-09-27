"use client";

import { useEffect } from "react";

/**
 * Захист від застарілого HTML: якщо кешована (stale-while-revalidate) оболонка
 * посилається на JS/CSS чанки, яких вже нема на сервері після нового деплою,
 * імпорт впаде з ChunkLoadError / "Failed to fetch dynamically imported module".
 * Перезавантажуємо сторінку один раз, спершу прибравши кешовану оболонку в SW,
 * щоб reload дістав дійсно свіжий HTML, а не ту саму застарілу відповідь.
 */
const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;
/** Не даємо циклу перезавантажень, якщо проблема не зникає (справжній збій деплою). */
const RELOAD_DEBOUNCE_MS = 15_000;
const RELOAD_MARKER_KEY = "christapp:chunk-error-reload-at";

function looksLikeChunkError(value: unknown): boolean {
  if (value instanceof Error) {
    return (
      value.name === "ChunkLoadError" || CHUNK_ERROR_PATTERN.test(value.message)
    );
  }
  return typeof value === "string" && CHUNK_ERROR_PATTERN.test(value);
}

function recentlyReloadedForChunkError(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_MARKER_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < RELOAD_DEBOUNCE_MS;
  } catch {
    return false;
  }
}

function markChunkErrorReload() {
  try {
    sessionStorage.setItem(RELOAD_MARKER_KEY, String(Date.now()));
  } catch {
    // Приватний режим може забороняти sessionStorage — тоді просто ризикуємо повторним reload.
  }
}

async function recoverFromChunkError() {
  if (recentlyReloadedForChunkError()) {
    return;
  }
  markChunkErrorReload();

  try {
    navigator.serviceWorker?.controller?.postMessage({
      type: "INVALIDATE_SHELL",
    });
    // Даємо SW мить обробити видалення кешу перед тим, як reload піде за новим HTML.
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  } catch {
    // Немає активного SW/контролера — просто перезавантажуємо.
  }

  window.location.reload();
}

export default function PwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onWindowError = (event: ErrorEvent) => {
      if (looksLikeChunkError(event.error) || looksLikeChunkError(event.message)) {
        void recoverFromChunkError();
      }
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (looksLikeChunkError(event.reason)) {
        void recoverFromChunkError();
      }
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("error", onWindowError);
        window.removeEventListener("unhandledrejection", onUnhandledRejection);
      };
    }

    let didRefresh = false;

    const onControllerChange = () => {
      if (didRefresh) {
        return;
      }
      didRefresh = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    let registrationRef: ServiceWorkerRegistration | null = null;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        registrationRef = registration;

        activateWaitingWorker(registration);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) {
            return;
          }

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              activateWaitingWorker(registration);
            }
          });
        });

        registration.update().catch(() => {
          // Ігноруємо помилки оновлення; браузер повторить спробу при наступній навігації.
        });
      } catch {
        // Реєстрація service worker може впасти в непідтримуваних/приватних контекстах.
      }
    };

    registerServiceWorker();

    // PWA частіше «повертають з фону», ніж повністю перезавантажують — на активний
    // екран тригеримо перевірку оновлення SW самі, а не чекаємо наступну навігацію.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        registrationRef?.update().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  return null;
}
