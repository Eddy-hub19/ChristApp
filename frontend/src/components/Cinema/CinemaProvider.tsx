"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { clearServerViewState } from "@/lib/viewStateBeacon";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";
import {
  getAuthSessionSnapshot,
  subscribeAuthSession,
} from "@/lib/authSession";
import { setCinemaSessionActive } from "@/lib/cinemaSessionStore";
import {
  AUTO_SYNC_PROVIDERS,
  CINEMA_RESYNCED_EVENT,
  expectedPosition,
  type WatchState,
} from "@/lib/watchSync";
import CinemaStageHost from "./CinemaStageHost";
import ChatOverlay from "./ChatOverlay";
import { useChatOverlayEnabled } from "./chatOverlayStore";
import FloatingReactions, {
  type FloatingReactionsHandle,
} from "./FloatingReactions";
import ManualMiniBadge from "./ManualMiniBadge";
import type { PlayerAdapterHandle, StageStatus } from "./players/types";
import { useWatchHall, type HallEvent } from "./useWatchHall";

const VOLUME_KEY = "cinema:volume";

function readStoredVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) && v >= 0 && v <= 100 ? v : 80;
  } catch {
    return 80;
  }
}

type HallApi = ReturnType<typeof useWatchHall>;

export type CinemaContextValue = {
  /** Кімната, чия сесія зараз жива (зала або мініплеєр); `null` — нічого не грає. */
  activeRoomId: string | null;
  /** Сторінка кімнати викликає на монтуванні: сесія переходить на цю кімнату (або лишається, якщо вже вона). */
  activate: (roomId: string) => void;
  /** Вийти з перегляду: плеєр зупиняється, `watch:leave` летить на сервер. */
  deactivate: () => void;
  hall: HallApi;
  me: string | undefined;
  entered: boolean;
  setEntered: (entered: boolean) => void;
  volume: number;
  muted: boolean;
  changeVolume: (v: number) => void;
  toggleMute: () => void;
  stage: StageStatus | null;
  /** Справжній або псевдо-fullscreen плеєра. */
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  hostPlay: () => void;
  hostPause: () => void;
  hostSeek: (sec: number) => void;
  /** Задано лише коли системний PiP справді доступний (FILE/HLS + підтримка браузера). */
  togglePip: (() => void) | undefined;
  /** Плеєр (YouTube/Vimeo/Dailymotion/File) змонтований глобально — у залі це не робить сама сторінка. */
  playerHosted: boolean;
  /** Сторінка кімнати віддає елемент `.screen`, поверх якого глобальний плеєр малює себе. */
  setSlotEl: (el: HTMLElement | null) => void;
  /** Сторінка кімнати реєструє свій обробник подій зали (тости). */
  setEventHandler: (handler: ((event: HallEvent) => void) | null) => void;
};

const CinemaContext = createContext<CinemaContextValue | null>(null);

/** Рефи — окремим контекстом: інакше весь `useCinema()` для React-лінтера виглядає як «об'єкт з рефом». */
type CinemaRefs = {
  stageRef: RefObject<PlayerAdapterHandle | null>;
  reactionsRef: RefObject<FloatingReactionsHandle | null>;
};
const CinemaRefsContext = createContext<CinemaRefs | null>(null);

export function useCinemaRefs(): CinemaRefs {
  const ctx = useContext(CinemaRefsContext);
  if (!ctx)
    throw new Error("useCinemaRefs must be used inside <CinemaProvider>");
  return ctx;
}

export function useCinema(): CinemaContextValue {
  const ctx = useContext(CinemaContext);
  if (!ctx) throw new Error("useCinema must be used inside <CinemaProvider>");
  return ctx;
}

type ManualPhaseLive = NonNullable<WatchState["manual"]>["phase"];
const MANUAL_LIVE_PHASES: ReadonlySet<ManualPhaseLive> = new Set([
  "countdown",
  "running",
  "paused",
]);

/**
 * Глобальний провайдер «Кіношки»: стан кімнати, сокет-підписки і сам плеєр живуть на рівні кореневого
 * layout, а не всередині сторінки кімнати. Тому перехід на інші екрани не розмонтовує плеєр —
 * він згортається в мініплеєр, а синхронізація з кімнатою триває.
 */
export default function CinemaProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { socket } = usePresenceSocket();
  const authSnapshot = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getAuthSessionSnapshot,
  );
  const me = authSnapshot.user?.id;

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const eventHandlerRef = useRef<((event: HallEvent) => void) | null>(null);
  const onHallEvent = useCallback(
    (event: HallEvent) => eventHandlerRef.current?.(event),
    [],
  );
  const setEventHandler = useCallback(
    (handler: ((event: HallEvent) => void) | null) => {
      eventHandlerRef.current = handler;
    },
    [],
  );

  const hall = useWatchHall(activeRoomId, onHallEvent);

  const [entered, setEntered] = useState(false);
  const [volume, setVolume] = useState(() =>
    typeof window === "undefined" ? 80 : readStoredVolume(),
  );
  const [muted, setMuted] = useState(false);
  const [stage, setStage] = useState<StageStatus | null>(null);
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFullscreenRaw, setPseudoFullscreen] = useState(false);
  // iPhone Safari: немає fullscreen для довільних елементів і немає screen.orientation.lock,
  // тож коли телефон у портреті, розгортаємо плеєр і повертаємо його на 90° засобами CSS.
  const [pseudoRotated, setPseudoRotated] = useState(false);
  const [pipAvailable, setPipAvailable] = useState(false);
  /** Останнє повідомлення, яке користувач бачив у залі: усе після нього — «нове» для значка на мініплеєрі. */
  const [readMarker, setReadMarker] = useState<string | null>(null);

  const stageRef = useRef<PlayerAdapterHandle | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reactionsRef = useRef<FloatingReactionsHandle | null>(null);
  const [chatOverlayEnabled, setChatOverlayEnabled] = useChatOverlayEnabled();
  const resyncPendingRef = useRef(false);

  // Інша кімната (або вихід): усе, що належало попередній сесії, скидаємо.
  const [seenRoomId, setSeenRoomId] = useState(activeRoomId);
  if (seenRoomId !== activeRoomId) {
    setSeenRoomId(activeRoomId);
    setEntered(false);
    setMuted(false);
    setStage(null);
    setPipAvailable(false);
    setReadMarker(null);
    setPseudoFullscreen(false);
    setPseudoRotated(false);
  }

  // Свідомий вихід із зали (закрила мініплеєр, перейшла в іншу кімнату): сервер одразу показує рядок
  // «вийшов» у чаті. Звичайний обрив сокета чи згортання застосунку — це не він (там грейс ~30 с).
  const activeRoomIdRef = useRef(activeRoomId);
  const socketRef = useRef(socket);
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
    socketRef.current = socket;
  }, [activeRoomId, socket]);
  const announceExplicitLeave = useCallback(() => {
    const roomId = activeRoomIdRef.current;
    const current = socketRef.current;
    if (roomId && current?.connected) current.emit("watch:leaveExplicit", { roomId });
  }, []);

  const activate = useCallback(
    (roomId: string) => {
      if (activeRoomIdRef.current && activeRoomIdRef.current !== roomId) announceExplicitLeave();
      setActiveRoomId(roomId);
    },
    [announceExplicitLeave],
  );
  const deactivate = useCallback(() => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    announceExplicitLeave();
    setActiveRoomId(null);
  }, [announceExplicitLeave]);

  useEffect(() => {
    setCinemaSessionActive(activeRoomId !== null);
    return () => setCinemaSessionActive(false);
  }, [activeRoomId]);

  const state = hall.state;
  const inHall =
    activeRoomId !== null && pathname === `/cinema/${activeRoomId}`;

  // «Дивлюсь на залу»: сторінка зали відкрита й ВИДИМА. Мініплеєр, інший екран і згорнутий застосунок — ні:
  // у цих випадках повідомлення чату зали приходять пушем. Сервер знімає перегляд і при розриві сокета.
  const hallJoined = hall.status === "ready";
  useEffect(() => {
    if (!socket || !activeRoomId || !inHall) return;
    const roomId = activeRoomId;
    const emit = (active: boolean) => {
      if (socket.connected) socket.emit("watch:viewState", { roomId, active });
    };
    const sync = () => {
      const visible = document.visibilityState === "visible";
      emit(visible);
      if (!visible) clearServerViewState(socket.id);
    };
    const goInactive = () => {
      emit(false);
      clearServerViewState(socket.id);
    };
    sync();
    socket.on("connect", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", goInactive);
    document.addEventListener("freeze", goInactive);
    return () => {
      socket.off("connect", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", goInactive);
      document.removeEventListener("freeze", goInactive);
      emit(false);
    };
  }, [socket, activeRoomId, inHall, hallJoined]);
  const pseudoFullscreen = pseudoFullscreenRaw && inHall;
  if (!inHall && pseudoFullscreenRaw) setPseudoFullscreen(false);
  const isReady = hall.status === "ready" && state !== null;
  const isAutoSync = state ? AUTO_SYNC_PROVIDERS.has(state.provider) : false;
  const playerHosted =
    activeRoomId !== null && isReady && entered && isAutoSync;
  const manualLive =
    activeRoomId !== null &&
    isReady &&
    entered &&
    !isAutoSync &&
    state?.manual != null &&
    MANUAL_LIVE_PHASES.has(state.manual.phase);
  const keepAlive = playerHosted || manualLive;

  // Ушли из комнаты, а показывать в мини нечего (не нажали «зайти», показ IFRAME не идёт, комнату удалили) —
  // закрываем сессию, чтобы не висеть «присутствующим» впустую.
  if (activeRoomId !== null && !inHall && !keepAlive) setActiveRoomId(null);

  // Мініплеєр не живе у повноекранному режимі: вийшли із зали — виходимо й з нього.
  useEffect(() => {
    if (!inHall && document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
  }, [inHall]);

  useEffect(() => {
    const onChange = () => {
      const fs =
        Boolean(document.fullscreenElement) &&
        document.fullscreenElement === hostRef.current;
      setIsFullscreen(fs);
      if (!fs) {
        try {
          (
            screen.orientation as ScreenOrientation & { unlock?: () => void }
          )?.unlock?.();
        } catch {
          // деякі браузери кидають, якщо lock ніколи не викликався — не критично
        }
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Поки активний псевдо-fullscreen, стежимо за орієнтацією: обертаємо плеєр лише в портреті.
  useEffect(() => {
    if (!pseudoFullscreen || !window.matchMedia) return;
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setPseudoRotated(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [pseudoFullscreen]);

  // Повернення з фону: iOS міг призупинити сокет і плеєр. Одразу перепідключаємось, питаємо стан кімнати
  // (watch:join без leave) і щойно він прийшов — плеєри доганяють хоста (CINEMA_RESYNCED_EVENT).
  const { resync } = hall;
  useEffect(() => {
    if (activeRoomId === null) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      resyncPendingRef.current = true;
      if (socket && !socket.connected) socket.connect();
      resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [activeRoomId, socket, resync]);

  useEffect(() => {
    if (!resyncPendingRef.current || !state) return;
    resyncPendingRef.current = false;
    window.dispatchEvent(new Event(CINEMA_RESYNCED_EVENT));
  }, [state]);

  // Лічильник «нових» для мініплеєра: у залі маркер їде за останнім повідомленням, у мініплеєрі — стоїть.
  const lastMessageId = hall.messages.at(-1)?.id ?? null;
  if (inHall && readMarker !== lastMessageId) setReadMarker(lastMessageId);
  const unread = useMemo(() => {
    if (inHall || readMarker === null) return 0;
    const idx = hall.messages.findIndex((m) => m.id === readMarker);
    if (idx < 0) return 0;
    return hall.messages.slice(idx + 1).filter((m) => m.user.id !== me && m.type !== "SYSTEM").length;
  }, [inHall, readMarker, hall.messages, me]);

  // Системний PiP є лише в адаптерів із власним <video>.
  const handleStageStatus = useCallback((status: StageStatus) => {
    setStage(status);
    setPipAvailable(
      status.ready && Boolean(stageRef.current?.isPipSupported?.()),
    );
  }, []);
  const togglePip = useMemo(
    () => (pipAvailable ? () => stageRef.current?.togglePip?.() : undefined),
    [pipAvailable],
  );

  const changeVolume = useCallback(
    (v: number) => {
      setVolume(v);
      setMuted(v === 0);
      if (stage?.autoplayMuted && v > 0) stageRef.current?.unmuteAfterGesture();
      try {
        window.localStorage.setItem(VOLUME_KEY, String(v));
      } catch {
        // приватний режим — гучність просто не запам'ятається
      }
    },
    [stage?.autoplayMuted],
  );

  const toggleMute = useCallback(() => {
    if (stage?.autoplayMuted) {
      stageRef.current?.unmuteAfterGesture();
      setMuted(false);
      return;
    }
    setMuted((m) => !m);
  }, [stage?.autoplayMuted]);

  const toggleFullscreen = useCallback(async () => {
    const el = hostRef.current;
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
        await (
          screen.orientation as ScreenOrientation & {
            lock?: (o: string) => Promise<void>;
          }
        )
          ?.lock?.("landscape")
          .catch(() => undefined);
      } catch {
        setPseudoFullscreen(true);
      }
    } else {
      // iPhone Safari не вміє fullscreen для довільних елементів — розгортаємо засобами CSS.
      setPseudoFullscreen(true);
    }
  }, [pseudoFullscreen]);

  // Натискання хоста на play/scrubber ДО того, як плеєр змонтований (ще не було жесту
  // для автоплею) — саме є тим жестом: монтуємо плеєр і одразу шлемо команду з позиції
  // з серверного стану (stageRef ще порожній). Плеєр, щойно змонтувавшись, сам підхопить
  // щойно надіслану позицію — той самий шлях, яким і глядач приєднується до вже активного показу.
  const { commands, clock } = hall;
  const hostPlay = useCallback(() => {
    setEntered(true);
    const pos = stageRef.current?.localPlay() ?? state?.positionSec ?? 0;
    commands.play(pos);
  }, [commands, state?.positionSec]);
  const hostPause = useCallback(() => {
    setEntered(true);
    const pos =
      stageRef.current?.localPause() ??
      (state ? expectedPosition(state, clock.now()) : 0);
    commands.pause(pos);
  }, [commands, clock, state]);
  const hostSeek = useCallback(
    (sec: number) => {
      setEntered(true);
      stageRef.current?.localSeek(sec);
      commands.seek(sec);
    },
    [commands],
  );
  const onHostPlayerAction = useCallback(
    (action: { type: "play" | "pause"; positionSec: number }) => {
      if (action.type === "play") commands.play(action.positionSec);
      else commands.pause(action.positionSec);
    },
    [commands],
  );

  const isHost = Boolean(me && state?.hostId === me);

  const value = useMemo<CinemaContextValue>(
    () => ({
      activeRoomId,
      activate,
      deactivate,
      hall,
      me,
      entered,
      setEntered,
      volume,
      muted,
      changeVolume,
      toggleMute,
      stage,
      isFullscreen: isFullscreen || pseudoFullscreen,
      toggleFullscreen,
      hostPlay,
      hostPause,
      hostSeek,
      togglePip,
      playerHosted,
      setSlotEl,
      setEventHandler,
    }),
    [
      activeRoomId,
      activate,
      deactivate,
      hall,
      me,
      entered,
      volume,
      muted,
      changeVolume,
      toggleMute,
      stage,
      isFullscreen,
      pseudoFullscreen,
      toggleFullscreen,
      hostPlay,
      hostPause,
      hostSeek,
      togglePip,
      playerHosted,
      setEventHandler,
    ],
  );

  const refs = useMemo(() => ({ stageRef, reactionsRef }), []);

  return (
    <CinemaRefsContext.Provider value={refs}>
      <CinemaContext.Provider value={value}>
        {children}

        {playerHosted && state ? (
          <CinemaStageHost
            hostRef={hostRef}
            stageRef={stageRef}
            state={state}
            clock={hall.clock}
            isHost={isHost}
            volume={volume}
            muted={muted}
            roomTitle={hall.roomTitle}
            inHall={inHall}
            slotEl={slotEl}
            fullscreen={isFullscreen}
            pseudoFullscreen={pseudoFullscreen}
            pseudoRotated={pseudoRotated}
            unread={unread}
            pathname={pathname}
            onStatus={handleStageStatus}
            onHostPlayerAction={onHostPlayerAction}
            onHeartbeat={commands.heartbeat}
            onPlay={hostPlay}
            onPause={hostPause}
            onSeek={hostSeek}
            onToggleMute={toggleMute}
            onToggleFullscreen={() => void toggleFullscreen()}
            chatOverlayEnabled={chatOverlayEnabled}
            onToggleChatOverlay={() => setChatOverlayEnabled(!chatOverlayEnabled)}
            onTogglePip={togglePip}
            onExpand={() => router.push(`/cinema/${activeRoomId}`)}
            onClose={deactivate}
            reactions={
              <FloatingReactions
                ref={reactionsRef}
                subscribe={hall.subscribeReactions}
                currentUserId={me}
                members={hall.members}
              />
            }
            chatOverlay={
              <ChatOverlay
                subscribe={hall.subscribeMessages}
                members={hall.members}
                active={(isFullscreen || pseudoFullscreen) && chatOverlayEnabled}
              />
            }
          />
        ) : null}

        {manualLive && !inHall && state?.manual ? (
          <ManualMiniBadge
            roomTitle={hall.roomTitle}
            manual={state.manual}
            clock={hall.clock}
            unread={unread}
            pathname={pathname}
            onOpen={() => router.push(`/cinema/${activeRoomId}`)}
            onClose={deactivate}
          />
        ) : null}
      </CinemaContext.Provider>
    </CinemaRefsContext.Provider>
  );
}
