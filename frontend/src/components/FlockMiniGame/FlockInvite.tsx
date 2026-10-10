"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Link2, MessageSquare, Share2, UserPlus } from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { openQuickChat, type QuickChat } from "@/lib/chatQuickSend";
import { isShareWithJesusRoomTitle } from "@/lib/chatRooms";
import { buildFlockInviteMessage } from "@/lib/flockInviteMessage";
import { buildFlockInviteUrl, canUseWebShare, copyText, shareInvite } from "@/lib/flockInviteShare";
import type { MyRoomItem } from "@/types/chat/socket.types";
import styles from "./FlockInvite.module.scss";

type Props = {
  /** Арена, куди кличемо; null (лобі, ще не зайшли) - посилання в "Отару" взагалі. Функція читається в момент кліку. */
  arenaId: number | null | (() => number | null);
  /** Куди відкривається меню: вгору (HUD знизу) чи вниз. */
  direction?: "down" | "up";
  className?: string;
};

type View = "menu" | "chats";

function roomLabel(r: MyRoomItem) {
  return r.directPeer?.nickname?.trim() || r.directPeer?.username || r.title;
}

/** Кнопка «Запросити»: системне «Поділитися» / копіювання посилання / надіслати в чат карткою-запрошенням. */
export default function FlockInvite({ arenaId, direction = "down", className }: Props) {
  const t = useTranslations("flock.invite");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [toast, setToast] = useState<string | null>(null);
  const [rooms, setRooms] = useState<MyRoomItem[] | null>(null);
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
    setRooms(null);
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
    setRooms(null);
    try {
      let token = getAuthToken();
      if (!token) token = await ensureAccessToken();
      closeChat();
      chatRef.current = openQuickChat(token);
      // службовий чат «Поділись з Ісусом» - не для запрошень
      setRooms((await chatRef.current.rooms()).filter((r) => !isShareWithJesusRoomTitle(r.title)));
    } catch {
      setRooms([]);
    }
  };

  const onPick = async (room: MyRoomItem) => {
    if (!chatRef.current || sendingTo) return;
    setSendingTo(room.id);
    const ok = await chatRef.current.send(room.id, buildFlockInviteMessage(currentArena()));
    setSendingTo(null);
    setToast(ok ? t("sent", { chat: roomLabel(room) }) : t("sendFailed"));
    if (ok) close();
  };

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
              <div className={styles.chatList}>
                {rooms === null ? <p className={styles.hint}>{t("loading")}</p> : null}
                {rooms && rooms.length === 0 ? <p className={styles.hint}>{t("noChats")}</p> : null}
                {rooms?.map((r) => (
                  <button key={r.id} type="button" role="menuitem" onClick={() => onPick(r)} disabled={sendingTo !== null}>
                    <span className={styles.chatName}>{roomLabel(r)}</span>
                    {sendingTo === r.id ? <span className={styles.hint}>…</span> : null}
                  </button>
                ))}
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
