"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import { getUserIdFromJwt } from "@/lib/jwtUser";
import { requestNotificationPermissionIfNeeded } from "@/lib/notifications";
import {
  fetchPushStatusForQuery,
  fetchUnreadSummaryForQuery,
  pushStatusQueryKey,
  pushUnreadSummaryQueryKey,
} from "@/lib/queries/pushQueries";
import {
  getLocalPushEndpoint,
  isPushSupportedInBrowser,
  sendTestPush,
  syncBrowserPushSubscription,
  type PushSyncFailureReason,
  type PushTestResult,
} from "@/lib/push";
import CrossLoader from "@/components/CrossLoader/CrossLoader";
import styles from "./PushNotificationCenter.module.scss";

const REFRESH_INTERVAL_MS = 45_000;

type PermissionState = NotificationPermission | "unsupported";

function getPermissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

/** iOS: Web Push работает только у приложения, добавленного на «Домой». */
function detectInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const SYNC_ERROR_KEYS: Record<PushSyncFailureReason, string> = {
  unsupported: "errUnsupported",
  "permission-not-granted": "errPermission",
  "public-key-fetch-failed": "errKey",
  "server-disabled": "errServerDisabled",
  "invalid-subscription": "errInvalid",
  "subscribe-request-failed": "errSubscribe",
  "unexpected-error": "errUnexpected",
};

export default function PushNotificationCenter() {
  const t = useTranslations("pushCenter");
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [authEpoch, setAuthEpoch] = useState(0);
  const [permissionState, setPermissionState] =
    useState<PermissionState>(getPermissionState);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [localEndpoint, setLocalEndpoint] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [testState, setTestState] = useState<
    { phase: "idle" } | { phase: "sending" } | { phase: "done"; result: PushTestResult | null }
  >({ phase: "idle" });
  const syncError = useCallback(
    (reason: PushSyncFailureReason) => t(SYNC_ERROR_KEYS[reason]),
    [t],
  );

  useEffect(() => {
    // Ці значення відомі лише в браузері — читаємо після монтування.
    /* eslint-disable react-hooks/set-state-in-effect */
    setInstalled(detectInstalledPwa());
    setIsIos(detectIos());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const bump = () => setAuthEpoch((n) => n + 1);
    window.addEventListener(AUTH_CHANGED_EVENT, bump);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, bump);
  }, []);

  const token = getAuthToken();
  const userId = token ? getUserIdFromJwt(token) : undefined;

  const pushStatusQuery = useQuery({
    queryKey: pushStatusQueryKey(userId),
    queryFn: fetchPushStatusForQuery,
    enabled: Boolean(token && userId),
    staleTime: 45_000,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const unreadQuery = useQuery({
    queryKey: pushUnreadSummaryQueryKey(userId),
    queryFn: fetchUnreadSummaryForQuery,
    enabled: Boolean(token && userId),
    staleTime: 20_000,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const isPushConfigured = Boolean(pushStatusQuery.data?.enabled);
  const hasServerSubscription = Boolean(pushStatusQuery.data?.hasSubscription);
  const unreadTotal = Number(unreadQuery.data?.totalUnread ?? 0);

  const refreshState = useCallback(
    async (options?: { syncSubscription?: boolean }) => {
      const nextPermission = getPermissionState();
      setPermissionState(nextPermission);
      setLocalEndpoint(await getLocalPushEndpoint());

      if (!token || !userId) {
        setSyncErrorMessage(null);
        return;
      }

      const pushStatus = await queryClient.fetchQuery({
        queryKey: pushStatusQueryKey(userId),
        queryFn: fetchPushStatusForQuery,
        staleTime: 45_000,
      });

      await queryClient.fetchQuery({
        queryKey: pushUnreadSummaryQueryKey(userId),
        queryFn: fetchUnreadSummaryForQuery,
        staleTime: 20_000,
      });

      if (
        pushStatus?.hasSubscription ||
        nextPermission !== "granted" ||
        !pushStatus?.enabled
      ) {
        setSyncErrorMessage(null);
      }

      if (
        options?.syncSubscription &&
        nextPermission === "granted" &&
        pushStatus?.enabled
      ) {
        const syncResult = await syncBrowserPushSubscription(token);
        setSyncErrorMessage(
          syncResult.success
            ? null
            : syncError(syncResult.reason),
        );

        const refreshedStatus = await queryClient.fetchQuery({
          queryKey: pushStatusQueryKey(userId),
          queryFn: fetchPushStatusForQuery,
          staleTime: 45_000,
        });
        if (refreshedStatus?.hasSubscription) {
          setSyncErrorMessage(null);
        }
      }
    },
    [queryClient, syncError, token, userId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncToken = () => setAuthEpoch((n) => n + 1);

    window.addEventListener("focus", syncToken);
    window.addEventListener("storage", syncToken);
    document.addEventListener("visibilitychange", syncToken);

    return () => {
      window.removeEventListener("focus", syncToken);
      window.removeEventListener("storage", syncToken);
      document.removeEventListener("visibilitychange", syncToken);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    void refreshState({ syncSubscription: true });

    const handleFocusRefresh = () => {
      void refreshState();
    };

    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleFocusRefresh);

    return () => {
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleFocusRefresh);
    };
  }, [refreshState, token, authEpoch]);

  const permissionLabel = useMemo(() => {
    if (!isPushSupportedInBrowser()) return t("permUnsupported");
    if (permissionState === "granted") return t("permGranted");
    if (permissionState === "denied") return t("permDenied");
    if (permissionState === "default") return t("permDefault");
    return t("permUnknown");
  }, [permissionState, t]);

  // Підписка саме цього пристрою на сервері (а не «хоч якась» у користувача).
  const thisDeviceRegistered = Boolean(
    pushStatusQuery.data?.thisDeviceRegistered ?? hasServerSubscription,
  );
  const deviceReady = Boolean(localEndpoint) && thisDeviceRegistered;

  const deliveryStatusLabel = useMemo(() => {
    if (!isPushSupportedInBrowser()) return t("statusUnavailable");
    if (!isPushConfigured) return t("statusServerUnset");
    if (permissionState !== "granted") return t("statusNoPermission");
    return deviceReady ? t("statusActive") : t("statusNotConnected");
  }, [deviceReady, isPushConfigured, permissionState, t]);

  const isPublicRoute =
    pathname === "/" || pathname === "/register" || pathname === "/offline";
  const isProfileRoute =
    pathname === "/profile" || pathname.startsWith("/profile/");

  const isBootstrapping =
    Boolean(token && userId) &&
    !pushStatusQuery.data &&
    pushStatusQuery.isPending;

  // Після надання дозволу керування push відображаємо лише в профілі.
  const shouldShowBanner = permissionState !== "granted" || isProfileRoute;

  const handleRequestPermission = async () => {
    const permission = await requestNotificationPermissionIfNeeded();
    if (permission !== "granted") {
      setSyncErrorMessage(null);
    }
    await refreshState({ syncSubscription: true });
  };

  const handleConnectPush = async () => {
    if (!token) return;
    const syncResult = await syncBrowserPushSubscription(token);
    setSyncErrorMessage(
      syncResult.success ? null : syncError(syncResult.reason),
    );
    await refreshState();
  };

  if (isPublicRoute || !token) {
    return null;
  }

  if (!shouldShowBanner) {
    return null;
  }

  if (isBootstrapping) {
    return (
      <section
        className={styles.banner}
        aria-live="polite"
        role="status"
        aria-busy={true}
      >
        {isProfileRoute ? (
          <p className={styles.loadingPlain}>{t("checking")}</p>
        ) : (
          <div className={styles.pushLoaderWrap}>
            <CrossLoader label={t("checking")} variant="inline" />
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className={styles.banner}
      aria-live="polite"
      role="status"
      aria-busy={false}
    >
      <div className={styles.headerRow}>
        <p className={styles.title}>{t("title")}</p>
        <span className={styles.badge}>{deliveryStatusLabel}</span>
      </div>

      <p className={styles.meta}>{t("permissionLine", { value: permissionLabel })}</p>

      {unreadTotal > 0 ? (
        <p className={styles.unread}>{t("unread", { count: unreadTotal })}</p>
      ) : null}

      {permissionState === "default" ? (
        <button className={styles.actionButton} onClick={handleRequestPermission} type="button">
          {t("requestPermission")}
        </button>
      ) : null}

      {permissionState === "granted" && isPushConfigured && !deviceReady ? (
        <button className={styles.actionButton} onClick={handleConnectPush} type="button">
          {t("connectPush")}
        </button>
      ) : null}

      {permissionState === "denied" ? <p className={styles.hint}>{t("deniedHint")}</p> : null}

      {syncErrorMessage ? <p className={styles.hint}>{syncErrorMessage}</p> : null}

      {!isPushConfigured ? <p className={styles.hint}>{t("serverNotConfigured")}</p> : null}

      {isProfileRoute ? (
        <div className={styles.diag}>
          <p className={styles.diagTitle}>{t("diagTitle")}</p>
          <dl className={styles.diagList}>
            <div className={styles.diagRow}>
              <dt>{t("diagPermission")}</dt>
              <dd>{permissionLabel}</dd>
            </div>
            <div className={styles.diagRow}>
              <dt>{t("diagDeviceSubscription")}</dt>
              <dd>{localEndpoint ? t("yes") : t("no")}</dd>
            </div>
            <div className={styles.diagRow}>
              <dt>{t("diagServerRegistered")}</dt>
              <dd>{thisDeviceRegistered ? t("yes") : t("no")}</dd>
            </div>
            <div className={styles.diagRow}>
              <dt>{t("diagDevices")}</dt>
              <dd>{pushStatusQuery.data?.subscriptionsCount ?? 0}</dd>
            </div>
            <div className={styles.diagRow}>
              <dt>{t("diagInstalled")}</dt>
              <dd>{installed ? t("yes") : t("no")}</dd>
            </div>
          </dl>

          {isIos && !installed ? <p className={styles.hint}>{t("iosInstallHint")}</p> : null}

          <button
            className={styles.actionButton}
            type="button"
            disabled={testState.phase === "sending" || permissionState !== "granted"}
            onClick={async () => {
              if (!token) return;
              setTestState({ phase: "sending" });
              const result = await sendTestPush(token);
              setTestState({ phase: "done", result });
              await refreshState();
            }}
          >
            {testState.phase === "sending" ? t("testSending") : t("testButton")}
          </button>

          {testState.phase === "done" ? (
            <p className={styles.hint} role="status">
              {testResultText(t, testState.result)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function testResultText(
  t: (key: string, values?: Record<string, string | number>) => string,
  result: PushTestResult | null,
): string {
  if (!result) return t("testNoServer");
  if (result.code === "DISABLED") return t("serverNotConfigured");
  if (result.code === "NO_SUBSCRIPTION") return t("testNoSubscription");
  const ok = result.results.filter((r) => r.ok).length;
  if (ok > 0) return t("testSent", { count: ok });
  const status = result.results.map((r) => r.status).find((v) => v !== null);
  const removed = result.results.some((r) => r.removed);
  return removed ? t("testRemoved") : t("testFailed", { status: status ?? "—" });
}
