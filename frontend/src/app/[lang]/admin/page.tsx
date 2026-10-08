"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { canSeeAdminPanelNav } from "@/lib/adminDashboardNav";
import {
  AdminHttpError,
  adminMembersQueryKey,
  adminMembersQueryOptions,
  deleteAdminMember,
  type AdminMember,
} from "@/lib/queries/adminQueries";
import styles from "./admin.module.scss";

const EMPTY_MEMBERS: AdminMember[] = [];
const NEW_MS = 7 * 24 * 60 * 60 * 1000;

export default function AdminPage() {
  const t = useTranslations("admin");
  const router = useRouter();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isAdmin = !loading && Boolean(user) && canSeeAdminPanelNav(user?.username);

  const membersQuery = useQuery(adminMembersQueryOptions(isAdmin));
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  const loadingList = membersQuery.isFetching;
  const loadError = membersQuery.error
    ? membersQuery.error instanceof AdminHttpError && membersQuery.error.status === 401
      ? t("noToken")
      : membersQuery.error instanceof AdminHttpError
        ? membersQuery.error.message || t("loadFailed", { status: membersQuery.error.status })
        : t("loadFailedGeneric")
    : null;

  /** Видалення — оптимістично: рядок зникає одразу, при помилці повертається. */
  const deleteMutation = useMutation({
    mutationFn: (member: AdminMember) => deleteAdminMember(member.id),
    onMutate: async (member) => {
      await queryClient.cancelQueries({ queryKey: adminMembersQueryKey() });
      const previous = queryClient.getQueryData<AdminMember[]>(adminMembersQueryKey());
      queryClient.setQueryData<AdminMember[]>(adminMembersQueryKey(), (old) =>
        (old ?? []).filter((row) => row.id !== member.id),
      );
      setDeletingId(member.id);
      return { previous };
    },
    onError: (error, _member, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adminMembersQueryKey(), context.previous);
      }
      window.alert(
        error instanceof AdminHttpError
          ? t("deleteFailed", { status: error.status })
          : t("deleteFailedGeneric"),
      );
    },
    onSettled: () => setDeletingId(null),
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!canSeeAdminPanelNav(user.username)) {
      router.replace("/chat");
    }
  }, [user, loading, router]);

  const deleteMember = useCallback(
    (member: AdminMember) => {
      const displayName = member.nickname?.trim() || member.username;
      const confirmed = window.confirm(
        t("deleteConfirm", {
          name: displayName,
          username: member.username,
        }),
      );
      if (confirmed) deleteMutation.mutate(member);
    },
    [deleteMutation, t],
  );

  const sorted = useMemo(
    () =>
      [...members].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [members],
  );

  if (loading || !user || !canSeeAdminPanelNav(user.username)) {
    return (
      <div className={styles.page} aria-busy="true">
        <p className={styles.meta}>{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/chat" className={styles.backLink} prefetch>
          {t("backToChat")}
        </Link>
      </div>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.meta}>{t("subtitle")}</p>

      {loadError ? <p className={styles.error}>{loadError}</p> : null}
      {loadingList ? <p className={styles.meta}>{t("loadingList")}</p> : null}

      <ul className={styles.list}>
        {sorted.map((m) => {
          const created = new Date(m.createdAt);
          const isNew =
            !Number.isNaN(created.getTime()) &&
            Date.now() - created.getTime() < NEW_MS;
          const lastSeenLabel = m.lastSeenAt
            ? new Date(m.lastSeenAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : t("neverOnline");

          return (
            <li key={m.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.nameRow}>
                  <span className={styles.displayName}>
                    {m.nickname?.trim() || m.username}
                  </span>
                  <span className={styles.handle}>@{m.username}</span>
                </div>
                <div className={styles.badgeRow}>
                  {isNew ? (
                    <span className={`${styles.badge} ${styles.badgeNew}`}>
                      {t("badgeNew")}
                    </span>
                  ) : null}
                  <span
                    className={`${styles.badge} ${m.isActive ? "" : styles.badgeOff}`}
                  >
                    {m.isActive ? t("statusActive") : t("statusInactive")}
                  </span>
                </div>
              </div>
              <p className={styles.meta}>
                <strong>{t("labelId")}</strong> {m.id}
                <br />
                <strong>{t("labelEmail")}</strong> {m.email}
                <br />
                <strong>{t("labelJoined")}</strong> {created.toLocaleString()}
                <br />
                <strong>{t("labelLastSeen")}</strong> {lastSeenLabel}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  disabled={deletingId === m.id}
                  onClick={() => void deleteMember(m)}
                >
                  {deletingId === m.id ? t("deleting") : t("deleteMember")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
