"use client";

import { useCallback, useEffect, useState } from "react";
import { getHttpApiBase } from "@/lib/apiBase";
import { checkBackendHealth } from "@/lib/backendHealth";
import { getAuthSessionSnapshot, initializeApp } from "@/lib/authSession";
import { hasPersistedAccessTokenInWebStorage } from "@/lib/auth";

/**
 * Заповнюється блокуючим скриптом у `app/layout.tsx`: health-check стартує в <head>,
 * ще до завантаження React, щоб не втрачати час хендшейка на парсинг/гідратацію бандла.
 */
declare global {
  interface Window {
    __earlyHealthCheck?: {
      startedAt: number;
      promise: Promise<boolean>;
    };
  }
}

export type ServerBootPhase =
  /** Сервер ще не відповідає — іде холодний старт хостингу. */
  | "starting"
  /** Сервер ожив, відновлюємо сесію з refresh-токена. */
  | "restoring"
  /** Сесія є — можна одразу вести в чати. */
  | "authenticated"
  /** Сесії немає — показуємо форму входу. */
  | "anonymous";

const HEALTH_POLL_MS = 2500;
const HEALTH_TIMEOUT_MS = 8000;
/** Через стільки очікування пропонуємо все ж показати форму входу (раптом API просто не налаштований). */
const SKIP_OFFER_AFTER_MS = 20_000;
/** Якщо сервер теплий, усе встигає вирішитись швидше — не блимаємо екраном запуску даремно. */
const SHOW_SCREEN_AFTER_MS = 400;

/**
 * Старт застосунку: доки бекенд прокидається, тримаємо користувача на екрані запуску,
 * а не кидаємо у форму входу (вона все одно не працює) і не в чати (вони порожні).
 *
 * Refresh-токен при цьому не чіпаємо: мережеві помилки холодного старту ніколи
 * не скидають сесію — `initializeApp` чистить її лише на справжній 401.
 */
export function useServerStartupBoot() {
  const [phase, setPhase] = useState<ServerBootPhase>(() => {
    // М'яка навігація всередині застосунку: сесія вже в пам'яті, екран запуску не потрібен.
    const snapshot = getAuthSessionSnapshot();
    if (snapshot.initialized) {
      return snapshot.user ? "authenticated" : "anonymous";
    }
    return "starting";
  });
  const [skipped, setSkipped] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [graceElapsed, setGraceElapsed] = useState(false);

  // Якщо ранній health-check у <head> вже стартував, рахуємо очікування від нього,
  // а не від моменту, коли встиг змонтуватись React (інакше на повільному завантаженні
  // JS «безкоштовна» пауза до гідратації непомітно з'їдала грейс-період нижче).
  // Лениве обчислення один раз через useState (а не useRef(Date.now())) — виклик Date.now()
  // безпосередньо в аргументі був би нечистим викликом під час рендеру.
  const [startedAt] = useState<number>(() =>
    typeof window !== "undefined" && window.__earlyHealthCheck
      ? window.__earlyHealthCheck.startedAt
      : Date.now(),
  );
  const isSettled = phase === "authenticated" || phase === "anonymous";

  const skip = useCallback(() => setSkipped(true), []);

  useEffect(() => {
    const elapsedSinceStart = Date.now() - startedAt;
    const remaining = Math.max(0, SHOW_SCREEN_AFTER_MS - elapsedSinceStart);
    const id = window.setTimeout(() => setGraceElapsed(true), remaining);
    return () => window.clearTimeout(id);
  }, [startedAt]);

  // Таймер потрібен лише поки чекаємо — не крутимо інтервал даремно.
  useEffect(() => {
    if (isSettled || skipped) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isSettled, skipped, startedAt]);

  useEffect(() => {
    if (isSettled) {
      return;
    }

    const apiBase = getHttpApiBase();
    let cancelled = false;
    let timeoutId: number | null = null;
    // Ранній health-check використовуємо лише один раз — на першій спробі.
    let earlyCheckConsumed = false;

    const settleFromSession = () => {
      const snapshot = getAuthSessionSnapshot();
      setPhase(snapshot.user ? "authenticated" : "anonymous");
    };

    const runHealthCheck = (): Promise<boolean> => {
      const early = window.__earlyHealthCheck;
      if (early && !earlyCheckConsumed) {
        earlyCheckConsumed = true;
        return early.promise;
      }
      return checkBackendHealth(apiBase, HEALTH_TIMEOUT_MS);
    };

    const attempt = async () => {
      const isReachable = await runHealthCheck();
      if (cancelled) return;

      if (!isReachable) {
        // Ще прокидається — пробуємо знову, сесію не чіпаємо.
        timeoutId = window.setTimeout(() => void attempt(), HEALTH_POLL_MS);
        return;
      }

      setPhase("restoring");
      try {
        await initializeApp();
      } catch {
        // initializeApp сам розрулює 401; мережеву помилку просто переживаємо
      }
      if (cancelled) return;
      settleFromSession();
    };

    void attempt();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isSettled]);

  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  return {
    phase,
    /** Показувати екран запуску (доки не з'ясували стан і користувач не попросив форму). */
    showStartupScreen: !isSettled && !skipped && graceElapsed,
    /** Сесія відновилась — час вести в чати. */
    shouldEnterApp: phase === "authenticated",
    elapsedSeconds,
    hasStoredSession:
      typeof window !== "undefined" && hasPersistedAccessTokenInWebStorage(),
    canSkip: elapsedMs >= SKIP_OFFER_AFTER_MS,
    skip,
  };
}
