"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Gamepad2 } from "lucide-react";
import { MegaphoneIcon } from "@/components/icons/game";
import { useRouter } from "@/i18n/navigation";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { GLOBAL_ROOM_ID } from "@/lib/chatRooms";
import { buildFlockInviteMessage } from "@/lib/flockInviteMessage";
import GameIcon from "@/lib/games/gameIcons";
import { openQuickInvite, type QuickInviteClient } from "@/lib/quickInvite";
import styles from "./GlobalGamesMenu.module.scss";

type Props = {
  /** Открыть «Угадай персонажа» в одиночном режиме прямо в этом чате. */
  onOpenGuessSolo: () => void;
  /** Классы кнопки (как у кнопки-геймпада личного чата) — чтобы шапка оставалась однородной. */
  buttonClassName: string;
  wrapClassName: string;
  menuClassName: string;
  itemClassName: string;
  iconClassName: string;
  onNotice: (text: string) => void;
};

/**
 * Кнопка-геймпад у шапці загального чату. «Отара» — відкрити спільну арену або покликати всіх карточкою
 * в загальний чат (не частіше разу на хвилину — ліміт на сервері); парні ігри — вибрати суперника зі списку
 */
export default function GlobalGamesMenu({
  onOpenGuessSolo,
  buttonClassName,
  wrapClassName,
  menuClassName,
  itemClassName,
  iconClassName,
  onNotice,
}: Props) {
  const t = useTranslations("globalGames");
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<QuickInviteClient | null>(null);

  const closeClient = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
  }, []);
  useEffect(() => closeClient, [closeClient]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const connect = useCallback(async () => {
    let token = getAuthToken();
    if (!token) token = await ensureAccessToken();
    closeClient();
    clientRef.current = openQuickInvite(token);
    return clientRef.current;
  }, [closeClient]);

  const openFlock = () => {
    setMenuOpen(false);
    router.push("/games/flock");
  };

  const callEveryone = async () => {
    setMenuOpen(false);
    try {
      const client = await connect();
      const result = await client.send(GLOBAL_ROOM_ID, buildFlockInviteMessage(null));
      if (result.ok) onNotice(t("flockSent"));
      else if (result.retryAfterSec) onNotice(t("rateLimited", { seconds: result.retryAfterSec }));
      else onNotice(t("inviteFailed"));
    } catch {
      onNotice(t("inviteFailed"));
    } finally {
      closeClient();
    }
  };

  const startGuessSolo = () => {
    setMenuOpen(false);
    onOpenGuessSolo();
  };

  return (
    <div className={wrapClassName} ref={wrapRef}>
      <button
        type="button"
        className={buttonClassName}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        aria-label={t("open")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={t("open")}
      >
        <Gamepad2 size={18} strokeWidth={2.1} aria-hidden />
      </button>

      {menuOpen ? (
        <div className={menuClassName} role="menu" onClick={(event) => event.stopPropagation()}>
          <button type="button" className={itemClassName} role="menuitem" onClick={openFlock}>
            <GameIcon game="flock" className={iconClassName} />
            <span>{t("flock")}</span>
          </button>
          <button type="button" className={`${itemClassName} ${styles.sub}`} role="menuitem" onClick={callEveryone}>
            <MegaphoneIcon size={18} className={iconClassName} />
            <span>{t("flockCallAll")}</span>
          </button>
          <button type="button" className={itemClassName} role="menuitem" onClick={startGuessSolo}>
            <GameIcon game="guess" className={iconClassName} />
            <span>{t("guessSolo")}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
