"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  MoreVertical,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import {
  acceptWatchInvite,
  declineWatchInvite,
  deleteWatchRoom,
  leaveWatchRoom,
  watchUserName,
} from "@/lib/queries/watchRoomsQueries";
import { youTubeThumbnailUrl, youTubeWatchUrl } from "@/lib/youtube";
import { expectedPosition, AUTO_SYNC_PROVIDERS, type ServerClock, type WatchState } from "@/lib/watchSync";
import FloatingReactions, { type FloatingReactionsHandle } from "./FloatingReactions";
import HeaderMemberStack from "./HeaderMemberStack";
import HostControls from "./HostControls";
import InviteSheet, { buildInviteUrl } from "./InviteSheet";
import ManualStage from "./ManualStage";
import ManualSyncControls from "./ManualSyncControls";
import MobileStageControls from "./MobileStageControls";
import ParticipantsSheet from "./ParticipantsSheet";
import SeatsRow from "./SeatsRow";
import Sheet from "./Sheet";
import VideoLinkField, { type PickedVideo } from "./VideoLinkField";
import YouTubePicker from "./YouTubePicker";
import WatchChat from "./WatchChat";
import YouTubeStage from "./YouTubeStage";
import VimeoStage from "./players/VimeoStage";
import DailymotionStage from "./players/DailymotionStage";
import FileStage from "./players/FileStage";
import type { PlayerAdapterHandle, StageStatus } from "./players/types";
import { useWatchHall, type HallEvent, type HallMember } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

const VOLUME_KEY = "cinema:volume";

function readStoredVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 100 && window.localStorage.getItem(VOLUME_KEY) !== null
      ? v
      : 80;
  } catch {
    return 80;
  }
}

type Dialog =
  | "invite"
  | "changeVideo"
  | "suggestVideo"
  | "leave"
  | "delete"
  | "participants"
  | { transferTo: HallMember }
  | null;

export default function WatchHall({ roomId }: { roomId: string }) {
  const t = useTranslations("cinema");
  const router = useRouter();
  const { user } = useAuth({ redirectIfUnauthenticated: "/" });
  const me = user?.id;

  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const membersRef = useRef<HallMember[]>([]);
  const onHallEvent = useCallback(
    (event: HallEvent) => {
      if (event.type === "hostChanged") {
        const host = membersRef.current.find((m) => m.id === event.hostId);
        showToast(
          event.hostId === me
            ? t("hall.youAreHost")
            : t("hall.hostChanged", { name: watchUserName(host) }),
        );
      } else if (event.type === "hostAway") {
        showToast(t("hall.hostAway"));
      } else if (event.code === "NOT_EMBEDDABLE" || event.code === "NOT_FOUND") {
        showToast(t(`errors.${event.code}`));
      } else if (event.code === "NOT_HOST") {
        showToast(t("hall.notHost"));
      } else if (event.code === "INVALID_PHASE") {
        // Гонка подвійного тапу (напр. "Почати" двічі поспіль) — стан однаково прийде окремим
        // watch:state від іншого клієнта чи повторної спроби, тост тут зайвий.
      } else if (event.type === "commandRejected") {
        showToast(t("errors.generic"));
      }
    },
    [me, showToast, t],
  );

  const hall = useWatchHall(roomId, onHallEvent);
  useEffect(() => {
    membersRef.current = hall.members;
  }, [hall.members]);

  const [entered, setEntered] = useState(false);
  // Зала рендериться лише на клієнті після входу через сокет, тож читати localStorage тут безпечно.
  const [volume, setVolume] = useState(() =>
    typeof window === "undefined" ? 80 : readStoredVolume(),
  );
  const [muted, setMuted] = useState(false);
  const [stage, setStage] = useState<StageStatus | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<PickedVideo | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  // iPhone Safari: немає fullscreen для довільних елементів і немає screen.orientation.lock,
  // тож коли телефон у портреті, розгортаємо театр і повертаємо його на 90° засобами CSS.
  const [pseudoRotated, setPseudoRotated] = useState(false);

  const stageRef = useRef<PlayerAdapterHandle | null>(null);
  const theaterRef = useRef<HTMLDivElement>(null);
  const reactionsRef = useRef<FloatingReactionsHandle>(null);

  // Зала завжди «темна» і на весь екран: ховаємо прокрутку сторінки під нею.
  useEffect(() => {
    document.body.classList.add("cinemaHallOpen");
    return () => document.body.classList.remove("cinemaHallOpen");
  }, []);

  // На iOS 100dvh не стискається під клавіатуру — стискається лише visual viewport.
  // Той самий хук, що й у /chat: зала підлаштовується під --vv-height, плеєр лишається зверху.
  useKeyboardInset();

  useEffect(() => {
    const onChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (!fs) {
        try {
          (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
        } catch {
          // деякі браузери кидають, якщо lock ніколи не викликався — не критично
        }
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Поки активний псевдо-fullscreen, стежимо за орієнтацією: обертаємо театр лише в портреті.
  useEffect(() => {
    if (!pseudoFullscreen || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setPseudoRotated(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [pseudoFullscreen]);

  const state = hall.state;
  const isHost = Boolean(me && state?.hostId === me);
  const host = useMemo(
    () => hall.members.find((m) => m.id === state?.hostId) ?? null,
    [hall.members, state?.hostId],
  );
  const hostName = watchUserName(host);

  const changeVolume = (v: number) => {
    setVolume(v);
    setMuted(v === 0);
    if (stage?.autoplayMuted && v > 0) stageRef.current?.unmuteAfterGesture();
    try {
      window.localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      // приватний режим — гучність просто не запам'ятається
    }
  };

  const toggleMute = () => {
    if (stage?.autoplayMuted) {
      stageRef.current?.unmuteAfterGesture();
      setMuted(false);
      return;
    }
    setMuted((m) => !m);
  };

  const toggleFullscreen = async () => {
    const el = theaterRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      setPseudoRotated(false);
      return;
    }
    if (document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        // Тільки Android Chrome підтримує lock без обертання самим пристроєм; iOS і десктоп — ігнорують.
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })
          ?.lock?.("landscape")
          .catch(() => undefined);
      } catch {
        setPseudoFullscreen(true);
      }
    } else {
      // iPhone Safari не вміє fullscreen для довільних елементів — розгортаємо засобами CSS.
      setPseudoFullscreen(true);
    }
  };

  // Натискання хоста на play/scrubber ДО того, як плеєр змонтований (ще не було жесту
  // для автоплею) — саме є тим жестом: монтуємо плеєр і одразу шлемо команду з позиції
  // з серверного стану (stageRef ще порожній). Плеєр, щойно змонтувавшись, сам підхопить
  // щойно надіслану позицію — той самий шлях, яким і глядач приєднується до вже активного показу.
  const hostPlay = () => {
    if (!entered) setEntered(true);
    const pos = stageRef.current?.localPlay() ?? state?.positionSec ?? 0;
    hall.commands.play(pos);
  };
  const hostPause = () => {
    if (!entered) setEntered(true);
    const pos =
      stageRef.current?.localPause() ?? (state ? expectedPosition(state, hall.clock.now()) : 0);
    hall.commands.pause(pos);
  };
  const hostSeek = (sec: number) => {
    if (!entered) setEntered(true);
    stageRef.current?.localSeek(sec);
    hall.commands.seek(sec);
  };
  const onHostPlayerAction = useCallback(
    (action: { type: "play" | "pause"; positionSec: number }) => {
      if (action.type === "play") hall.commands.play(action.positionSec);
      else hall.commands.pause(action.positionSec);
    },
    [hall.commands],
  );

  // Свій емодзі летить одразу, з точки натиснутої кнопки — не чекаючи мережі. sendReaction
  // повертає, чи справді пішов emit (клієнтський рейт-ліміт дзеркалить серверний), щоб
  // FloatingReactions не чекав відлуння для тапів, які сервер і так не побачить.
  const handleReact = useCallback(
    (emoji: string, rect: DOMRect) => {
      const sent = hall.sendReaction(emoji);
      reactionsRef.current?.spawnLocal(emoji, rect, sent);
    },
    [hall],
  );

  const copyLink = async () => {
    setMenuOpen(false);
    if (!hall.inviteToken) return;
    try {
      await navigator.clipboard.writeText(buildInviteUrl(hall.inviteToken));
      showToast(t("hall.linkCopied"));
    } catch {
      showToast(buildInviteUrl(hall.inviteToken));
    }
  };

  const confirmLeave = async () => {
    setDialog(null);
    try {
      await leaveWatchRoom(roomId);
      router.replace("/cinema");
    } catch {
      showToast(t("errors.generic"));
    }
  };

  const confirmDelete = async () => {
    setDialog(null);
    try {
      await deleteWatchRoom(roomId);
      router.replace("/cinema");
    } catch {
      showToast(t("errors.generic"));
    }
  };

  const applyNewVideo = () => {
    if (!pendingVideo) return;
    hall.commands.changeVideo(
      pendingVideo.videoId,
      pendingVideo.startSec || undefined,
      pendingVideo.provider,
      pendingVideo.title ?? undefined,
      pendingVideo.thumbnailUrl ?? undefined,
    );
    setPendingVideo(null);
    setDialog(null);
  };

  // ================= НЕ В ЗАЛІ =================

  if (hall.status !== "ready" || !state) {
    return (
      <div className={styles.hall}>
        <div className={styles.hallMessage}>
          {hall.status === "connecting" ? (
            <>
              <Loader2 size={28} className={styles.spin} aria-hidden />
              <p>{t("hall.connecting")}</p>
            </>
          ) : hall.status === "invited" ? (
            <>
              <Clapperboard size={32} aria-hidden />
              <h1>{t("hall.invitedTitle", { title: hall.roomTitle })}</h1>
              <div className={styles.hallMessageActions}>
                <button
                  type="button"
                  className={styles.hallPrimary}
                  onClick={async () => {
                    try {
                      await acceptWatchInvite(roomId);
                      hall.rejoin();
                    } catch {
                      showToast(t("errors.generic"));
                    }
                  }}
                >
                  {t("accept")}
                </button>
                <button
                  type="button"
                  className={styles.hallGhost}
                  onClick={async () => {
                    await declineWatchInvite(roomId).catch(() => undefined);
                    router.replace("/cinema");
                  }}
                >
                  {t("decline")}
                </button>
              </div>
            </>
          ) : (
            <>
              <Clapperboard size={32} aria-hidden />
              <h1>
                {hall.status === "deleted"
                  ? t("hall.roomDeleted")
                  : hall.status === "removed"
                    ? t("hall.removed")
                    : hall.status === "forbidden"
                      ? t("hall.notMember")
                      : t("hall.notFound")}
              </h1>
              <Link href="/cinema" className={styles.hallPrimary}>
                {t("hall.back")}
              </Link>
            </>
          )}
        </div>
        <Toast toast={toast} />
      </div>
    );
  }

  // ================= ЗАЛА =================

  const theaterClass = `${styles.theater} ${isFullscreen ? styles.theaterFullscreen : ""} ${pseudoFullscreen ? styles.theaterPseudoFullscreen : ""} ${pseudoFullscreen && pseudoRotated ? styles.theaterPseudoFullscreenRotated : ""}`;

  const isAutoSync = AUTO_SYNC_PROVIDERS.has(state.provider);
  // IFRAME/MANUAL ніколи не мають thumbnailUrl (resolveGeneric() на бекенді) — без цієї перевірки
  // <img> без src показав би "зламану картинку" замість просто чорного тла воріт входу.
  const enterGateThumb =
    state.provider === "YOUTUBE" ? youTubeThumbnailUrl(state.videoId, "hq") : state.thumbnailUrl;
  // Готовність — лише IFRAME/MANUAL (state.manual === null для інших); присутні, а не всі учасники,
  // бо готовність про "завантажив сторінку зараз", а не про членство в кімнаті.
  const readyCount = state.manual?.readyUserIds.length ?? 0;
  const totalCount = hall.presentIds.size;
  const isReady = Boolean(me && state.manual?.readyUserIds.includes(me));

  return (
    <div className={styles.hall}>
      <header className={styles.topbar}>
        <Link href="/cinema" className={styles.hallIconButton} aria-label={t("hall.back")}>
          <ArrowLeft size={20} />
        </Link>
        <div className={styles.topbarTitle}>
          <h1>{hall.roomTitle}</h1>
          {/* Десктоп: хто керує — вже показано в панелі під екраном, тут дублювати не треба. */}
          {state.videoTitle ? <p className={styles.topbarVideo}>{state.videoTitle}</p> : null}
          {/* Мобільний: панель керування — оверлей на відео, тож статус хоста дублюємо тут. */}
          <p className={styles.topbarStatusMobile}>
            {isHost ? t("hall.youControl") : t("hall.hostInControl", { name: hostName })}
          </p>
        </div>
        <button type="button" className={styles.inviteButton} onClick={() => setDialog("invite")}>
          <UserPlus size={16} aria-hidden />
          <span>{t("hall.invite")}</span>
        </button>
        <HeaderMemberStack
          members={hall.members}
          presentIds={hall.presentIds}
          onClick={() => setDialog("participants")}
          label={t("hall.participants")}
        />
        <div className={styles.menuWrap}>
          <button
            type="button"
            className={styles.hallIconButton}
            aria-label={t("hall.menu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={20} />
          </button>
          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                className={styles.menu}
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                {isHost ? (
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialog("changeVideo"); }}>
                    <Clapperboard size={16} aria-hidden /> {t("hall.changeVideo")}
                  </button>
                ) : (
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialog("suggestVideo"); }}>
                    <Clapperboard size={16} aria-hidden /> {t("hall.suggestVideo")}
                  </button>
                )}
                <button type="button" role="menuitem" onClick={copyLink}>
                  <Link2 size={16} aria-hidden /> {t("hall.copyLink")}
                </button>
                <a role="menuitem" href={sourceUrlFor(state)} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
                  <ExternalLink size={16} aria-hidden />{" "}
                  {state.provider === "YOUTUBE" ? t("hall.onYouTube") : t("hall.openSource")}
                </a>
                {isHost ? (
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialog("participants"); }}>
                    <Users size={16} aria-hidden /> {t("hall.transfer")}
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialog("leave"); }}>
                  <LogOut size={16} aria-hidden /> {t("hall.leave")}
                </button>
                {isHost ? (
                  <button type="button" role="menuitem" className={styles.menuDanger} onClick={() => { setMenuOpen(false); setDialog("delete"); }}>
                    <Trash2 size={16} aria-hidden /> {t("hall.delete")}
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      {!hall.isConnected ? (
        <div className={styles.connectionBanner} role="status">
          <WifiOff size={14} aria-hidden /> {t("hall.connectionLost")}
        </div>
      ) : null}

      {isHost && hall.suggestions.length > 0 ? (
        <div className={styles.suggestionsStrip} role="group" aria-label={t("hall.suggestions")}>
          {hall.suggestions.map((s) => (
            <div key={s.id} className={styles.suggestionChip}>
              <span className={styles.suggestionText}>
                <span className={styles.suggestionTitle}>{s.title}</span>
                <span className={styles.suggestionFrom}>
                  {t("hall.suggestionFrom", { name: watchUserName(s.user) })}
                </span>
              </span>
              <button
                type="button"
                className={styles.suggestionApply}
                aria-label={t("hall.applySuggestion")}
                onClick={() => {
                  hall.commands.changeVideo(s.videoId);
                  hall.dismissSuggestion(s.id);
                }}
              >
                <Check size={15} />
              </button>
              <button
                type="button"
                className={styles.suggestionDismiss}
                aria-label={t("hall.dismissSuggestion")}
                onClick={() => hall.dismissSuggestion(s.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.stageColumn}>
          <div ref={theaterRef} className={theaterClass}>
            <div className={styles.curtain} aria-hidden>
              <span className={styles.curtainLeft} />
              <span className={styles.curtainRight} />
            </div>
            <FloatingReactions
              ref={reactionsRef}
              subscribe={hall.subscribeReactions}
              currentUserId={me}
              members={hall.members}
            />

            <div className={styles.screenGlow}>
              <div className={styles.screen}>
                {entered && isAutoSync ? (
                  <StageForProvider
                    stageRef={stageRef}
                    state={state}
                    clock={hall.clock}
                    isHost={isHost}
                    volume={volume}
                    muted={muted}
                    onStatus={setStage}
                    onHostPlayerAction={onHostPlayerAction}
                    onHeartbeat={hall.commands.heartbeat}
                  />
                ) : entered ? (
                  // isAutoSync — вичерпний по WATCH_PROVIDERS, тож тут завжди IFRAME/MANUAL;
                  // явна перевірка лишень аби звузити тип для ManualStage, не для розгалуження логіки.
                  state.provider === "IFRAME" || state.provider === "MANUAL" ? (
                    <ManualStage provider={state.provider} url={state.videoId} title={state.videoTitle} />
                  ) : null
                ) : (
                  // До першого дотику плеєра ще немає: браузер дозволить звук лише після жесту.
                  <button type="button" className={styles.enterGate} onClick={() => setEntered(true)}>
                    {enterGateThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- прев'ю з i.ytimg.com чи іншого джерела
                      <img src={enterGateThumb} alt="" />
                    ) : null}
                    <span className={styles.enterGateInner}>
                      <span className={styles.enterGateButton}>{t("hall.joinPrompt")}</span>
                      {isAutoSync ? (
                        state.isPlaying ? (
                          <span className={styles.enterGateLive}>
                            <span className={styles.enterGateLiveDot} aria-hidden />
                            {t("hall.liveNow")}
                          </span>
                        ) : (
                          <span className={styles.enterGateHint}>{t("statusPaused")}</span>
                        )
                      ) : state.manual?.phase === "countdown" || state.manual?.phase === "running" ? (
                        <span className={styles.enterGateLive}>
                          <span className={styles.enterGateLiveDot} aria-hidden />
                          {t("hall.liveNow")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )}
                {entered && isAutoSync ? (
                  <MobileStageControls
                    stageRef={stageRef}
                    isHost={isHost}
                    isPlaying={state.isPlaying}
                    onPlay={hostPlay}
                    onPause={hostPause}
                    onSeek={hostSeek}
                    muted={muted}
                    onToggleMute={toggleMute}
                    isFullscreen={isFullscreen || pseudoFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                  />
                ) : entered && state.manual ? (
                  <ManualSyncControls
                    compact
                    manual={state.manual}
                    clock={hall.clock}
                    isHost={isHost}
                    isReady={isReady}
                    readyCount={readyCount}
                    totalCount={totalCount}
                    onToggleReady={() => hall.commands.manualReady(!isReady)}
                    onStart={hall.commands.manualStart}
                    onPause={hall.commands.manualPause}
                    onResume={hall.commands.manualResume}
                    isFullscreen={isFullscreen || pseudoFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                  />
                ) : null}
              </div>
            </div>

            <div className={styles.stageStatus} role="status">
              {stage?.error ? (
                <span className={styles.stageError}>
                  {t(
                    `errors.${
                      stage.error === "NOT_EMBEDDABLE" || stage.error === "NOT_FOUND" || stage.error === "CORS"
                        ? stage.error
                        : "playback"
                    }`,
                  )}
                  {isHost ? (
                    <button type="button" onClick={() => setDialog("changeVideo")}>
                      {t("hall.changeVideo")}
                    </button>
                  ) : null}
                </span>
              ) : stage?.autoplayMuted ? (
                <button type="button" className={styles.unmuteChip} onClick={toggleMute}>
                  <Volume2 size={14} aria-hidden /> {t("hall.unmuteToListen")}
                </button>
              ) : stage?.poorConnection ? (
                <span><WifiOff size={13} aria-hidden /> {t("hall.poorConnection")}</span>
              ) : stage?.buffering ? (
                <span><Loader2 size={13} className={styles.spin} aria-hidden /> {t("hall.buffering")}</span>
              ) : null}
            </div>

            {isAutoSync ? (
              <HostControls
                stageRef={stageRef}
                isHost={isHost}
                // Play/scrubber для хоста активні одразу: перший дотик і є жестом, що монтує плеєр
                // (hostPlay/hostPause/hostSeek самі це роблять), тож disabled тут більше не потрібен.
                entered={entered}
                onEnter={() => setEntered(true)}
                hostName={hostName}
                isPlaying={state.isPlaying}
                onPlay={hostPlay}
                onPause={hostPause}
                onSeek={hostSeek}
                volume={volume}
                muted={muted}
                onVolume={changeVolume}
                onToggleMute={toggleMute}
                isFullscreen={isFullscreen || pseudoFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            ) : entered && state.manual ? (
              <ManualSyncControls
                manual={state.manual}
                clock={hall.clock}
                isHost={isHost}
                isReady={isReady}
                readyCount={readyCount}
                totalCount={totalCount}
                onToggleReady={() => hall.commands.manualReady(!isReady)}
                onStart={hall.commands.manualStart}
                onPause={hall.commands.manualPause}
                onResume={hall.commands.manualResume}
                isFullscreen={isFullscreen || pseudoFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            ) : null}
          </div>

          <SeatsRow
            members={hall.members}
            hostId={state.hostId}
            presentIds={hall.presentIds}
            currentUserId={me}
            canTransfer={isHost}
            onSeatClick={(member) => setDialog({ transferTo: member })}
          />
        </div>

        <WatchChat
          messages={hall.messages}
          currentUserId={me}
          hostId={state.hostId}
          reactions={hall.reactionOptions}
          onSend={hall.sendMessage}
          onReact={handleReact}
        />
      </div>

      <InviteSheet
        open={dialog === "invite"}
        onClose={() => setDialog(null)}
        roomId={roomId}
        currentUserId={me}
        isHost={isHost}
        members={hall.members}
        inviteToken={hall.inviteToken}
        onToast={showToast}
      />

      <ParticipantsSheet
        open={dialog === "participants"}
        onClose={() => setDialog(null)}
        members={hall.members}
        hostId={state.hostId}
        presentIds={hall.presentIds}
        currentUserId={me}
        isHost={isHost}
        onTransfer={(member) => setDialog({ transferTo: member })}
        onInvite={() => setDialog("invite")}
        readyUserIds={state.manual?.readyUserIds}
      />

      <Sheet
        open={dialog === "changeVideo"}
        title={t("hall.changeVideo")}
        tone="hall"
        onClose={() => {
          setDialog(null);
          setPendingVideo(null);
        }}
        footer={
          <div className={styles.sheetActionsHall}>
            <button type="button" className={styles.hallGhost} onClick={() => setDialog(null)}>
              {t("create.cancel")}
            </button>
            <button type="button" className={styles.hallPrimary} disabled={!pendingVideo} onClick={applyNewVideo}>
              {t("hall.changeVideoSubmit")}
            </button>
          </div>
        }
      >
        {dialog === "changeVideo" ? <VideoLinkField onChange={setPendingVideo} autoFocus tone="hall" /> : null}
      </Sheet>

      <YouTubePicker
        open={dialog === "suggestVideo"}
        onClose={() => setDialog(null)}
        mode="suggest"
        tone="hall"
        onPick={(video) => {
          void hall.suggestVideo(video.videoId, video.title);
          setDialog(null);
          showToast(t("hall.suggestSent"));
        }}
      />

      <Sheet
        open={dialog === "leave" || dialog === "delete"}
        title={dialog === "delete" ? t("hall.delete") : t("hall.leave")}
        tone="hall"
        onClose={() => setDialog(null)}
        footer={
          <div className={styles.sheetActionsHall}>
            <button type="button" className={styles.hallGhost} onClick={() => setDialog(null)}>
              {t("create.cancel")}
            </button>
            <button
              type="button"
              className={styles.hallDanger}
              onClick={dialog === "delete" ? confirmDelete : confirmLeave}
            >
              {dialog === "delete" ? t("hall.delete") : t("hall.leave")}
            </button>
          </div>
        }
      >
        <p className={styles.sheetText}>
          {dialog === "delete"
            ? t("hall.deleteConfirm")
            : isHost
              ? t("hall.leaveConfirmHost")
              : t("hall.leaveConfirm")}
        </p>
      </Sheet>

      <Sheet
        open={typeof dialog === "object" && dialog !== null}
        title={t("hall.transfer")}
        tone="hall"
        onClose={() => setDialog(null)}
        footer={
          <div className={styles.sheetActionsHall}>
            <button type="button" className={styles.hallGhost} onClick={() => setDialog(null)}>
              {t("create.cancel")}
            </button>
            <button
              type="button"
              className={styles.hallPrimary}
              onClick={() => {
                if (typeof dialog === "object" && dialog) hall.commands.transferHost(dialog.transferTo.id);
                setDialog(null);
              }}
            >
              {t("hall.transfer")}
            </button>
          </div>
        }
      >
        <p className={styles.sheetText}>
          {typeof dialog === "object" && dialog
            ? t("hall.transferTo", { name: watchUserName(dialog.transferTo) })
            : null}
        </p>
      </Sheet>

      <Toast toast={toast} />
    </div>
  );
}

type StageForProviderProps = {
  stageRef: RefObject<PlayerAdapterHandle | null>;
  state: WatchState;
  clock: ServerClock;
  isHost: boolean;
  volume: number;
  muted: boolean;
  onStatus: (status: StageStatus) => void;
  onHostPlayerAction: (action: { type: "play" | "pause"; positionSec: number }) => void;
  onHeartbeat: (positionSec: number, isPlaying: boolean) => void;
};

/** Посилання на оригінал для пункту меню "Відкрити на …" — по-своєму для кожного провайдера. */
function sourceUrlFor(state: WatchState): string {
  switch (state.provider) {
    case "YOUTUBE":
      return youTubeWatchUrl(state.videoId);
    case "VIMEO":
      return `https://vimeo.com/${state.videoId}`;
    case "DAILYMOTION":
      return `https://www.dailymotion.com/video/${state.videoId}`;
    case "FILE":
    case "IFRAME":
    case "MANUAL":
      return state.videoId;
  }
}

/** Вибирає адаптер плеєра за `state.provider` — лише для провайдерів з повною синхронізацією. */
function StageForProvider({ stageRef, ...props }: StageForProviderProps) {
  switch (props.state.provider) {
    case "VIMEO":
      return <VimeoStage ref={stageRef} {...props} />;
    case "DAILYMOTION":
      return <DailymotionStage ref={stageRef} {...props} />;
    case "FILE":
      return <FileStage ref={stageRef} {...props} />;
    case "YOUTUBE":
    default:
      return <YouTubeStage ref={stageRef} {...props} />;
  }
}

function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  return (
    <div className={styles.toastWrap} aria-live="polite">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            className={styles.toast}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            {toast.text}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
