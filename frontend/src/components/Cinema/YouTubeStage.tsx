"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  YT_STATE,
  classifyYouTubeError,
  loadYouTubeIframeApi,
  type YTPlayer,
  type YouTubePlayerErrorKind,
} from "@/lib/youtube";
import {
  DEVICE_TAG,
  DRIFT_SEEK_THRESHOLD_SEC,
  SeekGovernor,
  expectedPosition,
  type ServerClock,
  type WatchState,
} from "@/lib/watchSync";
import styles from "./CinemaHall.module.scss";

const SYNC_TICK_MS = 1000;
const HEARTBEAT_MS = 5000;
/** На паузі кадр статичний — вирівнюємо точніше, ніж під час відтворення. */
const PAUSED_SEEK_THRESHOLD_SEC = 0.5;
/** Seek під час відтворення робимо трохи «наперед»: поки плеєр дозавантажиться, зал піде далі. */
const SEEK_LEAD_SEC = 0.3;
/** Скільки чекаємо, що playVideo() справді запустить відео, перш ніж вмикати беззвучний режим. */
const AUTOPLAY_GRACE_MS = 4000;
/** Наша власна дія (play/pause/seek) очікує відповідного onStateChange стільки часу. */
const LOCAL_ACTION_WINDOW_MS = 1500;
/** Після власної команди хост чекає її «відлуння» від сервера й не звіряється зі старим станом. */
const AWAIT_ECHO_MS = 3000;

export type StageStatus = {
  ready: boolean;
  buffering: boolean;
  /** Браузер не дав запустити звук — граємо беззвучно, поки користувач не торкнеться «Увімкнути звук». */
  autoplayMuted: boolean;
  poorConnection: boolean;
  error: YouTubePlayerErrorKind | null;
};

export type YouTubeStageHandle = {
  getCurrentTime(): number;
  getDuration(): number;
  getLoadedFraction(): number;
  /** Дії хоста: одразу застосовуються локально, а сервер отримує команду окремо. */
  localPlay(): number;
  localPause(): number;
  localSeek(sec: number): void;
  unmuteAfterGesture(): void;
};

type YouTubeStageProps = {
  state: WatchState;
  clock: ServerClock;
  isHost: boolean;
  volume: number;
  muted: boolean;
  onStatus: (status: StageStatus) => void;
  /** Хост натиснув на саме відео (не на нашу панель) — це теж команда для всіх. */
  onHostPlayerAction: (action: { type: "play" | "pause"; positionSec: number }) => void;
  onHeartbeat: (positionSec: number, isPlaying: boolean) => void;
};

/**
 * Офіційний YouTube IFrame Player + цикл синхронізації.
 * Власні контроли лежать поза iframe; логотип, реклама та елементи YouTube не перекриваються.
 */
const YouTubeStage = forwardRef<YouTubeStageHandle, YouTubeStageProps>(function YouTubeStage(
  { state, clock, isHost, volume, muted, onStatus, onHostPlayerAction, onHeartbeat },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);

  const stateRef = useRef(state);
  const isHostRef = useRef(isHost);
  const propsRef = useRef({ onStatus, onHostPlayerAction, onHeartbeat, volume, muted });

  const governor = useRef(new SeekGovernor());
  const pendingLocal = useRef<{ kind: "play" | "pause"; until: number } | null>(null);
  const playRequestedAt = useRef(0);
  const lastSample = useRef<{ time: number; wall: number } | null>(null);
  const bufferingSince = useRef<number | null>(null);
  const status = useRef<StageStatus>({
    ready: false,
    buffering: false,
    autoplayMuted: false,
    poorConnection: false,
    error: null,
  });
  /** Хост уже хоч раз вирівнявся з сервером — далі позицію бере зі свого плеєра. */
  const alignedOnceRef = useRef(false);
  const awaitingEchoUntil = useRef(0);

  const publishStatus = useCallback((patch: Partial<StageStatus>) => {
    const next = { ...status.current, ...patch };
    const changed = (Object.keys(next) as Array<keyof StageStatus>).some(
      (key) => next[key] !== status.current[key],
    );
    status.current = next;
    if (changed) propsRef.current.onStatus(next);
  }, []);

  useEffect(() => {
    propsRef.current = { onStatus, onHostPlayerAction, onHeartbeat, volume, muted };
  }, [onStatus, onHostPlayerAction, onHeartbeat, volume, muted]);

  const localPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return 0;
    pendingLocal.current = { kind: "play", until: Date.now() + LOCAL_ACTION_WINDOW_MS };
    awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
    playRequestedAt.current = Date.now();
    player.playVideo();
    return player.getCurrentTime();
  }, []);

  const localPause = useCallback(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return 0;
    pendingLocal.current = { kind: "pause", until: Date.now() + LOCAL_ACTION_WINDOW_MS };
    awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
    player.pauseVideo();
    return player.getCurrentTime();
  }, []);

  const localSeek = useCallback((sec: number) => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    governor.current.reset(Date.now());
    awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
    lastSample.current = null;
    player.seekTo(Math.max(0, sec), true);
  }, []);

  /**
   * Один крок синхронізації. Викликається раз на секунду і одразу після нового стану з сервера.
   * `explicit` — прийшла явна команда (play/pause/seek/зміна відео): стрибаємо без очікувань.
   */
  const syncStep = useCallback(
    (explicit: boolean) => {
      const player = playerRef.current;
      const target = stateRef.current;
      if (!player || !readyRef.current || !target) return;
      const now = Date.now();
      const serverNow = clock.now();
      const expected = expectedPosition(target, serverNow);

      // 1) Інше відео — завантажуємо одразу в потрібну точку.
      if (loadedVideoRef.current !== target.videoId) {
        loadedVideoRef.current = target.videoId;
        governor.current.reset(now);
        lastSample.current = null;
        publishStatus({ error: null });
        if (target.isPlaying) {
          playRequestedAt.current = now;
          player.loadVideoById({ videoId: target.videoId, startSeconds: expected });
        } else {
          player.cueVideoById({ videoId: target.videoId, startSeconds: expected });
        }
        return;
      }

      // 2) Хост — джерело правди для позиції: сервер лише повторює його ж команди й heartbeat.
      //    Виняток — команда з іншого пристрою того ж хоста (інша вкладка / телефон).
      const fromOtherDevice =
        target.originTag !== null && target.originTag !== DEVICE_TAG;
      const hostTrustsLocal =
        isHostRef.current && alignedOnceRef.current && !fromOtherDevice;
      if (isHostRef.current && now < awaitingEchoUntil.current && !fromOtherDevice) {
        return;
      }
      const correctDrift = !hostTrustsLocal;
      alignedOnceRef.current = true;

      if (explicit) governor.current.reset(now - 10_000);

      const playerState = player.getPlayerState();
      const current = player.getCurrentTime();

      if (!target.isPlaying) {
        if (playerState === YT_STATE.PLAYING || playerState === YT_STATE.BUFFERING) {
          pendingLocal.current = { kind: "pause", until: now + LOCAL_ACTION_WINDOW_MS };
          player.pauseVideo();
        }
        // seekTo() на ще не запущеному (CUED/UNSTARTED) відео за документацією API запускає
        // відтворення — такий плеєр і так стоїть на startSeconds, а при play його вирівняє гілка нижче.
        const started =
          playerState !== YT_STATE.CUED && playerState !== YT_STATE.UNSTARTED;
        if (
          correctDrift &&
          started &&
          Math.abs(current - target.positionSec) > PAUSED_SEEK_THRESHOLD_SEC
        ) {
          player.seekTo(target.positionSec, true);
        }
        lastSample.current = null;
        return;
      }

      // Відтворення має йти.
      const duration = player.getDuration();
      if (duration > 0 && expected >= duration - 0.5) {
        // Зал уже «додивився» — не крутимо відео по колу.
        return;
      }

      if (
        playerState === YT_STATE.PAUSED ||
        playerState === YT_STATE.CUED ||
        playerState === YT_STATE.UNSTARTED ||
        playerState === YT_STATE.ENDED
      ) {
        if (correctDrift && Math.abs(current - expected) > DRIFT_SEEK_THRESHOLD_SEC) {
          player.seekTo(expected, true);
        }
        pendingLocal.current = { kind: "play", until: now + LOCAL_ACTION_WINDOW_MS };
        if (!playRequestedAt.current) playRequestedAt.current = now;
        player.playVideo();

        // Браузер блокує автозапуск зі звуком — запускаємо беззвучно, звук увімкнемо за дотиком.
        if (
          now - playRequestedAt.current > AUTOPLAY_GRACE_MS &&
          !player.isMuted()
        ) {
          player.mute();
          player.playVideo();
          publishStatus({ autoplayMuted: true });
        }
        return;
      }
      playRequestedAt.current = 0;

      // Буферизація: плеєр і так наздоганяє, seek тільки зірве завантаження.
      if (!correctDrift || playerState === YT_STATE.BUFFERING) {
        lastSample.current = null;
        return;
      }

      // «Завис» у PLAYING (реклама або підвисання мережі): час не йде — не міряємо дрейф.
      const sample = lastSample.current;
      lastSample.current = { time: current, wall: now };
      if (sample && now - sample.wall >= 800 && current - sample.time < 0.25) {
        return;
      }

      const drift = expected - current;
      if (Math.abs(drift) <= DRIFT_SEEK_THRESHOLD_SEC) {
        governor.current.markStable(now);
        publishStatus({ poorConnection: false });
        return;
      }

      if (!governor.current.canCorrect(now)) {
        publishStatus({ poorConnection: governor.current.isBackingOff });
        return;
      }

      governor.current.recordSeek(now);
      lastSample.current = null;
      player.seekTo(expected + (drift > 0 ? SEEK_LEAD_SEC : 0), true);
      publishStatus({ poorConnection: governor.current.isBackingOff });
    },
    [clock, publishStatus],
  );

  // Новий стан із сервера → одразу крок синхронізації.
  useEffect(() => {
    const prev = stateRef.current;
    stateRef.current = state;
    isHostRef.current = isHost;
    // Сервер підтвердив нашу ж команду — більше не чекаємо «відлуння».
    if (state.originTag === DEVICE_TAG) awaitingEchoUntil.current = 0;
    const explicit =
      !prev ||
      (prev.version !== state.version &&
        ["play", "pause", "seek", "changeVideo", "sync", "host", "hostAway"].includes(
          state.reason,
        ));
    syncStep(explicit);
  }, [state, isHost, syncStep]);

  // Створення плеєра.
  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;

    const host = document.createElement("div");
    mount.appendChild(host);

    loadYouTubeIframeApi()
      .then((YT) => {
        if (disposed) return;
        const initial = stateRef.current;
        loadedVideoRef.current = initial.videoId;
        playerRef.current = new YT.Player(host, {
          videoId: initial.videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            // Власна панель керування поза iframe; логотип і реклама YouTube лишаються як є.
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            origin: window.location.origin,
            start: Math.floor(expectedPosition(initial, clock.now())),
          },
          events: {
            onReady: (event) => {
              if (disposed) return;
              readyRef.current = true;
              const { volume: v, muted: m } = propsRef.current;
              event.target.setVolume(v);
              if (m) event.target.mute();
              else event.target.unMute();
              publishStatus({ ready: true });
              syncStep(true);
            },
            onStateChange: (event) => {
              const s = event.data;
              const now = Date.now();

              if (s === YT_STATE.BUFFERING) {
                bufferingSince.current ??= now;
                publishStatus({ buffering: true });
              } else {
                bufferingSince.current = null;
                publishStatus({ buffering: false });
              }

              const pending = pendingLocal.current;
              const isOurs =
                pending &&
                now < pending.until &&
                ((pending.kind === "play" && s === YT_STATE.PLAYING) ||
                  (pending.kind === "pause" && s === YT_STATE.PAUSED));
              if (isOurs) {
                pendingLocal.current = null;
                return;
              }

              const target = stateRef.current;
              if (isHostRef.current) {
                // Хост натиснув на саме відео — поширюємо як звичайну команду.
                awaitingEchoUntil.current = now + AWAIT_ECHO_MS;
                if (s === YT_STATE.PLAYING && !target.isPlaying) {
                  propsRef.current.onHostPlayerAction({
                    type: "play",
                    positionSec: event.target.getCurrentTime(),
                  });
                } else if (
                  (s === YT_STATE.PAUSED || s === YT_STATE.ENDED) &&
                  target.isPlaying
                ) {
                  propsRef.current.onHostPlayerAction({
                    type: "pause",
                    positionSec: event.target.getCurrentTime(),
                  });
                }
                return;
              }

              // Глядач сам поставив паузу / відтворення — повертаємо до спільного стану.
              if (
                (s === YT_STATE.PAUSED && target.isPlaying) ||
                (s === YT_STATE.PLAYING && !target.isPlaying)
              ) {
                syncStep(true);
              }
            },
            onError: (event) => {
              publishStatus({ error: classifyYouTubeError(event.data) });
            },
            onAutoplayBlocked: (event) => {
              event.target.mute();
              event.target.playVideo();
              publishStatus({ autoplayMuted: true });
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) publishStatus({ error: "HTML5" });
      });

    return () => {
      disposed = true;
      readyRef.current = false;
      try {
        playerRef.current?.destroy();
      } catch {
        // iframe уже прибрано разом із DOM
      }
      playerRef.current = null;
      host.remove();
    };
    // Плеєр створюється один раз; далі все йде через syncStep і refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Цикл синхронізації + heartbeat хоста.
  useEffect(() => {
    const tick = setInterval(() => syncStep(false), SYNC_TICK_MS);
    const heartbeat = setInterval(() => {
      const player = playerRef.current;
      if (!isHostRef.current || !player || !readyRef.current) return;
      if (loadedVideoRef.current !== stateRef.current.videoId) return;
      const s = player.getPlayerState();
      propsRef.current.onHeartbeat(
        player.getCurrentTime(),
        s === YT_STATE.PLAYING || s === YT_STATE.BUFFERING,
      );
    }, HEARTBEAT_MS);
    // Повернулися у вкладку: таймери у фоні пригальмовуються — вирівнюємося одразу.
    const onVisible = () => {
      if (document.visibilityState === "visible") syncStep(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncStep]);

  // Гучність у кожного своя — нікуди не синхронізується.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    player.setVolume(volume);
    if (muted) player.mute();
    else player.unMute();
  }, [volume, muted]);

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () =>
        readyRef.current && playerRef.current ? playerRef.current.getCurrentTime() : 0,
      getDuration: () =>
        readyRef.current && playerRef.current ? playerRef.current.getDuration() : 0,
      getLoadedFraction: () =>
        readyRef.current && playerRef.current ? playerRef.current.getVideoLoadedFraction() : 0,
      localPlay,
      localPause,
      localSeek,
      unmuteAfterGesture: () => {
        const player = playerRef.current;
        if (!player) return;
        player.unMute();
        player.setVolume(propsRef.current.volume || 80);
        publishStatus({ autoplayMuted: false });
      },
    }),
    [localPlay, localPause, localSeek, publishStatus],
  );

  return <div ref={mountRef} className={styles.playerMount} />;
});

export default YouTubeStage;
