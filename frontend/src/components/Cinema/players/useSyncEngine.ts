"use client";

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
/** Наша власна дія (play/pause/seek) очікує застосування стільки часу, перш ніж звіряти дрейф знову. */
const LOCAL_ACTION_WINDOW_MS = 1500;
/** Після власної команди хост чекає її «відлуння» від сервера й не звіряється зі старим станом. */
const AWAIT_ECHO_MS = 3000;

export type SyncPlaybackState = "playing" | "paused" | "buffering" | "ended" | "unstarted";

/**
 * Тонкий контракт над конкретним провайдером, яким керує спільний цикл синхронізації нижче.
 * На відміну від YouTube IFrame API, більшість інших SDK асинхронні — тому `getCurrentTime`
 * тут читає значення з локального кешу (адаптер сам оновлює його з подій плеєра), а не питає
 * плеєр наживо щоразу.
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
  /** Викликається, коли треба завантажити ІНШЕ відео (змінився videoId у стані). */
  loadVideo(videoId: string, startSec: number, autoplay: boolean): void;
};

export type SyncEngineHandle = {
  syncStep: (explicit: boolean) => void;
  localPlay: () => number;
  localPause: () => number;
  localSeek: (sec: number) => void;
};

/**
 * Спільний цикл дрейф-корекції для провайдерів з асинхронним API (Vimeo/Dailymotion/File) —
 * узагальнена версія syncStep() із YouTubeStage.tsx. Поведінково максимально близька до неї
 * (той самий поріг дрейфу, SeekGovernor, вікно очікування «відлуння» власної команди), просто
 * не розрізняє походження onStateChange так тонко, як робить нативний YouTube IFrame API.
 */
export function useSyncEngine(
  driverRef: MutableRefObject<SyncDriver | null>,
  props: Pick<PlayerAdapterProps, "state" | "clock" | "isHost" | "onHeartbeat" | "onStatus">,
  loadedVideoRef: MutableRefObject<string | null>,
): SyncEngineHandle {
  const { state, clock, isHost, onHeartbeat, onStatus } = props;
  const stateRef = useRef(state);
  const isHostRef = useRef(isHost);
  const propsRef = useRef({ onHeartbeat, onStatus });
  useEffect(() => {
    propsRef.current = { onHeartbeat, onStatus };
  }, [onHeartbeat, onStatus]);
  useEffect(() => {
    stateRef.current = state;
    isHostRef.current = isHost;
  }, [state, isHost]);

  const governor = useRef(new SeekGovernor());
  const alignedOnceRef = useRef(false);
  const awaitingEchoUntil = useRef(0);
  const pendingLocalUntil = useRef(0);
  const status = useRef<StageStatus>({
    ready: false,
    buffering: false,
    autoplayMuted: false,
    poorConnection: false,
    error: null,
  });

  const publishStatus = useCallback((patch: Partial<StageStatus>) => {
    const next = { ...status.current, ...patch };
    const changed = (Object.keys(next) as (keyof StageStatus)[]).some(
      (key) => next[key] !== status.current[key],
    );
    status.current = next;
    if (changed) propsRef.current.onStatus(next);
  }, []);

  const syncStep = useCallback(
    (explicit: boolean) => {
      const driver = driverRef.current;
      const target = stateRef.current;
      if (!driver || !driver.isReady() || !target) return;
      const now = Date.now();
      const serverNow = clock.now();
      const expected = expectedPosition(target, serverNow);

      if (loadedVideoRef.current !== target.videoId) {
        loadedVideoRef.current = target.videoId;
        governor.current.reset(now);
        driver.loadVideo(target.videoId, expected, target.isPlaying);
        return;
      }

      if (isHostRef.current && now < awaitingEchoUntil.current) return;
      if (now < pendingLocalUntil.current) return;
      alignedOnceRef.current = true;

      if (explicit) governor.current.reset(now - 10_000);

      const playbackState = driver.getPlaybackState();
      const current = driver.getCurrentTime();

      if (!target.isPlaying) {
        if (playbackState === "playing" || playbackState === "buffering") {
          driver.pause();
        }
        if (Math.abs(current - target.positionSec) > PAUSED_SEEK_THRESHOLD_SEC) {
          driver.seekTo(target.positionSec);
        }
        return;
      }

      const duration = driver.getDuration();
      if (duration > 0 && expected >= duration - 0.5) return; // «додивилися» — не крутимо по колу

      if (playbackState === "paused" || playbackState === "unstarted" || playbackState === "ended") {
        if (Math.abs(current - expected) > DRIFT_SEEK_THRESHOLD_SEC) {
          driver.seekTo(expected);
        }
        driver.play();
        return;
      }

      if (playbackState === "buffering") return;

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
    if (state.originTag === DEVICE_TAG) awaitingEchoUntil.current = 0;
    const explicit =
      !prev ||
      (prev.version !== state.version &&
        ["play", "pause", "seek", "changeVideo", "sync", "host", "hostAway"].includes(state.reason));
    syncStep(explicit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isHost]);

  useEffect(() => {
    const tick = setInterval(() => syncStep(false), SYNC_TICK_MS);
    const heartbeat = setInterval(() => {
      const driver = driverRef.current;
      if (!isHostRef.current || !driver || !driver.isReady()) return;
      if (loadedVideoRef.current !== stateRef.current.videoId) return;
      const s = driver.getPlaybackState();
      propsRef.current.onHeartbeat(driver.getCurrentTime(), s === "playing" || s === "buffering");
    }, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncStep(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncStep, driverRef, loadedVideoRef]);

  const localPlay = useCallback((): number => {
    const driver = driverRef.current;
    if (!driver || !driver.isReady()) return 0;
    pendingLocalUntil.current = Date.now() + LOCAL_ACTION_WINDOW_MS;
    awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
    driver.play();
    return driver.getCurrentTime();
  }, [driverRef]);

  const localPause = useCallback((): number => {
    const driver = driverRef.current;
    if (!driver || !driver.isReady()) return 0;
    pendingLocalUntil.current = Date.now() + LOCAL_ACTION_WINDOW_MS;
    awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
    driver.pause();
    return driver.getCurrentTime();
  }, [driverRef]);

  const localSeek = useCallback(
    (sec: number) => {
      const driver = driverRef.current;
      if (!driver || !driver.isReady()) return;
      governor.current.reset(Date.now());
      pendingLocalUntil.current = Date.now() + LOCAL_ACTION_WINDOW_MS;
      awaitingEchoUntil.current = Date.now() + AWAIT_ECHO_MS;
      driver.seekTo(Math.max(0, sec));
    },
    [driverRef],
  );

  return { syncStep, localPlay, localPause, localSeek };
}
