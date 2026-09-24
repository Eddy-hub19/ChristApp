"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getHttpApiBase } from "@/lib/apiBase";
import { checkBackendHealth } from "@/lib/backendHealth";
import { getAuthSessionSnapshot, initializeApp } from "@/lib/authSession";
import { hasPersistedAccessTokenInWebStorage } from "@/lib/auth";

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

  const startedAtRef = useRef<number>(Date.now());
  const isSettled = phase === "authenticated" || phase === "anonymous";

  const skip = useCallback(() => setSkipped(true), []);

  useEffect(() => {
    const id = window.setTimeout(
      () => setGraceElapsed(true),
      SHOW_SCREEN_AFTER_MS,
    );
    return () => window.clearTimeout(id);
  }, []);

  // Таймер потрібен лише поки чекаємо — не крутимо інтервал даремно.
  useEffect(() => {
    if (isSettled || skipped) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isSettled, skipped]);

  useEffect(() => {
    if (isSettled) {
      return;
    }

    const apiBase = getHttpApiBase();
    let cancelled = false;
    let timeoutId: number | null = null;

    const settleFromSession = () => {
      const snapshot = getAuthSessionSnapshot();
      setPhase(snapshot.user ? "authenticated" : "anonymous");
    };

    const attempt = async () => {
      const isReachable = await checkBackendHealth(apiBase, HEALTH_TIMEOUT_MS);
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
