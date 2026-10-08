"use client";

import { TabBarOverlayProvider } from "@/contexts/TabBarOverlayContext";
import { createIdbPersister } from "@/lib/queryPersister";
import {
  STALE,
  requestRetryDelay,
  shouldRetryRequest,
} from "@/lib/queryPolicy";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import dynamic from "next/dynamic";
import { useState } from "react";

/** Devtools — лише в dev і окремим чанком: у прод-збірку вони не потрапляють. */
const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then(
            (m) => m.ReactQueryDevtools,
          ),
        { ssr: false },
      )
    : () => null;

/**
 * Що переживає перезапуск застосунку. Історія кімнат (`chat/room-history`) НЕ персиститься тут: останні
 * повідомлення вже лежать у IndexedDB-кеші чату (`chatMessageCache`) — один шар на одні й ті самі дані.
 * Живі лічильники (push, кімнати кінотеатру) теж не пишемо: вони швидко старіють і мають оновлюватись із мережі.
 */
export function shouldPersistQuery(query: { queryKey: readonly unknown[] }) {
  const [root, second] = query.queryKey;
  if (root === "push" || root === "watch-rooms") {
    return false;
  }
  if (root === "chat") {
    return second === "my-rooms";
  }
  return (
    root === "chapter" ||
    root === "bible" ||
    root === "verses" ||
    root === "users" ||
    root === "auth" ||
    root === "daily-bread"
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE.slow,
            gcTime: 10 * 60_000,
            /** Повернення в застосунок не повинно «штормити» запитами: свіжість дають сокет і ручні інвалідації. */
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            /** Мережа/5xx — повтор з наростаючою паузою; 401/403/404 не повторюємо. */
            retry: shouldRetryRequest,
            retryDelay: requestRetryDelay,
            /** Плавний UX: під час refetch показуємо попередні дані (аналог stale-while-revalidate на рівні UI). */
            placeholderData: (prev: unknown) => prev,
            /** Структурне порівняння відповіді: незмінені частини зберігають посилання, тож компоненти не перемальовуються. */
            structuralSharing: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  const [persister] = useState(() => createIdbPersister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        /** Узгоджено з gcTime статичних запитів Біблії (7 днів). */
        maxAge: 1000 * 60 * 60 * 24 * 7,
        /** Змінюйте при несумісній зміні форми кешованих даних: старий кеш буде відкинуто. */
        buster: "rq-idb-v3",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && shouldPersistQuery(query),
        },
      }}
    >
      <TabBarOverlayProvider>{children}</TabBarOverlayProvider>
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools buttonPosition="bottom-left" />
      ) : null}
    </PersistQueryClientProvider>
  );
}
