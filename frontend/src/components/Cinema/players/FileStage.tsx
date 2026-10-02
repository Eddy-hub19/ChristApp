"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Hls from "hls.js";
import { HLS_CONFIG, HLS_MAX_RECOVERY_ATTEMPTS } from "@/lib/hlsConfig";
import type { PlayerAdapterHandle, PlayerAdapterProps, StageQuality } from "./types";
import { useSyncEngine, type SyncDriver, type SyncPlaybackState } from "./useSyncEngine";
import styles from "../CinemaHall.module.scss";

function isHlsUrl(url: string): boolean {
  try {
    return /\.m3u8(?:$|[?#])/i.test(new URL(url).pathname);
  } catch {
    return /\.m3u8(?:$|[?#])/i.test(url);
  }
}

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
  autoPictureInPicture?: boolean;
};

/** Субтитрів у залі немає: вимикаємо всі текстові доріжки (нативний HLS у Safari вмикає їх сам за системними налаштуваннями). */
function disableTextTracks(video: HTMLVideoElement) {
  for (const track of Array.from(video.textTracks)) {
    if (track.mode !== "disabled") track.mode = "disabled";
  }
}

function levelLabel(level: { height?: number; bitrate?: number }): string {
  if (level.height) return `${level.height}p`;
  return level.bitrate ? `${Math.round(level.bitrate / 1000)} kbps` : "?";
}

/** Стандартний PiP (Chrome/Edge/Safari desktop) або presentation mode на iOS Safari. */
function isPipSupported(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  const v = video as WebkitVideo;
  if (typeof document !== "undefined" && document.pictureInPictureEnabled && !video.disablePictureInPicture) {
    return typeof video.requestPictureInPicture === "function";
  }
  return Boolean(v.webkitSupportsPresentationMode?.("picture-in-picture"));
}

async function togglePip(video: HTMLVideoElement): Promise<void> {
  const v = video as WebkitVideo;
  try {
    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
      return;
    }
    if (v.webkitSupportsPresentationMode?.("picture-in-picture")) {
      v.webkitSetPresentationMode?.(
        v.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture",
      );
    }
  } catch {
    // PiP відхилено браузером (немає жесту, вже в іншому PiP) — тихо ігноруємо
  }
}

/**
 * Автоматичний PiP при згортанні застосунку — там, де платформа це вміє: iOS Safari
 * (`autoPictureInPicture`) і Chrome (media session `enterpictureinpicture`). Де не вміє — нічого не робимо.
 */
function enableAutoPip(video: HTMLVideoElement) {
  const v = video as WebkitVideo;
  if ("autoPictureInPicture" in v || isPipSupported(video)) v.autoPictureInPicture = true;
  try {
    navigator.mediaSession?.setActionHandler(
      "enterpictureinpicture" as MediaSessionAction,
      () => void togglePip(video),
    );
  } catch {
    // старі браузери кидають на невідому дію — це нормально
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
        const hls = new Hls(HLS_CONFIG);
        let recoveries = 0;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.FRAG_LOADED, () => {
          recoveries = 0;
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          hls.subtitleTrack = -1;
          hls.subtitleDisplay = false;
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          // Спершу пробуємо відновитись (обмежену кількість разів, щоб не крутитись вічно)
          if (recoveries < HLS_MAX_RECOVERY_ATTEMPTS) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              recoveries++;
              hls.recoverMediaError();
              return;
            }
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response?.code !== 403) {
              recoveries++;
              hls.startLoad();
              return;
            }
          }
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
    enableAutoPip(video);
    const onTrackAdded = () => disableTextTracks(video);
    video.textTracks.addEventListener("addtrack", onTrackAdded);
    video.muted = muted || volume === 0;
    video.volume = Math.min(1, Math.max(0, volume / 100));
    attachSource(state.videoId);
    loadedVideoRef.current = state.videoId;

    const onLoadedMetadata = () => {
      disableTextTracks(video);
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
      video.textTracks.removeEventListener("addtrack", onTrackAdded);
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
      try {
        navigator.mediaSession?.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {
        // див. enableAutoPip
      }
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
      getDuration: () => driverRef.current?.getDuration() ?? 0,
      getLoadedFraction: () => driverRef.current?.getLoadedFraction() ?? 0,
      localPlay,
      localPause,
      localSeek,
      getQualities: (): StageQuality[] => {
        const hls = hlsRef.current;
        if (!hls || hls.levels.length < 2) return [];
        // Той самий рівень може траплятись кілька разів (різні кодеки/бітрейти) — лишаємо найвищий бітрейт на висоту
        const byLabel = new Map<string, { index: number; bitrate: number; height: number }>();
        hls.levels.forEach((level, index) => {
          const label = levelLabel(level);
          const prev = byLabel.get(label);
          if (!prev || level.bitrate > prev.bitrate) byLabel.set(label, { index, bitrate: level.bitrate, height: level.height });
        });
        const items = [...byLabel].sort((a, b) => b[1].height - a[1].height || b[1].bitrate - a[1].bitrate);
        return [{ id: "auto", label: "Auto" }, ...items.map(([label, v]) => ({ id: String(v.index), label }))];
      },
      getQuality: () => {
        const hls = hlsRef.current;
        if (!hls || hls.autoLevelEnabled) return "auto";
        return String(hls.currentLevel);
      },
      setQuality: (id: string) => {
        const hls = hlsRef.current;
        if (!hls) return;
        hls.currentLevel = id === "auto" ? -1 : Number(id);
      },
      isPipSupported: () => isPipSupported(videoRef.current),
      togglePip: () => {
        const video = videoRef.current;
        if (video) void togglePip(video);
      },
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
      onContextMenu={(e) => e.preventDefault()}
    />
  );
});

export default FileStage;
