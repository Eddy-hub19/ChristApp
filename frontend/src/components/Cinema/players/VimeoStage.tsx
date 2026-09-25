"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import VimeoPlayer from "@vimeo/player";
import type { PlayerAdapterHandle, PlayerAdapterProps } from "./types";
import { useSyncEngine, type SyncDriver, type SyncPlaybackState } from "./useSyncEngine";
import styles from "../CinemaHall.module.scss";

/**
 * Офіційний Vimeo Player SDK. На відміну від YouTube IFrame API його методи асинхронні
 * (Promise), тож поточну позицію/тривалість/буфер тримаємо в локальному кеші (refs), який
 * оновлюють події плеєра й періодичний опитувальний poll — синхронний getCurrentTime()
 * зі спільного інтерфейсу читає саме цей кеш, а не питає плеєр наживо щоразу.
 */
const VimeoStage = forwardRef<PlayerAdapterHandle, PlayerAdapterProps>(function VimeoStage(
  { state, clock, isHost, volume, muted, onStatus, onHostPlayerAction, onHeartbeat },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<VimeoPlayer | null>(null);
  const readyRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);

  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const loadedFractionRef = useRef(0);
  const playbackStateRef = useRef<SyncPlaybackState>("unstarted");
  const propsRef = useRef({ volume, muted, onHostPlayerAction });
  useEffect(() => {
    propsRef.current = { volume, muted, onHostPlayerAction };
  }, [volume, muted, onHostPlayerAction]);

  const driverRef = useRef<SyncDriver | null>(null);

  const { localPlay, localPause, localSeek } = useSyncEngine(
    driverRef,
    { state, clock, isHost, onHeartbeat, onStatus },
    loadedVideoRef,
  );

  // Створення плеєра — один раз; зміна відео йде через driver.loadVideo (з циклу синхронізації).
  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;

    const initialId = state.videoId;
    const player = new VimeoPlayer(mount, {
      id: Number(initialId),
      controls: false,
      autopause: false,
      autoplay: false,
      muted: propsRef.current.muted || propsRef.current.volume === 0,
      loop: false,
      playsinline: true,
    });
    playerRef.current = player;
    loadedVideoRef.current = initialId;

    const publishError = () => onStatus({ ...statusSnapshot(), error: "INVALID" });
    const statusSnapshot = () => ({
      ready: readyRef.current,
      buffering: playbackStateRef.current === "buffering",
      autoplayMuted: false,
      poorConnection: false,
      error: null,
    });

    player
      .ready()
      .then(() => {
        if (disposed) return;
        readyRef.current = true;
        void player.setVolume(propsRef.current.muted ? 0 : propsRef.current.volume / 100);
        onStatus({ ...statusSnapshot(), ready: true });
      })
      .catch(() => {
        if (!disposed) publishError();
      });

    player.on("timeupdate", (data: { seconds: number; duration: number; percent: number }) => {
      currentTimeRef.current = data.seconds;
      if (data.duration) durationRef.current = data.duration;
    });
    player.on("progress", (data: { seconds: number; percent: number }) => {
      loadedFractionRef.current = data.percent;
    });
    player.on("play", () => {
      playbackStateRef.current = "playing";
    });
    player.on("pause", () => {
      playbackStateRef.current = "paused";
    });
    player.on("bufferstart", () => {
      playbackStateRef.current = "buffering";
      onStatus({ ...statusSnapshot(), buffering: true });
    });
    player.on("bufferend", () => {
      if (playbackStateRef.current === "buffering") playbackStateRef.current = "paused";
      onStatus({ ...statusSnapshot(), buffering: false });
    });
    player.on("ended", () => {
      playbackStateRef.current = "ended";
    });
    player.on("error", () => publishError());

    return () => {
      disposed = true;
      readyRef.current = false;
      player.destroy().catch(() => undefined);
      playerRef.current = null;
    };
    // Плеєр монтується один раз; далі все — через syncStep/refs (як і YouTubeStage).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Гучність — особиста, нікуди не синхронізується.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    void player.setVolume(muted ? 0 : volume / 100).catch(() => undefined);
  }, [volume, muted]);

  driverRef.current = {
    isReady: () => readyRef.current,
    getCurrentTime: () => currentTimeRef.current,
    getDuration: () => durationRef.current,
    getLoadedFraction: () => loadedFractionRef.current,
    getPlaybackState: () => playbackStateRef.current,
    play: () => {
      const player = playerRef.current;
      if (!player) return;
      player.play().catch(() => {
        // Автоплей заблоковано браузером без звуку — граємо беззвучно.
        void player.setMuted(true).then(() => player.play().catch(() => undefined));
        onStatus({
          ready: readyRef.current,
          buffering: false,
          autoplayMuted: true,
          poorConnection: false,
          error: null,
        });
      });
    },
    pause: () => {
      playerRef.current?.pause().catch(() => undefined);
    },
    seekTo: (sec) => {
      currentTimeRef.current = sec;
      playerRef.current?.setCurrentTime(sec).catch(() => undefined);
    },
    loadVideo: (videoId, startSec) => {
      const player = playerRef.current;
      if (!player) return;
      currentTimeRef.current = startSec;
      durationRef.current = 0;
      playbackStateRef.current = "unstarted";
      player
        .loadVideo(Number(videoId))
        .then(() => player.setCurrentTime(startSec))
        .catch(() => onStatus({ ready: true, buffering: false, autoplayMuted: false, poorConnection: false, error: "NOT_FOUND" }));
    },
  };

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => currentTimeRef.current,
      getDuration: () => durationRef.current,
      getLoadedFraction: () => loadedFractionRef.current,
      localPlay,
      localPause,
      localSeek,
      unmuteAfterGesture: () => {
        const player = playerRef.current;
        if (!player) return;
        void player.setMuted(false);
        void player.setVolume((propsRef.current.volume || 80) / 100);
      },
    }),
    [localPlay, localPause, localSeek],
  );

  return <div ref={mountRef} className={styles.playerMount} />;
});

export default VimeoStage;
