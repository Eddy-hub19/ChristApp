"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { SKINS } from "@/components/FlockMiniGame/flockSkins";
import FlockResumeBanner from "@/components/FlockMiniGame/FlockResumeBanner";
import GameInvitePicker, { type GamePeer } from "@/components/GlobalGamesMenu/GameInvitePicker";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import GameIcon from "@/lib/games/gameIcons";
import { GAME_REGISTRY, type GameId } from "@/lib/games/gameRegistry";
import type { PairGameId } from "@/lib/gameInviteMessage";
import SoloPuzzleHost from "./SoloPuzzleHost";
import styles from "./games.module.scss";

const DoodleMiniGame = dynamic(() => import("@/components/DoodleMiniGame/DoodleMiniGame"), { ssr: false });
const ChristianFilwordMiniGame = dynamic(
  () => import("@/components/ChristianFilwordMiniGame/ChristianFilwordMiniGame"),
  { ssr: false },
);

/** Ігри, що запускаються одразу з цієї сторінки без співрозмовника. */
type SoloGame = "doodle" | "filword" | "puzzle";
const isSoloGame = (v: unknown): v is SoloGame => v === "doodle" || v === "filword" || v === "puzzle";

/** Порядок карток: «Отара» — окрема картка зверху, далі решта за реєстром. */
const OTHER_GAMES = (Object.keys(GAME_REGISTRY) as GameId[]).filter((g) => g !== "flock");

export default function GamesPage() {
  const t = useTranslations("games");
  const { user, users, loading } = useAuth({ redirectIfUnauthenticated: "/" });
  const [soloGame, setSoloGame] = useState<SoloGame | null>(null);
  const [pickGame, setPickGame] = useState<PairGameId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [doodleScore, setDoodleScore] = useState(0);
  const [doodleKey, setDoodleKey] = useState(0);

  // Перехід із меню ігор загального чату: /games?play=filword|puzzle одразу запускає гру.
  useEffect(() => {
    const play = new URLSearchParams(window.location.search).get("play");
    if (!isSoloGame(play)) return;
    const timer = setTimeout(() => setSoloGame(play), 0);
    window.history.replaceState(window.history.state, "", window.location.pathname);
    return () => clearTimeout(timer);
  }, []);

  const peers = useMemo<GamePeer[]>(
    () =>
      users.map((u) => ({
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        isOnline: false,
        lastSeenAt: u.lastSeenAt,
      })),
    [users],
  );

  const closeSolo = useCallback(() => setSoloGame(null), []);
  const startDoodle = () => {
    setDoodleScore(0);
    setDoodleKey((k) => k + 1);
    setSoloGame("doodle");
  };

  const launch = (game: GameId) => {
    setNotice(null);
    if (game === "doodle") startDoodle();
    else if (game === "filword" || game === "puzzle") setSoloGame(game);
    else setPickGame(game as PairGameId);
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link href="/chat" className={styles.back} aria-label={t("back")} title={t("back")}>
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div>
          <h1>
            <Gamepad2 size={22} aria-hidden /> {t("title")}
          </h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>

      <div className={styles.cards}>
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        <FlockResumeBanner />
        <Link href="/games/flock" className={styles.card} prefetch={false}>
          <span className={styles.art} aria-hidden>
            {SKINS.slice(0, 3).map((s, i) => (
              <span key={i} className={styles.blob} style={{ background: s.fur, left: `${i * 26}px`, zIndex: 3 - i }} />
            ))}
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardTitle}>
              <GameIcon game="flock" size={20} className={styles.cardIcon} /> {t("flock.title")}
            </span>
            <span className={styles.cardDesc}>{t("flock.desc")}</span>
          </span>
          <span className={styles.cta}>{t("flock.cta")}</span>
        </Link>

        {OTHER_GAMES.map((game) => {
          const withInvite = game === "doodle" || game === "puzzle";
          return (
            <div key={game} className={styles.cardWrap}>
              <button type="button" className={styles.card} onClick={() => launch(game)} disabled={!user}>
                <span className={styles.cardBody}>
                  <span className={styles.cardTitle}>
                    <GameIcon game={game} size={20} className={styles.cardIcon} /> {t(`${game}.title`)}
                  </span>
                  <span className={styles.cardDesc}>{t(`${game}.desc`)}</span>
                </span>
                <span className={styles.cta}>{t(`${game}.cta`)}</span>
              </button>
              {withInvite ? (
                <button
                  type="button"
                  className={styles.inviteLink}
                  onClick={() => setPickGame(game as PairGameId)}
                  disabled={!user}
                >
                  {t("invite")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {soloGame === "doodle" ? (
        <DoodleMiniGame
          key={doodleKey}
          open
          myScore={doodleScore}
          peerScore={0}
          peerName=""
          peerState={null}
          onClose={closeSolo}
          onScoreChange={setDoodleScore}
        />
      ) : null}
      {soloGame === "filword" ? <ChristianFilwordMiniGame open onClose={closeSolo} /> : null}
      {soloGame === "puzzle" && user ? (
        <SoloPuzzleHost
          userId={user.id}
          myName={user.nickname ?? user.username}
          myAvatarUrl={resolvePublicAvatarUrl(user.avatarUrl)}
          onClose={closeSolo}
          onFail={() => {
            setSoloGame(null);
            setNotice(t("fail"));
          }}
        />
      ) : null}

      <GameInvitePicker
        game={pickGame}
        onClose={() => setPickGame(null)}
        currentUserId={user?.id}
        participants={peers}
        peopleLoading={loading}
        onNotice={setNotice}
      />
    </section>
  );
}
