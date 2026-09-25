"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";
import { loadDailymotionApi, type DmPlayer } from "@/lib/dailymotion";
import type { PlayerAdapterHandle, PlayerAdapterProps } from "./types";
import { useSyncEngine, type SyncDriver, type SyncPlaybackState } from "./useSyncEngine";
import styles from "../CinemaHall.module.scss";

/**
 * Офіційний Dailymotion Player SDK. Так само, як Vimeo, асинхронний (події замість синхронних
 * getCurrentTime()) — позицію/тривалість/буфер тримаємо в кеші-refs, які оновлюють події плеєра.
 */
const DailymotionStage = forwardRef<PlayerAdapterHandle, PlayerAdapterProps>(
  function DailymotionStage(
    { state, clock, isHost, volume, muted, onStatus, onHostPlayerAction, onHeartbeat },
    ref,
  ) {
    const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
    const elementId = `dm-player-${reactId}`;
    const mountRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<DmPlayer | null>(null);
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

    useEffect(() => {
      let disposed = false;
      const mount = mountRef.current;
      if (!mount) return;

      const host = document.createElement("div");
      host.id = elementId;
      mount.appendChild(host);

      const statusSnapshot = () => ({
        ready: readyRef.current,
        buffering: playbackStateRef.current === "buffering",
        autoplayMuted: false,
        poorConnection: false,
        error: null as null,
      });

      loadDailymotionApi()
        .then((dm) =>
          dm
            .createPlayer(elementId, {
              video: state.videoId,
              params: {
                controls: false,
                autoplay: false,
                mute: propsRef.current.muted || propsRef.current.volume === 0,
                "queue-enable": false,
              },
            })
            .then((player) => {
              if (disposed) return;
              playerRef.current = player;
              loadedVideoRef.current = state.videoId;

              player.on(dm.events.APIREADY, () => {
                readyRef.current = true;
                player.setVolume((propsRef.current.muted ? 0 : propsRef.current.volume) / 100);
                onStatus({ ...statusSnapshot(), ready: true });
              });
              player.on(dm.events.VIDEO_PLAY, () => {
                playbackStateRef.current = "playing";
              });
              player.on(dm.events.VIDEO_PLAYING, () => {
                playbackStateRef.current = "playing";
              });
              player.on(dm.events.VIDEO_PAUSE, () => {
                playbackStateRef.current = "paused";
              });
              player.on(dm.events.VIDEO_BUFFERING, () => {
                playbackStateRef.current = "buffering";
                onStatus({ ...statusSnapshot(), buffering: true });
              });
              player.on(dm.events.VIDEO_END, () => {
                playbackStateRef.current = "ended";
              });
              player.on(dm.events.VIDEO_TIMECHANGE, (e: unknown) => {
                const t = (e as { videoTime?: number })?.videoTime;
                if (typeof t === "number") currentTimeRef.current = t;
              });
              player.on(dm.events.VIDEO_DURATIONCHANGE, (e: unknown) => {
                const d = (e as { videoDuration?: number })?.videoDuration;
                if (typeof d === "number") durationRef.current = d;
              });
              player.on(dm.events.VIDEO_PROGRESS, (e: unknown) => {
                const buffered = (e as { videoBufferedTime?: number })?.videoBufferedTime;
                if (typeof buffered === "number" && durationRef.current > 0) {
                  loadedFractionRef.current = Math.min(1, buffered / durationRef.current);
                }
              });
              player.on(dm.events.PLAYER_ERROR, () => {
                onStatus({ ...statusSnapshot(), error: "INVALID" });
              });
            }),
        )
        .catch(() => {
          if (!disposed) {
            onStatus({
              ready: false,
              buffering: false,
              autoplayMuted: false,
              poorConnection: false,
              error: "HTML5",
            });
          }
        });

      return () => {
        disposed = true;
        readyRef.current = false;
        playerRef.current?.destroy();
        playerRef.current = null;
        host.remove();
      };
      // Плеєр монтується один раз; далі все — через syncStep/refs (як і YouTubeStage).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      player.setVolume((muted ? 0 : volume) / 100);
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
        try {
          player.play();
        } catch {
          player.setMuted(true);
          player.play();
          onStatus({
            ready: readyRef.current,
            buffering: false,
            autoplayMuted: true,
            poorConnection: false,
            error: null,
          });
        }
      },
      pause: () => playerRef.current?.pause(),
      seekTo: (sec) => {
        currentTimeRef.current = sec;
        playerRef.current?.seek(sec);
      },
      loadVideo: (videoId, startSec) => {
        const player = playerRef.current;
        if (!player) return;
        currentTimeRef.current = startSec;
        durationRef.current = 0;
        playbackStateRef.current = "unstarted";
        player.load(videoId);
        // Dailymotion не приймає стартову позицію в load() — виставляємо одразу після APIREADY
        // наступного циклу синхронізації (він і так seek-ить, якщо дрейф більший за поріг).
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
          player.setMuted(false);
          player.setVolume((propsRef.current.volume || 80) / 100);
        },
      }),
      [localPlay, localPause, localSeek],
    );

    return <div ref={mountRef} className={styles.playerMount} />;
  },
);

export default DailymotionStage;
