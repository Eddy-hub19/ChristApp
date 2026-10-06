"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import type { ServerClock, WatchState } from "@/lib/watchSync";
import MiniOverlay from "./MiniOverlay";
import MobileStageControls from "./MobileStageControls";
import StageCenterPlay from "./StageCenterPlay";
import {
  miniPositionFor,
  miniSize,
  nearestCorner,
  readStoredCorner,
  storeCorner,
  useMiniViewport,
  type MiniCorner,
} from "./miniLayout";
import DailymotionStage from "./players/DailymotionStage";
import FileStage from "./players/FileStage";
import type { PlayerAdapterHandle, StageStatus } from "./players/types";
import VimeoStage from "./players/VimeoStage";
import YouTubeStage from "./YouTubeStage";
import styles from "./CinemaHall.module.scss";

type Rect = { left: number; top: number; width: number; height: number };

type CinemaStageHostProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<PlayerAdapterHandle | null>;
  state: WatchState;
  clock: ServerClock;
  isHost: boolean;
  volume: number;
  muted: boolean;
  roomTitle: string;
  /** Користувач зараз на сторінці цієї кімнати: плеєр лежить поверх `slotEl`; інакше — мініплеєр у куті. */
  inHall: boolean;
  slotEl: HTMLElement | null;
  fullscreen: boolean;
  pseudoFullscreen: boolean;
  pseudoRotated: boolean;
  unread: number;
  pathname: string;
  onStatus: (status: StageStatus) => void;
  onHostPlayerAction: (action: {
    type: "play" | "pause";
    positionSec: number;
  }) => void;
  onHeartbeat: (positionSec: number, isPlaying: boolean) => void;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (sec: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  chatOverlayEnabled: boolean;
  onToggleChatOverlay: () => void;
  onTogglePip: (() => void) | undefined;
  onExpand: () => void;
  onClose: () => void;
  /** Летючі емодзі зали — показуємо лише в залі (у т.ч. у fullscreen), не в мініплеєрі. */
  reactions: ReactNode;
  /** Повідомлення чату зали поверх відео — лише у fullscreen (сам компонент вирішує, коли активний). */
  chatOverlay: ReactNode;
};

/**
 * Єдине місце, де монтується плеєр. iframe/відео не можна переносити між DOM-батьками без перезавантаження,
 * тому контейнер завжди `position: fixed` на рівні кореня: у залі він накладається на `.screen` сторінки
 * (рамка відстежується щокадру), поза залою — стає мініплеєром. Так перехід між екранами не розмонтовує плеєр.
 */
export default function CinemaStageHost({
  hostRef,
  stageRef,
  state,
  clock,
  isHost,
  volume,
  muted,
  roomTitle,
  inHall,
  slotEl,
  fullscreen,
  pseudoFullscreen,
  pseudoRotated,
  unread,
  pathname,
  onStatus,
  onHostPlayerAction,
  onHeartbeat,
  onPlay,
  onPause,
  onSeek,
  onToggleMute,
  onToggleFullscreen,
  chatOverlayEnabled,
  onToggleChatOverlay,
  onTogglePip,
  onExpand,
  onClose,
  reactions,
  chatOverlay,
}: CinemaStageHostProps) {
  const vp = useMiniViewport();
  const [slotRect, setSlotRect] = useState<Rect | null>(null);
  const [corner, setCorner] = useState<MiniCorner>(readStoredCorner);
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);
  const anyFullscreen = fullscreen || pseudoFullscreen;

  // Слот зали може рухатись (клавіатура, анімація шторки, скрол) — стежимо щокадру, setState лише при зміні.
  useEffect(() => {
    if (!inHall || !slotEl || anyFullscreen) return;
    let raf = 0;
    const round = (n: number) => Math.round(n * 10) / 10;
    const tick = () => {
      const r = slotEl.getBoundingClientRect();
      const next = {
        left: round(r.left),
        top: round(r.top),
        width: round(r.width),
        height: round(r.height),
      };
      setSlotRect((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [inHall, slotEl, anyFullscreen]);

  const size = miniSize(state.provider, vp.w);
  const miniPos = drag ?? miniPositionFor(corner, size, vp, pathname);

  let style: CSSProperties | undefined;
  if (anyFullscreen) {
    style = undefined;
  } else if (inHall) {
    style = slotRect
      ? {
          left: slotRect.left,
          top: slotRect.top,
          width: slotRect.width,
          height: slotRect.height,
        }
      : {
          left: 0,
          top: 0,
          width: size.w,
          height: size.h,
          visibility: "hidden",
        };
  } else {
    style = {
      left: miniPos.left,
      top: miniPos.top,
      width: size.w,
      height: size.h,
      ...(vp.w === 0 ? { visibility: "hidden" } : null),
    };
  }

  const className = [
    styles.stageHost,
    anyFullscreen
      ? styles.stageHostFullscreen
      : inHall
        ? styles.stageHostHall
        : styles.stageHostMini,
    drag ? styles.stageHostDragging : "",
    pseudoFullscreen ? styles.stageHostPseudo : "",
    pseudoFullscreen && pseudoRotated ? styles.stageHostPseudoRotated : "",
  ]
    .filter(Boolean)
    .join(" ");

  const stageProps = {
    state,
    clock,
    isHost,
    volume,
    muted,
    onStatus,
    onHostPlayerAction,
    onHeartbeat,
  };

  return (
    <div ref={hostRef} className={className} style={style}>
      <StageForProvider stageRef={stageRef} {...stageProps} />

      {inHall || anyFullscreen ? (
        <>
          <MobileStageControls
            stageRef={stageRef}
            isHost={isHost}
            isPlaying={state.isPlaying}
            onPlay={onPlay}
            onPause={onPause}
            onSeek={onSeek}
            muted={muted}
            onToggleMute={onToggleMute}
            isFullscreen={anyFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            chatOverlayEnabled={chatOverlayEnabled}
            onToggleChatOverlay={onToggleChatOverlay}
            onTogglePip={onTogglePip}
          />
          {state.isPlaying ? null : <StageCenterPlay isHost={isHost} onPlay={onPlay} />}
          {reactions}
          {chatOverlay}
        </>
      ) : (
        <MiniOverlay
          title={roomTitle}
          isHost={isHost}
          isPlaying={state.isPlaying}
          muted={muted}
          unread={unread}
          origin={miniPos}
          onPlay={onPlay}
          onPause={onPause}
          onToggleMute={onToggleMute}
          onExpand={onExpand}
          onClose={onClose}
          onDrag={setDrag}
          onDrop={(pos) => {
            const next = nearestCorner(
              pos.left + size.w / 2,
              pos.top + size.h / 2,
              vp,
            );
            setCorner(next);
            storeCorner(next);
            setDrag(null);
          }}
        />
      )}
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
  onHostPlayerAction: (action: {
    type: "play" | "pause";
    positionSec: number;
  }) => void;
  onHeartbeat: (positionSec: number, isPlaying: boolean) => void;
};

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
