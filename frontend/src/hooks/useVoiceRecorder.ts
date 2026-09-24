"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Ліміт запису: 1 хвилина. */
export const MAX_RECORDING_MS = 60_000;
export const MAX_RECORDING_SECONDS = 60;

export type VoiceRecorderError = "permission" | "unsupported" | "failed";

type UseVoiceRecorderOptions = {
  /** Дійшли до ліміту хвилини: запис завершився сам, blob треба кудись подіти. */
  onAutoStop?: (blob: Blob | null) => void;
};

type UseVoiceRecorderResult = {
  isRecording: boolean;
  seconds: number;
  stream: MediaStream | null;
  error: VoiceRecorderError | null;
  clearError: () => void;
  /** Запитує дозвіл (якщо треба) і починає запис. `false` — почати не вдалося. */
  start: () => Promise<boolean>;
  /** Завершує запис і віддає готовий blob (null, якщо порожньо). */
  stop: () => Promise<Blob | null>;
  /** Кидає запис — нічого не повертає й не надсилає. */
  cancel: () => void;
};

function pickAudioMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const mime of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(mime)
    ) {
      return mime;
    }
  }
  return "";
}

export function useVoiceRecorder(
  options?: UseVoiceRecorderOptions,
): UseVoiceRecorderResult {
  const onAutoStopRef = useRef(options?.onAutoStop);
  onAutoStopRef.current = options?.onAutoStop;

  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<VoiceRecorderError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  /** Заявка на blob від `stop()` — щоб віддати його рівно один раз. */
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const start = useCallback(async () => {
    if (recorderRef.current) {
      return false;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("unsupported");
      return false;
    }

    setError(null);
    cancelledRef.current = false;

    let micStream: MediaStream;
    try {
      // Дозвіл на мікрофон запитуємо саме тут — на явну дію користувача.
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "permission"
          : "failed",
      );
      return false;
    }

    try {
      streamRef.current = micStream;
      setStream(micStream);

      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(
        micStream,
        mimeType ? { mimeType } : undefined,
      );

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = cancelledRef.current
          ? null
          : new Blob(chunksRef.current, { type });
        chunksRef.current = [];

        releaseStream();
        clearTimers();
        setIsRecording(false);
        setSeconds(0);

        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        resolve?.(blob && blob.size > 0 ? blob : null);
      };

      recorderRef.current = recorder;
      recorder.start(200);
      setIsRecording(true);
      setSeconds(0);

      tickRef.current = window.setInterval(() => {
        setSeconds((previous) => Math.min(previous + 1, MAX_RECORDING_SECONDS));
      }, 1000);

      return true;
    } catch {
      releaseStream();
      clearTimers();
      setIsRecording(false);
      setError("failed");
      return false;
    }
  }, [clearTimers, releaseStream]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    clearTimers();

    if (!recorder || recorder.state === "inactive") {
      releaseStream();
      setIsRecording(false);
      setSeconds(0);
      return null;
    }

    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        stopResolveRef.current = null;
        releaseStream();
        setIsRecording(false);
        setSeconds(0);
        resolve(null);
      }
    });
  }, [clearTimers, releaseStream]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    void stop();
  }, [stop]);

  // Ліміт хвилини: доводимо запис до кінця й віддаємо його як звичайний stop.
  useEffect(() => {
    if (!isRecording) {
      return;
    }
    maxTimerRef.current = window.setTimeout(() => {
      void stop().then((blob) => onAutoStopRef.current?.(blob));
    }, MAX_RECORDING_MS);

    return () => {
      if (maxTimerRef.current !== null) {
        window.clearTimeout(maxTimerRef.current);
        maxTimerRef.current = null;
      }
    };
  }, [isRecording, stop]);

  useEffect(() => {
    return () => {
      clearTimers();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        cancelledRef.current = true;
        try {
          recorder.stop();
        } catch {
          // ігноруємо
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [clearTimers]);

  return {
    isRecording,
    seconds,
    stream,
    error,
    clearError,
    start,
    stop,
    cancel,
  };
}
