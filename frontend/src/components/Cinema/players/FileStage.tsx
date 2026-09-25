"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Hls from "hls.js";
import type { PlayerAdapterHandle, PlayerAdapterProps } from "./types";
import { useSyncEngine, type SyncDriver, type SyncPlaybackState } from "./useSyncEngine";
import styles from "../CinemaHall.module.scss";

function isHlsUrl(url: string): boolean {
  try {
    return /\.m3u8(?:$|[?#])/i.test(new URL(url).pathname);
  } catch {
    return /\.m3u8(?:$|[?#])/i.test(url);
  }
}

/**
 * Прямі посилання на відеофайли: .mp4/.webm через нативний <video>, .m3u8 через hls.js там,
 * де немає нативної підтримки HLS (Safari її має, тому там hls.js не підключаємо взагалі).
 * <video> синхронний (currentTime/duration/paused читаються напряму, без кешу-подій, як
 * у Vimeo/Dailymotion) — але сам driver усе одно проходить через спільний useSyncEngine
 * заради однакової поведінки дрейф-корекції з іншими провайдерами.
 */
const FileStage = forwardRef<PlayerAdapterHandle, PlayerAdapterProps>(function FileStage(
  { state, clock, isHost, volume, muted, onStatus, onHeartbeat },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const readyRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);
  const playbackStateRef = useRef<SyncPlaybackState>("unstarted");

  const driverRef = useRef<SyncDriver | null>(null);
  const { localPlay, localPause, localSeek } = useSyncEngine(
    driverRef,
    { state, clock, isHost, onHeartbeat, onStatus },
    loadedVideoRef,
  );

  const attachSource = (url: string) => {
    const video = videoRef.current;
    if (!video) return;
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (isHlsUrl(url)) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
      } else if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          // hls.js фетчить маніфест/сегменти сам (XHR) — на відміну від нативного <video src>,
          // якому CORS для простого відтворення не потрібен. Відсутній/непрочитаний статус
          // (code 0 чи взагалі немає response) на мережевій помилці — типова ознака CORS-блоку
          // чужим сервером (хоч так само виглядає й "сервер зараз недоступний").
          const looksLikeCors =
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            (data.response == null || data.response.code === 0);
          onStatus({
            ready: readyRef.current,
            buffering: false,
            autoplayMuted: false,
            poorConnection: false,
            error: looksLikeCors ? "CORS" : "HTML5",
          });
        });
        hlsRef.current = hls;
      } else {
        onStatus({
          ready: false,
          buffering: false,
          autoplayMuted: false,
          poorConnection: false,
          error: "HTML5",
        });
        return;
      }
    } else {
      video.src = url;
    }
    readyRef.current = false;
  };

  // Монтування — один раз; зміна джерела йде через driver.loadVideo із циклу синхронізації.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playsInline = true;
    video.muted = muted || volume === 0;
    video.volume = Math.min(1, Math.max(0, volume / 100));
    attachSource(state.videoId);
    loadedVideoRef.current = state.videoId;

    const onLoadedMetadata = () => {
      readyRef.current = true;
      onStatus({ ready: true, buffering: false, autoplayMuted: false, poorConnection: false, error: null });
    };
    const onPlaying = () => {
      playbackStateRef.current = "playing";
    };
    const onPause = () => {
      playbackStateRef.current = "paused";
    };
    const onWaiting = () => {
      playbackStateRef.current = "buffering";
      onStatus({ ready: readyRef.current, buffering: true, autoplayMuted: false, poorConnection: false, error: null });
    };
    const onCanPlay = () => {
      if (playbackStateRef.current === "buffering") playbackStateRef.current = video.paused ? "paused" : "playing";
      onStatus({ ready: readyRef.current, buffering: false, autoplayMuted: false, poorConnection: false, error: null });
    };
    const onEnded = () => {
      playbackStateRef.current = "ended";
    };
    const onError = () => {
      onStatus({ ready: false, buffering: false, autoplayMuted: false, poorConnection: false, error: "NOT_FOUND" });
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted || volume === 0;
    video.volume = Math.min(1, Math.max(0, volume / 100));
  }, [volume, muted]);

  driverRef.current = {
    isReady: () => readyRef.current,
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    getDuration: () => {
      const d = videoRef.current?.duration;
      return d && Number.isFinite(d) ? d : 0;
    },
    getLoadedFraction: () => {
      const video = videoRef.current;
      if (!video || !video.duration) return 0;
      const buffered = video.buffered;
      if (buffered.length === 0) return 0;
      return Math.min(1, buffered.end(buffered.length - 1) / video.duration);
    },
    getPlaybackState: () => playbackStateRef.current,
    play: () => {
      const video = videoRef.current;
      if (!video) return;
      video.play().catch(() => {
        video.muted = true;
        void video.play();
        onStatus({
          ready: readyRef.current,
          buffering: false,
          autoplayMuted: true,
          poorConnection: false,
          error: null,
        });
      });
    },
    pause: () => videoRef.current?.pause(),
    seekTo: (sec) => {
      if (videoRef.current) videoRef.current.currentTime = sec;
    },
    loadVideo: (videoId, startSec) => {
      attachSource(videoId);
      playbackStateRef.current = "unstarted";
      const video = videoRef.current;
      if (video) video.currentTime = startSec;
    },
  };

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      getLoadedFraction: () => driverRef.current?.getLoadedFraction() ?? 0,
      localPlay,
      localPause,
      localSeek,
      unmuteAfterGesture: () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = false;
        video.volume = Math.min(1, Math.max(0, volume / 100 || 0.8));
      },
    }),
    [localPlay, localPause, localSeek, volume],
  );

  return (
    <video
      ref={videoRef}
      className={styles.playerMount}
      controls={false}
      disablePictureInPicture
      onContextMenu={(e) => e.preventDefault()}
    />
  );
});

export default FileStage;
