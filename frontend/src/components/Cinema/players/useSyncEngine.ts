import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import {
  DEVICE_TAG,
  DRIFT_SEEK_THRESHOLD_SEC,
  SeekGovernor,
  expectedPosition,
} from "@/lib/watchSync";
import type { PlayerAdapterProps, StageStatus } from "./types";

const SYNC_TICK_MS = 1000;
const HEARTBEAT_MS = 5000;
/** На паузі кадр статичний — вирівнюємо точніше, ніж під час відтворення. */
const PAUSED_SEEK_THRESHOLD_SEC = 0.5;
/** Seek під час відтворення робимо трохи «наперед»: поки плеєр дозавантажиться, зал піде далі. */
const SEEK_LEAD_SEC = 0.3;
/** Наша власна дія (play/pause/seek) очікує відповідного стану плеєра стільки часу. */
const LOCAL_ACTION_WINDOW_MS = 1500;
/** Після власної команди хост чекає її «відлуння» від сервера й не звіряється зі старим станом. */
const AWAIT_ECHO_MS = 3000;

export type SyncPlaybackState = "unstarted" | "buffering" | "playing" | "paused" | "ended";

/**
 * Мінімальний контракт, який має надати провайдер-специфічний плеєр (Vimeo/Dailymotion/HTML5),
 * щоб отримати ту саму логіку вирівнювання позиції, що й YouTubeStage. На відміну від
 * синхронного YouTube IFrame API, Vimeo/Dailymotion async — тож реалізації кешують
 * час/тривалість/буфер у refs, оновлюваних власними подіями (`timeupdate`, `progress`, …).
 */
export type SyncDriver = {
  isReady(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  getLoadedFraction(): number;
  getPlaybackState(): SyncPlaybackState;
  play(): void;
  pause(): void;
  seekTo(sec: number): void;
  /** Інше відео (зміна provider-специфічного id) — завантажити й, якщо autoplay, одразу грати. */
  loadVideo(videoId: string, startSec: number, autoplay: boolean): void;
};

export type SyncEngineHandle = {
  /** Один крок вирівнювання; `explicit` — прийшла явна команда, стрибаємо без очікувань. */
  syncStep(explicit: boolean): void;
  localPlay(): number;
  localPause(): number;
  localSeek(sec: number): void;
  publishStatus(patch: Partial<StageStatus>): void;
  /**
   * Адаптер викликає це зі своїх подій плеєра ("play"/"pause"/"ended"), коли стан міг змінитися
   * не через `localPlay`/`localPause` (хост торкнувся самого відео, або подія — відлуння нашої ж
   * команди). Поглинає власне відлуння; інакше або поширює дію хоста, або повертає глядача
   * до спільного стану.
   */
  notifyPlaybackState(playbackState: SyncPlaybackState): void;
};

/**
 * Узагальнення `syncStep`-циклу YouTubeStage для провайдерів з async API. Хук сам підписується
 * на зміни `state` та тримає цикл tick/heartbeat — адаптеру лишається тільки створити плеєр і
 * викликати `loadVideo`/оновлювати кешовані refs зі своїх подій.
 */
export function useSyncEngine(
  driverRef: MutableRefObject<SyncDriver | null>,
  props: PlayerAdapterProps,
  loadedVideoRef: MutableRefObject<string | null>,
): SyncEngineHandle {
  const { state, clock, isHost, onStatus, onHostPlayerAction, onHeartbeat } = props;

  const stateRef = useRef(state);
  const isHostRef = useRef(isHost);
  const propsRef = useRef(props);
  propsRef.current = props;

  const governor = useRef(new SeekGovernor());
  const pendingLocal = useRef<{ kind: "play" | "pause"; until: number } | null>(null);
  const playRequestedAt = useRef(0);
  const lastSample = useRef<{ time: number; wall: number } | null>(null);
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

  const localPlay = useCallback(() => {
    const driver = driverRef.current;
    if (!driver || !driver.isReady()) return 0;
    pendingLocal.current = { kind: "play", until: Date.now() + LOCAL_ACTION_WINDOW_MS };
    awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
    playRequestedAt.current = Date.now();
    driver.play();
    return driver.getCurrentTime();
  }, [driverRef]);

  const localPause = useCallback(() => {
    const driver = driverRef.current;
    if (!driver || !driver.isReady()) return 0;
    pendingLocal.current = { kind: "pause", until: Date.now() + LOCAL_ACTION_WINDOW_MS };
    awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
    driver.pause();
    return driver.getCurrentTime();
  }, [driverRef]);

  const localSeek = useCallback(
    (sec: number) => {
      const driver = driverRef.current;
      if (!driver || !driver.isReady()) return;
      governor.current.reset(Date.now());
      awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
      lastSample.current = null;
      driver.seekTo(Math.max(0, sec));
    },
    [driverRef],
  );

  const syncStep = useCallback(
    (explicit: boolean) => {
      const driver = driverRef.current;
      const target = stateRef.current;
      if (!driver || !driver.isReady() || !target) return;
      const now = Date.now();
      const serverNow = clock.now();
      const expected = expectedPosition(target, serverNow);

      // 1) Інше відео — завантажуємо одразу в потрібну точку.
      if (loadedVideoRef.current !== target.videoId) {
        loadedVideoRef.current = target.videoId;
        governor.current.reset(now);
        lastSample.current = null;
        publishStatus({ error: null });
        if (target.isPlaying) playRequestedAt.current = now;
        driver.loadVideo(target.videoId, expected, target.isPlaying);
        return;
      }

      // 2) Хост — джерело правди для позиції: сервер лише повторює його ж команди й heartbeat.
      //    Виняток — команда з іншого пристрою того ж хоста (інша вкладка / телефон).
      const fromOtherDevice = target.originTag !== null && target.originTag !== DEVICE_TAG;
      const hostTrustsLocal = isHostRef.current && alignedOnceRef.current && !fromOtherDevice;
      if (isHostRef.current && now < awaitingEchoUntil.current && !fromOtherDevice) {
        return;
      }
      const correctDrift = !hostTrustsLocal;
      alignedOnceRef.current = true;

      if (explicit) governor.current.reset(now - 10_000);

      const playbackState = driver.getPlaybackState();
      const current = driver.getCurrentTime();

      if (!target.isPlaying) {
        if (playbackState === "playing" || playbackState === "buffering") {
          pendingLocal.current = { kind: "pause", until: now + LOCAL_ACTION_WINDOW_MS };
          driver.pause();
        }
        const started = playbackState !== "unstarted";
        if (
          correctDrift &&
          started &&
          Math.abs(current - target.positionSec) > PAUSED_SEEK_THRESHOLD_SEC
        ) {
          driver.seekTo(target.positionSec);
        }
        lastSample.current = null;
        return;
      }

      // Відтворення має йти.
      const duration = driver.getDuration();
      if (duration > 0 && expected >= duration - 0.5) {
        // Зал уже «додивився» — не крутимо відео по колу.
        return;
      }

      if (
        playbackState === "paused" ||
        playbackState === "unstarted" ||
        playbackState === "ended"
      ) {
        if (correctDrift && Math.abs(current - expected) > DRIFT_SEEK_THRESHOLD_SEC) {
          driver.seekTo(expected);
        }
        pendingLocal.current = { kind: "play", until: now + LOCAL_ACTION_WINDOW_MS };
        if (!playRequestedAt.current) playRequestedAt.current = now;
        driver.play();
        return;
      }
      playRequestedAt.current = 0;

      // Буферизація: плеєр і так наздоганяє, seek тільки зірве завантаження.
      if (!correctDrift || playbackState === "buffering") {
        lastSample.current = null;
        return;
      }

      // «Завис» у playing (підвисання мережі): час не йде — не міряємо дрейф.
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
      driver.seekTo(expected + (drift > 0 ? SEEK_LEAD_SEC : 0));
      publishStatus({ poorConnection: governor.current.isBackingOff });
    },
    [clock, driverRef, loadedVideoRef, publishStatus],
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

  // Циклічна перевірка + heartbeat хоста.
  useEffect(() => {
    const tick = setInterval(() => syncStep(false), SYNC_TICK_MS);
    const heartbeat = setInterval(() => {
      const driver = driverRef.current;
      if (!isHostRef.current || !driver || !driver.isReady()) return;
      if (loadedVideoRef.current !== stateRef.current.videoId) return;
      const playbackState = driver.getPlaybackState();
      onHeartbeat(
        driver.getCurrentTime(),
        playbackState === "playing" || playbackState === "buffering",
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
    // driverRef/loadedVideoRef — стабільні refs; onHeartbeat читаємо через замикання наміру нема,
    // бере актуальний з останнього рендеру через залежність нижче.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStep, onHeartbeat]);

  const notifyPlaybackState = useCallback(
    (playbackState: SyncPlaybackState) => {
      const now = Date.now();
      const pending = pendingLocal.current;
      const isOurs =
        pending &&
        now < pending.until &&
        ((pending.kind === "play" && playbackState === "playing") ||
          (pending.kind === "pause" && playbackState === "paused"));
      if (isOurs) {
        pendingLocal.current = null;
        return;
      }

      const driver = driverRef.current;
      const target = stateRef.current;
      if (isHostRef.current) {
        // Хост натиснув на саме відео — поширюємо як звичайну команду.
        awaitingEchoUntil.current = now + AWAIT_ECHO_MS;
        if (playbackState === "playing" && !target.isPlaying) {
          propsRef.current.onHostPlayerAction({
            type: "play",
            positionSec: driver?.getCurrentTime() ?? target.positionSec,
          });
        } else if (
          (playbackState === "paused" || playbackState === "ended") &&
          target.isPlaying
        ) {
          propsRef.current.onHostPlayerAction({
            type: "pause",
            positionSec: driver?.getCurrentTime() ?? target.positionSec,
          });
        }
        return;
      }

      // Глядач сам поставив паузу / відтворення (або клавіатура/жест) — повертаємо до спільного стану.
      if (
        (playbackState === "paused" && target.isPlaying) ||
        (playbackState === "playing" && !target.isPlaying)
      ) {
        syncStep(true);
      }
    },
    [driverRef, syncStep],
  );

  return {
    syncStep,
    localPlay,
    localPause,
    localSeek,
    publishStatus,
    notifyPlaybackState,
  };
}
