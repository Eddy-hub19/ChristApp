"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Link2, MessageSquare, Share2, UserPlus } from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { openQuickChat, type QuickChat } from "@/lib/chatQuickSend";
import { createShareTargetsFromRooms, filterShareTargets, type ShareTarget } from "@/lib/chatRooms";
import { buildFlockInviteMessage } from "@/lib/flockInviteMessage";
import { buildFlockInviteUrl, canUseWebShare, copyText, shareInvite } from "@/lib/flockInviteShare";
import styles from "./FlockInvite.module.scss";

type Props = {
  /** Арена, куди кличемо; null (лобі, ще не зайшли) - посилання в "Отару" взагалі. Функція читається в момент кліку. */
  arenaId: number | null | (() => number | null);
  /** Куди відкривається меню: вгору (HUD знизу) чи вниз. */
  direction?: "down" | "up";
  className?: string;
};

type View = "menu" | "chats";

/** Кнопка «Запросити»: системне «Поділитися» / копіювання посилання / надіслати в чат карткою-запрошенням. */
export default function FlockInvite({ arenaId, direction = "down", className }: Props) {
  const t = useTranslations("flock.invite");
  const tChat = useTranslations("chat");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [toast, setToast] = useState<string | null>(null);
  const [targets, setTargets] = useState<ShareTarget[] | null>(null);
  const [search, setSearch] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const chatRef = useRef<QuickChat | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const currentArena = () => (typeof arenaId === "function" ? arenaId() : arenaId);
  const url = () => buildFlockInviteUrl(window.location.origin, locale, currentArena());

  const closeChat = useCallback(() => {
    chatRef.current?.close();
    chatRef.current = null;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setView("menu");
    setTargets(null);
    setSearch("");
    closeChat();
  }, [closeChat]);

  useEffect(() => closeChat, [closeChat]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  const onShare = async () => {
    const r = await shareInvite({ url: url(), title: t("shareTitle"), text: t("shareText") });
    if (r === "copied") setToast(t("copied"));
    else if (r === "failed") setToast(t("failed"));
    close();
  };

  const onCopy = async () => {
    setToast((await copyText(url())) ? t("copied") : t("failed"));
    close();
  };

  const onOpenChats = async () => {
    setView("chats");
    setTargets(null);
    setSearch("");
    try {
      let token = getAuthToken();
      if (!token) token = await ensureAccessToken();
      closeChat();
      chatRef.current = openQuickChat(token);
      const rooms = await chatRef.current.rooms();
      setTargets(
        createShareTargetsFromRooms({
          rooms,
          currentUserId: userIdFromToken(token),
          users: rooms.flatMap((r) =>
            r.directPeer ? [{ ...r.directPeer, nickname: r.directPeer.nickname?.trim() || undefined }] : [],
          ),
          labels: {
            globalChatTitle: tChat("globalChatTitle"),
            shareWithJesusTitle: tChat("shareWithJesusTitle"),
            directChatFallback: tChat("chatFallback"),
          },
          // службовий чат «Поділись з Ісусом» - не для запрошень
          includeShareWithJesus: false,
        }),
      );
    } catch {
      setTargets([]);
    }
  };

  const onPick = async (target: ShareTarget) => {
    if (!chatRef.current || sendingTo) return;
    setSendingTo(target.roomId);
    const result = await chatRef.current.send(target.roomId, buildFlockInviteMessage(currentArena()));
    setSendingTo(null);
    if (result.ok) {
      setToast(t("sent", { chat: target.title }));
      close();
    } else if (result.retryAfterSec) {
      setToast(t("rateLimited", { seconds: result.retryAfterSec }));
    } else {
      setToast(t("sendFailed"));
    }
  };

  const visibleTargets = targets ? filterShareTargets(targets, search) : null;

  return (
    <div className={`${styles.wrap} ${className ?? ""}`} ref={wrapRef}>
      <button type="button" className={styles.trigger} onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-haspopup="menu">
        <UserPlus size={16} aria-hidden />
        <span>{t("button")}</span>
      </button>

      {open ? (
        <div className={`${styles.menu} ${direction === "up" ? styles.up : ""}`} role="menu">
          {view === "menu" ? (
            <>
              {canUseWebShare() ? (
                <button type="button" role="menuitem" onClick={onShare}>
                  <Share2 size={16} aria-hidden /> {t("share")}
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={onCopy}>
                <Link2 size={16} aria-hidden /> {t("copy")}
              </button>
              <button type="button" role="menuitem" onClick={onOpenChats}>
                <MessageSquare size={16} aria-hidden /> {t("toChat")}
              </button>
            </>
          ) : (
            <>
              <p className={styles.menuTitle}>{t("pickChat")}</p>
              <input
                type="search"
                className={styles.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchChats")}
                aria-label={t("searchChats")}
              />
              <div className={styles.chatList}>
                {visibleTargets === null ? <p className={styles.hint}>{t("loading")}</p> : null}
                {visibleTargets && visibleTargets.length === 0 ? (
                  <p className={styles.hint}>{search.trim() ? t("noMatches") : t("noChats")}</p>
                ) : null}
                {visibleTargets?.map((target, i) => {
                  const showHeader = i > 0 && target.kind !== visibleTargets[i - 1].kind && target.kind !== "global";
                  const firstOfKind = i === 0 ? target.kind !== "global" : showHeader;
                  return (
                    <div key={target.roomId}>
                      {firstOfKind && target.kind === "group" ? <p className={styles.sectionTitle}>{t("sectionGroups")}</p> : null}
                      {firstOfKind && target.kind === "direct" ? <p className={styles.sectionTitle}>{t("sectionDirect")}</p> : null}
                      <button type="button" role="menuitem" onClick={() => onPick(target)} disabled={sendingTo !== null}>
                        <span className={styles.chatName}>{target.title}</span>
                        {sendingTo === target.roomId ? <span className={styles.hint}>…</span> : null}
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" role="menuitem" className={styles.back} onClick={() => setView("menu")}>
                {t("back")}
              </button>
            </>
          )}
        </div>
      ) : null}

      {toast ? (
        <p className={styles.toast} role="status">
          <Check size={14} aria-hidden /> {toast}
        </p>
      ) : null}
    </div>
  );
}

/** `sub` із JWT access-токена: потрібен, щоб відрізнити «свого» співрозмовника в `dm:idA:idB`. */
function userIdFromToken(token: string): string | undefined {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}
