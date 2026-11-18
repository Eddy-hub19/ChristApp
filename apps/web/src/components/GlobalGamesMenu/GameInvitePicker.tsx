"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import Sheet from "@/components/Cinema/Sheet";
import { useRouter } from "@/i18n/navigation";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { buildGameInviteMessage, type PairGameId } from "@/lib/gameInviteMessage";
import { openQuickInvite, type QuickInviteClient } from "@/lib/quickInvite";
import { formatLastSeenRelative } from "@/lib/chatLastSeenFormat";
import { sortByActivity, activitySectionOf } from "@/lib/memberActivity";
import { useSettledOrder } from "@/hooks/useSettledOrder";
import { getInitials } from "@/lib/utils";
import styles from "./GlobalGamesMenu.module.scss";

export type GamePeer = {
  id: string;
  username: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
  lastSeenAt?: string | null;
};

const peerName = (p: GamePeer) => p.nickname?.trim() || p.username;

/** Повторне запрошення тій самій людині раніше за цей час не шлемо (подвійний тап, повтор після помилки). */
const INVITE_DEDUPE_MS = 5000;
/** Скільки чекаємо на учасників, перш ніж сказати «нікого немає». */
const PEOPLE_GRACE_MS = 3000;

type Props = {
  /** Гра, для якої обираємо суперника; null — вікно закрите. */
  game: PairGameId | null;
  onClose: () => void;
  currentUserId: string | undefined;
  participants: GamePeer[];
  /** Список людей ще вантажиться (показуємо скелетон замість «нікого не знайдено»). */
  peopleLoading?: boolean;
  onNotice: (text: string) => void;
};

/**
 * Вибір суперника для парної гри: йому в особистий чат іде запрошення, а в нас відкривається особистий чат
 * із грою (`?game=`). Спільний для меню загального чату й сторінки «Ігри».
 */
export default function GameInvitePicker({
  game,
  onClose,
  currentUserId,
  participants,
  peopleLoading = false,
  onNotice,
}: Props) {
  const t = useTranslations("globalGames");
  const tInvite = useTranslations("chatShared.gameInvite");
  const tChat = useTranslations("chat");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Підписи «був у мережі» й розділ «нещодавно» рахуємо від моменту відкриття списку. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [graceOver, setGraceOver] = useState(false);
  const open = game !== null;
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setNowMs(Date.now()), 0);
    const grace = setTimeout(() => setGraceOver(true), PEOPLE_GRACE_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(grace);
      setGraceOver(false);
      setQuery("");
    };
  }, [open]);
  const clientRef = useRef<QuickInviteClient | null>(null);
  const recentRef = useRef(new Map<string, number>());

  const closeClient = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
  }, []);
  useEffect(() => closeClient, [closeClient]);

  const connect = useCallback(async () => {
    let token = getAuthToken();
    if (!token) token = await ensureAccessToken();
    closeClient();
    clientRef.current = openQuickInvite(token);
    return clientRef.current;
  }, [closeClient]);

  /**
   * Свіжий короткоживучий сокет → особиста кімната → повідомлення-запрошення. Якщо кімнату відкрити не вдалось
   * (сокет не встиг підключитись) — одна автоматична повторна спроба; повторно саме повідомлення не шлемо,
   * щоб не продублювати запрошення, яке могло дійти без підтвердження.
   */
  const attempt = useCallback(
    async (peerId: string, g: PairGameId) => {
      let client = await connect();
      let roomId = await client.openDirect(peerId);
      if (!roomId) {
        client = await connect();
        roomId = await client.openDirect(peerId);
      }
      if (!roomId) throw new Error("no room");
      const result = await client.send(roomId, buildGameInviteMessage(g));
      if (!result.ok) throw new Error("send failed");
    },
    [connect],
  );

  const invite = async (peer: GamePeer) => {
    if (!game || busyId) return;
    const picked = game;
    const last = recentRef.current.get(peer.id);
    const duplicate = last !== undefined && Date.now() - last < INVITE_DEDUPE_MS;
    setBusyId(peer.id);
    try {
      if (!duplicate) {
        await attempt(peer.id, picked);
        recentRef.current.set(peer.id, Date.now());
      }
      closeClient();
      onClose();
      // Той самий особистий чат, що й у меню ігор DM: сторінка сама відкриє гру за `?game=`.
      router.push(`/chat/${peer.id}?game=${picked}`);
    } catch {
      onNotice(t("inviteFailed"));
      closeClient();
    } finally {
      setBusyId(null);
    }
  };

  const handleClose = () => {
    if (busyId) return;
    closeClient();
    onClose();
  };

  const sortedPeople = useMemo(
    () =>
      sortByActivity(
        participants.filter((p) => p.id !== currentUserId),
        (p) => ({ name: peerName(p), isOnline: p.isOnline, lastSeenAt: p.lastSeenAt }),
      ),
    [participants, currentUserId],
  );

  // Порядок за активністю, але без «стрибків» під пальцем: пересортування з затримкою і не під час скролу.
  const settledPeople = useSettledOrder(
    sortedPeople,
    (p) => p.id,
    (p) => activitySectionOf({ name: "", isOnline: p.isOnline, lastSeenAt: p.lastSeenAt }, nowMs),
  );

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^@/, "");
    return settledPeople
      .map(({ item }) => item)
      .filter(
        (p) =>
          !needle ||
          p.username.toLowerCase().includes(needle) ||
          (p.nickname ?? "").toLowerCase().includes(needle),
      );
  }, [settledPeople, query]);

  /** Порожньо, але дані ще можуть прийти: пропс від батька або короткий пільговий період після відкриття. */
  const loadingPeople = sortedPeople.length === 0 && (peopleLoading || (open && !graceOver));

  const statusFor = (p: GamePeer) => {
    if (p.isOnline) return t("online");
    if (!p.lastSeenAt) return tChat("lastSeenLongAgo");
    return formatLastSeenRelative(p.lastSeenAt, nowMs, {
      justNow: () => tChat("lastSeenJustNow"),
      minutes: (count) => tChat("lastSeenMinutes", { count }),
      hours: (count) => tChat("lastSeenHours", { count }),
      days: (count) => tChat("lastSeenDays", { count }),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={game ? t("pickTitle", { game: tInvite(`games.${game}`) }) : ""}
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
      <ul className={styles.list} aria-busy={loadingPeople}>
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
              <span className={styles.status}>{busyId === p.id ? t("sending") : statusFor(p)}</span>
            </button>
          </li>
        ))}
        {loadingPeople
          ? [0, 1, 2, 3].map((i) => (
              <li key={`sk${i}`} className={styles.skeletonRow} aria-hidden>
                <span className={styles.skeletonAvatar} />
                <span className={styles.skeletonLine} />
              </li>
            ))
          : null}
      </ul>
      {loadingPeople ? (
        <p className={styles.hint} role="status">
          {t("loadingPeople")}
        </p>
      ) : people.length === 0 ? (
        <p className={styles.hint}>{t("noPeople")}</p>
      ) : null}
    </Sheet>
  );
}
