"use client";

import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { getInitials } from "@/lib/utils";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { formatLastSeenRelative } from "@/lib/chatLastSeenFormat";
import { isTesterUsername } from "@/lib/testerUsers";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./OnlineUsersDrawer.module.scss";

type DrawerUser = {
  id: string;
  username: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  lastSeenAt?: string | null;
  isOnline: boolean;
};

type OnlineUsersDrawerProps = {
  /** `inline` — колонка всередині картки чату (десктоп); `overlay` — шар поверх екрана (вузький екран). */
  variant?: "overlay" | "inline";
  open?: boolean;
  title?: string;
  participants: DrawerUser[];
  onClose?: () => void;
  onParticipantClick?: (participant: DrawerUser) => void;
};

/** З якої кількості учасників показуємо поле пошуку. */
const SEARCH_MIN_PARTICIPANTS = 8;
/** Свайп праворуч далі за цю відстань (або швидко) закриває панель. */
const SWIPE_CLOSE_OFFSET_PX = 80;
const SWIPE_CLOSE_VELOCITY = 500;

function displayName(participant: DrawerUser) {
  return participant.nickname?.trim() || participant.username;
}

export default function OnlineUsersDrawer({
  variant = "overlay",
  open,
  title = "Участники",
  participants,
  onClose,
  onParticipantClick,
}: OnlineUsersDrawerProps) {
  const t = useTranslations("chat");
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  /** «Був у мережі N хв тому» — оновлюємо раз на хвилину, а не на кожен рендер. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isOpen = Boolean(open && onClose);

  const sorted = useMemo(
    () =>
      participants
        .filter((participant) => !isTesterUsername(participant.username))
        .sort((a, b) => {
          if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
          return displayName(a).localeCompare(displayName(b));
        }),
    [participants],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^@/, "");
    if (!needle) return sorted;
    return sorted.filter(
      (p) =>
        p.username.toLowerCase().includes(needle) ||
        (p.nickname ?? "").toLowerCase().includes(needle),
    );
  }, [sorted, query]);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => setNowMs(Date.now());
    // Панель живе змонтованою весь час — при відкритті одразу беремо свіжий час.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 60_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isOpen]);

  useEffect(() => {
    if (variant !== "overlay" || !isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, isOpen, onClose]);

  const statusText = (participant: DrawerUser) => {
    if (participant.isOnline) return t("onlineShort");
    if (!participant.lastSeenAt) return "";
    return formatLastSeenRelative(participant.lastSeenAt, nowMs, {
      seconds: (count) => t("lastSeenSeconds", { count }),
      minutes: (count) => t("lastSeenMinutes", { count }),
      hours: (count) => t("lastSeenHours", { count }),
      days: (count) => t("lastSeenDays", { count }),
    });
  };

  const header = (
    <div className={styles.header}>
      <h3 className={styles.title}>
        {title}
        <span className={styles.count}>{sorted.length}</span>
      </h3>
      <button
        type="button"
        className={styles.closeButton}
        onClick={onClose}
        aria-label={t("participantsClose")}
      >
        <X size={20} aria-hidden />
      </button>
    </div>
  );

  const body = (
    <>
      {sorted.length >= SEARCH_MIN_PARTICIPANTS ? (
        <label className={styles.search}>
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("participantsSearch")}
            aria-label={t("participantsSearch")}
          />
        </label>
      ) : null}
      <ul className={styles.list}>
        {filtered.map((participant) => {
          const name = displayName(participant);
          const status = statusText(participant);
          const content = (
            <>
              <span className={styles.avatar}>
                <AvatarWithFallback
                  src={resolvePublicAvatarUrl(participant.avatarUrl)}
                  initials={getInitials(name)}
                  colorSeed={participant.id}
                  width={36}
                  height={36}
                  imageClassName={styles.avatarImg}
                  fallbackClassName={styles.avatarFallback}
                  fallbackTag="span"
                  fallbackTint="always"
                />
                <span
                  className={`${styles.statusDot} ${participant.isOnline ? styles.statusDotOnline : styles.statusDotOffline}`}
                  aria-hidden
                />
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{name}</span>
                {status ? (
                  <span
                    className={`${styles.status} ${participant.isOnline ? styles.statusOnline : ""}`}
                  >
                    {status}
                  </span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={participant.id}>
              {onParticipantClick ? (
                <button
                  type="button"
                  className={`${styles.item} ${styles.itemClickable}`}
                  onClick={() => onParticipantClick(participant)}
                >
                  {content}
                </button>
              ) : (
                <div className={styles.item}>{content}</div>
              )}
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className={styles.empty}>{t("participantsEmpty")}</li>
        ) : null}
      </ul>
    </>
  );

  if (variant === "inline") {
    if (!isOpen) return null;
    return (
      <aside className={styles.inlineRoot} aria-label={title}>
        {header}
        {body}
      </aside>
    );
  }

  if (typeof document === "undefined") return null;

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    if (
      info.offset.x > SWIPE_CLOSE_OFFSET_PX ||
      info.velocity.x > SWIPE_CLOSE_VELOCITY
    ) {
      onClose?.();
    }
  };

  // Портал у body: картка чату має власний z-index-контекст, тож усередині неї панель
  // не могла стати вище за перемикач теми й обрізалася висотою картки.
  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="participants-overlay"
          className={styles.overlay}
          onClick={onClose}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ type: "tween", duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
            drag={reduceMotion ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.6 }}
            dragDirectionLock
            onDragEnd={handleDragEnd}
          >
            {header}
            {body}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
