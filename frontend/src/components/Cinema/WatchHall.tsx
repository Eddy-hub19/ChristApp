"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Clapperboard,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  MoreVertical,
  Trash2,
  UserPlus,
  Volume2,
  WifiOff,
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
import { expectedPosition } from "@/lib/watchSync";
import FloatingReactions, { type FloatingReactionsHandle } from "./FloatingReactions";
import HostControls from "./HostControls";
import InviteSheet, { buildInviteUrl } from "./InviteSheet";
import SeatsRow from "./SeatsRow";
import Sheet from "./Sheet";
import VideoLinkField, { type PickedVideo } from "./VideoLinkField";
import WatchChat from "./WatchChat";
import YouTubeStage, { type StageStatus, type YouTubeStageHandle } from "./YouTubeStage";
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

type Dialog = "invite" | "changeVideo" | "leave" | "delete" | { transferTo: HallMember } | null;

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

  const stageRef = useRef<YouTubeStageHandle | null>(null);
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
    hall.commands.changeVideo(pendingVideo.videoId, pendingVideo.startSec || undefined);
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

  return (
    <div className={styles.hall}>
      <header className={styles.topbar}>
        <Link href="/cinema" className={styles.hallIconButton} aria-label={t("hall.back")}>
          <ArrowLeft size={20} />
        </Link>
        <div className={styles.topbarTitle}>
          <h1>{hall.roomTitle}</h1>
          {/* Хто керує — вже показано в панелі під екраном (лишається видимим і в fullscreen); тут дублювати не треба. */}
          {state.videoTitle ? <p className={styles.topbarVideo}>{state.videoTitle}</p> : null}
        </div>
        <button type="button" className={styles.inviteButton} onClick={() => setDialog("invite")}>
          <UserPlus size={16} aria-hidden />
          <span>{t("hall.invite")}</span>
        </button>
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
                ) : null}
                <button type="button" role="menuitem" onClick={copyLink}>
                  <Link2 size={16} aria-hidden /> {t("hall.copyLink")}
                </button>
                <a role="menuitem" href={youTubeWatchUrl(state.videoId)} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
                  <ExternalLink size={16} aria-hidden /> {t("hall.onYouTube")}
                </a>
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
                {entered ? (
                  <YouTubeStage
                    ref={stageRef}
                    state={state}
                    clock={hall.clock}
                    isHost={isHost}
                    volume={volume}
                    muted={muted}
                    onStatus={setStage}
                    onHostPlayerAction={onHostPlayerAction}
                    onHeartbeat={hall.commands.heartbeat}
                  />
                ) : (
                  // До першого дотику плеєра ще немає: браузер дозволить звук лише після жесту.
                  <button type="button" className={styles.enterGate} onClick={() => setEntered(true)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- прев'ю з i.ytimg.com */}
                    <img src={youTubeThumbnailUrl(state.videoId, "hq")} alt="" />
                    <span className={styles.enterGateInner}>
                      <span className={styles.enterGateButton}>{t("hall.joinPrompt")}</span>
                      {state.isPlaying ? (
                        <span className={styles.enterGateLive}>
                          <span className={styles.enterGateLiveDot} aria-hidden />
                          {t("hall.liveNow")}
                        </span>
                      ) : (
                        <span className={styles.enterGateHint}>{t("statusPaused")}</span>
                      )}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className={styles.stageStatus} role="status">
              {stage?.error ? (
                <span className={styles.stageError}>
                  {t(`errors.${stage.error === "NOT_EMBEDDABLE" || stage.error === "NOT_FOUND" ? stage.error : "playback"}`)}
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
