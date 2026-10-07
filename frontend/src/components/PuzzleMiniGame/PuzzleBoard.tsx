"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { PuzzleBoardEngine } from "./puzzleBoardEngine";
import { playDone, playSnap, unlockPuzzleAudio, vibrate } from "./puzzleSound";
import type {
  PuzzleCursorEvent,
  PuzzleImage,
  PuzzleJoinEvent,
  PuzzleMoveEvent,
  PuzzleSocket,
  PuzzleState,
} from "./puzzleTypes";
import styles from "./PuzzleMiniGame.module.scss";

export type PuzzleBoardHandle = { resetCamera: () => void; zoomBy: (factor: number) => void };

type Props = {
  ref?: Ref<PuzzleBoardHandle>;
  socket: PuzzleSocket | null;
  roomId: string;
  puzzle: PuzzleState;
  image: PuzzleImage;
  done: boolean;
  showHint: boolean;
  edgesOnly: boolean;
  soundOn: boolean;
  solo: boolean;
  userId: string;
  peerId: string | null;
  meInitial: string;
  peerInitial: string;
  meAvatarUrl?: string | null;
  peerAvatarUrl?: string | null;
  loadingLabel: string;
  onGrab: (group: number) => void;
  onMove: (group: number, x: number, y: number) => void;
  onDrop: (group: number, x: number, y: number) => void;
  onCursor: (x: number, y: number) => void;
};

/** Полотно пазла: тонка React-обгортка над `PuzzleBoardEngine` (малювання й жести живуть у рушії). */
export default function PuzzleBoard(props: Props) {
  const { ref, socket, roomId, puzzle, image, done, showHint, edgesOnly, soundOn, userId, peerId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PuzzleBoardEngine | null>(null);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);

  // Колбеки й прапорці беремо «з останніх пропсів», щоб рушій не перестворювати на кожен рендер.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useImperativeHandle(
    ref,
    () => ({
      resetCamera: () => engineRef.current?.resetCamera(),
      zoomBy: (factor: number) => engineRef.current?.zoomBy(factor),
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const engine = new PuzzleBoardEngine(canvas, {
      grab: (g) => latest.current.onGrab(g),
      move: (g, x, y) => latest.current.onMove(g, x, y),
      drop: (g, x, y) => latest.current.onDrop(g, x, y),
      cursor: (x, y) => {
        if (!latest.current.solo) latest.current.onCursor(x, y);
      },
    });
    engineRef.current = engine;
    const fit = () => {
      const rect = container.getBoundingClientRect();
      engine.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    const unlock = () => unlockPuzzleAudio();
    canvas.addEventListener("pointerdown", unlock, { passive: true });
    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", unlock);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Картина: завантажуємо один раз на файл; кусочки малюються зі спрайтів, нарізаних з неї.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      engineRef.current?.setImage(img);
      setLoadedFile(image.url);
    };
    img.src = image.url;
    return () => {
      cancelled = true;
    };
  }, [image.url]);

  useEffect(() => {
    engineRef.current?.setPlayers({
      meId: userId,
      peerId,
      meInitial: props.meInitial,
      peerInitial: props.peerInitial,
      meAvatarUrl: props.meAvatarUrl,
      peerAvatarUrl: props.peerAvatarUrl,
    });
  }, [userId, peerId, props.meInitial, props.peerInitial, props.meAvatarUrl, props.peerAvatarUrl]);

  useEffect(() => {
    engineRef.current?.setPuzzle(puzzle);
  }, [puzzle]);

  useEffect(() => {
    engineRef.current?.setOptions({ showHint, edgesOnly, done });
  }, [showHint, edgesOnly, done]);

  // Рух і курсор партнера (без повних знімків) + звук/вібрація при збігу.
  useEffect(() => {
    if (!socket) return;
    const onMove = (event: PuzzleMoveEvent) => {
      if (event.roomId === roomId) engineRef.current?.applyRemoteMove(event);
    };
    const onCursor = (event: PuzzleCursorEvent) => {
      if (event.roomId === roomId) engineRef.current?.applyRemoteCursor(event);
    };
    const onJoin = (event: PuzzleJoinEvent) => {
      if (event.roomId !== roomId || !latest.current.soundOn) return;
      const mine = event.by === userId;
      if (event.type === "done") {
        playDone();
        vibrate([30, 60, 30, 60, 90]);
      } else {
        playSnap(mine);
        if (mine) vibrate(14);
      }
    };
    socket.on("puzzle-move", onMove);
    socket.on("puzzle-cursor", onCursor);
    socket.on("puzzle-event", onJoin);
    return () => {
      socket.off("puzzle-move", onMove);
      socket.off("puzzle-cursor", onCursor);
      socket.off("puzzle-event", onJoin);
    };
  }, [socket, roomId, userId, soundOn]);

  const loading = loadedFile !== image.url;
  return (
    <div ref={containerRef} className={styles.boardWrap}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label="Puzzle" />
      {loading ? <div className={styles.boardLoading}>{props.loadingLabel}</div> : null}
    </div>
  );
}
