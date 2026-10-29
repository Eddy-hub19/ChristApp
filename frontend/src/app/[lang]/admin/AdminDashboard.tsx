"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useFullscreenMode } from "@/contexts/TabBarOverlayContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  AdminHttpError,
  adminFlockMutesQueryKey,
  adminMembersQueryKey,
  adminMembersQueryOptions,
  deleteAdminMember,
  fetchAdminFlockMutes,
  type AdminMember,
} from "@/lib/queries/adminQueries";
import AdminProcesses from "./AdminProcesses";
import AdminPuzzleImages from "./AdminPuzzleImages";
import AdminUserCard from "./AdminUserCard";
import styles from "./admin.module.scss";

type AdminTab = "users" | "processes" | "puzzles";
type Filter = "all" | "new" | "active" | "muted";

const TABS: AdminTab[] = ["users", "processes", "puzzles"];
const FILTERS: Filter[] = ["all", "new", "active", "muted"];
const EMPTY_MEMBERS: AdminMember[] = [];
const EMPTY_MUTES: Record<string, number> = {};
const NEW_MS = 7 * 24 * 60 * 60 * 1000;
/** Скільки карток показуємо одразу й докидаємо за один раз при прокрутці. */
const PAGE_SIZE = 30;

/** Адмін-панель (завантажується лениво лише для адміна): сегмент «Користувачі / Процеси». */
export default function AdminDashboard() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("users");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [now, setNow] = useState(() => Date.now());
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  // На телефоні адмінка - повноекранний режим (навбар не рендериться), на ПК навбар лишається.
  const isMobile = useMediaQuery("(max-width: 767px)");
  useFullscreenMode(isMobile);

  const membersQuery = useQuery(adminMembersQueryOptions(tab === "users"));
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  const mutesQuery = useQuery({
    queryKey: adminFlockMutesQueryKey(),
    queryFn: fetchAdminFlockMutes,
    enabled: tab === "users",
  });
  const mutes = mutesQuery.data?.mutes ?? EMPTY_MUTES;

  const loadError = membersQuery.error
    ? membersQuery.error instanceof AdminHttpError && membersQuery.error.status === 401
      ? t("noToken")
      : membersQuery.error instanceof AdminHttpError
        ? membersQuery.error.message || t("loadFailed", { status: membersQuery.error.status })
        : t("loadFailedGeneric")
    : null;

  /** Видалення - оптимістично: рядок зникає одразу, при помилці повертається. */
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
      if (context?.previous) queryClient.setQueryData(adminMembersQueryKey(), context.previous);
      window.alert(
        error instanceof AdminHttpError ? t("deleteFailed", { status: error.status }) : t("deleteFailedGeneric"),
      );
    },
    onSettled: () => setDeletingId(null),
  });
  const { mutate: deleteMember } = deleteMutation;
  const handleDelete = useCallback((member: AdminMember) => deleteMember(member), [deleteMember]);

  // «Був у мережі» живе: оновлюємо «зараз» раз на хвилину.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const sorted = useMemo(
    () => [...members].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [members],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((m) => {
      if (filter === "new" && !(now - new Date(m.createdAt).getTime() < NEW_MS)) return false;
      if (filter === "active" && !m.isActive) return false;
      if (filter === "muted" && !(m.id in mutes)) return false;
      if (!q) return true;
      return (
        m.username.toLowerCase().includes(q) ||
        (m.nickname ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      );
    });
  }, [sorted, search, filter, mutes, now]);

  // Новий пошук/фільтр - знову з першої сторінки.
  useEffect(() => setVisible(PAGE_SIZE), [search, filter]);

  // Ледача підгрузка: коли сторожовий елемент наближається до краю - докидаємо ще порцію карток.
  const hasMore = visible < filtered.length;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visible]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    document.getElementById(`admin-tab-${next}`)?.focus();
  };

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link href="/chat" className={styles.backLink} prefetch>
          {t("backToChat")}
        </Link>
        <div className={styles.heading}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </header>

      <div className={styles.segment} role="tablist" aria-label={t("tabsAria")}>
        {TABS.map((id) => (
          <button
            key={id}
            id={`admin-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`admin-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={`${styles.segmentBtn} ${tab === id ? styles.segmentBtnActive : ""}`}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
          >
            {id === "users" ? t("tabUsers") : id === "processes" ? t("tabProcesses") : t("tabPuzzles")}
          </button>
        ))}
      </div>

      {tab === "puzzles" ? (
        <div id="admin-panel-puzzles" role="tabpanel" aria-labelledby="admin-tab-puzzles">
          <AdminPuzzleImages />
        </div>
      ) : tab === "processes" ? (
        <div id="admin-panel-processes" role="tabpanel" aria-labelledby="admin-tab-processes">
          <AdminProcesses active />
        </div>
      ) : (
        <div id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users" className={styles.usersPanel}>
          <label className={styles.search}>
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAria")}
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <div className={styles.filters} role="group" aria-label={t("filtersAria")}>
            {FILTERS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                className={`${styles.filterPill} ${filter === id ? styles.filterPillActive : ""}`}
                onClick={() => setFilter(id)}
              >
                {t(`filter_${id}`)}
              </button>
            ))}
            <span className={styles.count} role="status" aria-live="polite">
              {t("found", { count: filtered.length })}
            </span>
          </div>

          {loadError ? <p className={styles.error}>{loadError}</p> : null}
          {membersQuery.isFetching && members.length === 0 ? <p className={styles.meta}>{t("loadingList")}</p> : null}
          {!membersQuery.isFetching && !loadError && filtered.length === 0 ? (
            <p className={styles.meta}>{t("nothingFound")}</p>
          ) : null}

          <ul className={styles.list}>
            {filtered.slice(0, visible).map((m) => (
              <AdminUserCard
                key={m.id}
                member={m}
                isNew={now - new Date(m.createdAt).getTime() < NEW_MS}
                muted={m.id in mutes}
                deleting={deletingId === m.id}
                now={now}
                onDelete={handleDelete}
              />
            ))}
            {hasMore ? <li ref={sentinelRef} className={styles.sentinel} aria-hidden /> : null}
          </ul>
        </div>
      )}
    </div>
  );
}
