"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Gamepad2, Search } from "lucide-react";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import Sheet from "@/components/Cinema/Sheet";
import { useRouter } from "@/i18n/navigation";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { GLOBAL_ROOM_ID } from "@/lib/chatRooms";
import { buildFlockInviteMessage } from "@/lib/flockInviteMessage";
import { PAIR_GAMES, buildGameInviteMessage, type PairGameId } from "@/lib/gameInviteMessage";
import { openQuickInvite, type QuickInviteClient } from "@/lib/quickInvite";
import { getInitials } from "@/lib/utils";
import styles from "./GlobalGamesMenu.module.scss";

export type GamePeer = {
  id: string;
  username: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
};

type Props = {
  currentUserId: string | undefined;
  /** Учасники загального чату (з відміткою «онлайн»). */
  participants: GamePeer[];
  /** Класи кнопки (як у кнопки-геймпада особистого чату) — щоб шапка лишалась однорідною. */
  buttonClassName: string;
  wrapClassName: string;
  menuClassName: string;
  itemClassName: string;
  iconClassName: string;
  onNotice: (text: string) => void;
};

const GAME_ICONS: Record<PairGameId, string> = {
  snake: "🐍",
  doodle: "🟢",
  guess: "🔍",
  puzzle: "🧩",
};

const peerName = (p: GamePeer) => p.nickname?.trim() || p.username;

/**
 * Кнопка-геймпад у шапці загального чату. «Отара» — відкрити спільну арену або покликати всіх карточкою
 * в загальний чат (не частіше разу на хвилину — ліміт на сервері); парні ігри — вибрати суперника зі списку
 * учасників: йому в особистий чат йде запрошення, а в нас відкривається особистий чат із грою.
 */
export default function GlobalGamesMenu({
  currentUserId,
  participants,
  buttonClassName,
  wrapClassName,
  menuClassName,
  itemClassName,
  iconClassName,
  onNotice,
}: Props) {
  const t = useTranslations("globalGames");
  const tInvite = useTranslations("chatShared.gameInvite");
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickGame, setPickGame] = useState<PairGameId | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const startPick = (game: PairGameId) => {
    setMenuOpen(false);
    setQuery("");
    setPickGame(game);
  };

  const closePicker = () => {
    if (busyId) return;
    setPickGame(null);
    closeClient();
  };

  const invite = async (peer: GamePeer) => {
    if (!pickGame || busyId) return;
    const game = pickGame;
    setBusyId(peer.id);
    try {
      const client = await connect();
      const roomId = await client.openDirect(peer.id);
      if (!roomId) throw new Error("no room");
      const result = await client.send(roomId, buildGameInviteMessage(game));
      if (!result.ok) throw new Error("send failed");
      closeClient();
      setPickGame(null);
      // Той самий особистий чат, що й у меню ігор DM: сторінка сама відкриє гру за `?game=`.
      router.push(`/chat/${peer.id}?game=${game}`);
    } catch {
      onNotice(t("inviteFailed"));
      closeClient();
    } finally {
      setBusyId(null);
    }
  };

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^@/, "");
    return participants
      .filter((p) => p.id !== currentUserId)
      .filter(
        (p) =>
          !needle ||
          p.username.toLowerCase().includes(needle) ||
          (p.nickname ?? "").toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(b.isOnline) - Number(a.isOnline) ||
          peerName(a).localeCompare(peerName(b), undefined, { sensitivity: "base" }),
      );
  }, [participants, currentUserId, query]);

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
            <span className={iconClassName} aria-hidden>🐑</span>
            <span>{t("flock")}</span>
          </button>
          <button type="button" className={`${itemClassName} ${styles.sub}`} role="menuitem" onClick={callEveryone}>
            <span className={iconClassName} aria-hidden>🐑</span>
            <span>{t("flockCallAll")}</span>
          </button>
          <p className={styles.groupTitle}>{t("pairHeader")}</p>
          {PAIR_GAMES.map((game) => (
            <button key={game} type="button" className={itemClassName} role="menuitem" onClick={() => startPick(game)}>
              <span className={iconClassName} aria-hidden>{GAME_ICONS[game]}</span>
              <span>{tInvite(`games.${game}`)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <Sheet
        open={pickGame !== null}
        onClose={closePicker}
        title={pickGame ? t("pickTitle", { game: tInvite(`games.${pickGame}`) }) : ""}
      >
        <p className={styles.hint}>{t("pickHint")}</p>
        <label className={styles.search}>
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </label>
        <ul className={styles.list}>
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" className={styles.row} onClick={() => invite(p)} disabled={busyId !== null}>
                <span className={styles.avatar}>
                  <AvatarWithFallback
                    src={resolvePublicAvatarUrl(p.avatarUrl)}
                    initials={getInitials(peerName(p))}
                    colorSeed={p.id}
                    width={36}
                    height={36}
                    imageClassName={styles.avatarImg}
                    fallbackClassName={styles.avatarFallback}
                    fallbackTag="span"
                  />
                  {p.isOnline ? <span className={styles.dot} aria-label={t("online")} /> : null}
                </span>
                <span className={styles.name}>{peerName(p)}</span>
                <span className={styles.status}>
                  {busyId === p.id ? t("sending") : p.isOnline ? t("online") : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {people.length === 0 ? <p className={styles.hint}>{t("noPeople")}</p> : null}
      </Sheet>
    </div>
  );
}
