"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/components/TabBar/TabBar.module.scss";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import { CHAT_UNREAD_CHANGED_EVENT } from "@/lib/chatUnreadEvents";
import {
  pushUnreadSummaryQueryKey,
  requestUnreadSummaryRefresh,
  unreadSummaryQueryOptions,
} from "@/lib/queries/pushQueries";
import { queryKeys } from "@/lib/queryKeys";
import {
  appendToCachedHistory,
  type RawHistoryMessage,
} from "@/lib/chatHistoryCache";
import { STALE } from "@/lib/queryPolicy";
import { getUserIdFromJwt } from "@/lib/jwtUser";
import {
  prefetchTabBibleData,
  prefetchAppEntryData,
  prefetchTabChatData,
  prefetchTabCinemaData,
  prefetchTabProfileData,
} from "@/lib/tabPrefetch";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext";
import {
  chatComposerTabLayoutMediaQuery,
  useMediaQuery,
} from "@/hooks/useMediaQuery";
import { syncAppBadgeFromUnreadCount } from "@/lib/appBadge";
import { watchRoomsQueryOptions } from "@/lib/queries/watchRoomsQueries";

const UNREAD_REFRESH_INTERVAL_MS = 30_000;

export default function TabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { socket } = usePresenceSocket();
  const tabBarOverlay = useTabBarOverlayOptional();
  const narrowForChatComposer = useMediaQuery(
    chatComposerTabLayoutMediaQuery(),
  );
  const [authEpoch, setAuthEpoch] = useState(0);
  /** Токен у localStorage недоступний на SSR — інакше кількість вкладок і active-іконка не збігаються з клієнтом (hydration error). */
  const [tabBarClientReady, setTabBarClientReady] = useState(false);

  const token = getAuthToken();
  const userId = token ? getUserIdFromJwt(token) : undefined;

  const unreadQuery = useQuery({
    ...unreadSummaryQueryOptions(userId),
    refetchInterval: UNREAD_REFRESH_INTERVAL_MS,
  });

  const unreadCount = Number(unreadQuery.data?.totalUnread ?? 0);

  /** Запрошення в «Кіношку» — бейдж на вкладці; оновлюється і сокет-подією `watch:invited`. */
  const watchRoomsQuery = useQuery(watchRoomsQueryOptions(userId));
  const watchInvitesCount = watchRoomsQuery.data?.invitations.length ?? 0;

  useEffect(() => {
    void syncAppBadgeFromUnreadCount(unreadCount);
  }, [unreadCount]);

  /** Серія подій (focus, visibility, newMessage, зміна маршруту) зливається в один запит. */
  const refetchUnread = useCallback(() => {
    requestUnreadSummaryRefresh(queryClient, userId);
  }, [queryClient, userId]);

  const hiddenRoutes = ["/", "/register", "/offline"];
  /** Список чатів — таб видимий; відкрита кімната — таб прихований, більше місця під листування. */
  const hideOnActiveChatRoom =
    pathname.startsWith("/chat/") || pathname.startsWith("/cinema/");
  const shouldHideTabBar =
    hideOnActiveChatRoom ||
    hiddenRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  const hideForChatComposer =
    (tabBarOverlay?.chatComposerFocused ?? false) && narrowForChatComposer;

  const isRouteActive = (route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);

  useEffect(() => {
    setTabBarClientReady(true);
    prefetchAppEntryData(queryClient);
  }, [queryClient]);

  useEffect(() => {
    const bump = () => setAuthEpoch((n) => n + 1);
    window.addEventListener(AUTH_CHANGED_EVENT, bump);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, bump);
  }, []);

  /** При навігації оновлюємо лише застарілі дані: свіжі (<20 с) беремо з кешу, без зайвого запиту на кожен перехід. */
  useEffect(() => {
    const state = queryClient.getQueryState(pushUnreadSummaryQueryKey(userId));
    if (state?.fetchStatus === "fetching") return;
    if (!state?.dataUpdatedAt || Date.now() - state.dataUpdatedAt > STALE.counter) {
      refetchUnread();
    }
  }, [pathname, authEpoch, refetchUnread, queryClient, userId]);

  useEffect(() => {
    const onFocus = () => refetchUnread();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refetchUnread();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetchUnread]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const refetchWatchRooms = () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.cinema.root() });

    /** Нове повідомлення: бейдж оновлюємо, а історію закешованої (не відкритої) кімнати дописуємо прямо в кеш. */
    const onNewMessage = (message: RawHistoryMessage) => {
      refetchUnread();
      appendToCachedHistory(queryClient, message?.roomId, message);
    };
    socket.on("newMessage", onNewMessage);
    socket.on("watch:invited", refetchWatchRooms);

    return () => {
      socket.off("newMessage", onNewMessage);
      socket.off("watch:invited", refetchWatchRooms);
    };
  }, [socket, refetchUnread, queryClient]);

  useEffect(() => {
    window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, refetchUnread);

    return () => {
      window.removeEventListener(CHAT_UNREAD_CHANGED_EVENT, refetchUnread);
    };
  }, [refetchUnread]);

  if (shouldHideTabBar || hideForChatComposer) {
    return null;
  }

  return (
    <nav className={styles.nav}>
      <Link
        className={styles.tabLink}
        href="/bible"
        prefetch
        onPointerEnter={() => prefetchTabBibleData(queryClient)}
        onFocus={() => prefetchTabBibleData(queryClient)}
        onTouchStart={() => prefetchTabBibleData(queryClient)}
      >
        <span
          className={`${styles.iconWrap} ${isRouteActive("/bible") ? styles.activeIcon : ""}`}
        >
          <Image
            src="/icon-bible.svg"
            alt={t("bible")}
            width={24}
            height={24}
          />
        </span>
      </Link>
      <Link
        className={styles.tabLink}
        href="/chat"
        prefetch
        onPointerEnter={() => prefetchTabChatData(queryClient)}
        onFocus={() => prefetchTabChatData(queryClient)}
        onTouchStart={() => prefetchTabChatData(queryClient)}
      >
        <span
          className={`${styles.iconWrap} ${isRouteActive("/chat") ? styles.activeIcon : ""}`}
        >
          <Image
            src="/icon-chat.svg"
            alt={t("chat")}
            width={24}
            height={24}
            loading="eager"
          />
          {unreadCount > 0 ? (
            <span
              className={styles.unreadBadge}
              aria-label={t("unreadMessages", { count: unreadCount })}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
      </Link>
      <Link
        className={styles.tabLink}
        href="/cinema"
        prefetch
        aria-label={t("cinema")}
        title={t("cinema")}
        onPointerEnter={() => prefetchTabCinemaData(queryClient)}
        onFocus={() => prefetchTabCinemaData(queryClient)}
        onTouchStart={() => prefetchTabCinemaData(queryClient)}
      >
        <span
          className={`${styles.iconWrap} ${isRouteActive("/cinema") ? styles.activeIcon : ""}`}
        >
          <Image
            src="/icon-cinema.svg"
            alt={t("cinema")}
            width={24}
            height={24}
          />
          {watchInvitesCount > 0 ? (
            <span
              className={styles.unreadBadge}
              aria-label={t("cinemaInvites", { count: watchInvitesCount })}
            >
              {watchInvitesCount > 9 ? "9+" : watchInvitesCount}
            </span>
          ) : null}
        </span>
      </Link>
      <Link
        className={styles.tabLink}
        href="/profile"
        prefetch
        onPointerEnter={() => prefetchTabProfileData(queryClient)}
        onFocus={() => prefetchTabProfileData(queryClient)}
        onTouchStart={() => prefetchTabProfileData(queryClient)}
      >
        <span
          className={`${styles.iconWrap} ${isRouteActive("/profile") ? styles.activeIcon : ""}`}
        >
          <Image
            src="/icon-profile.svg"
            alt={t("profile")}
            width={24}
            height={24}
          />
        </span>
      </Link>
    </nav>
  );
}
