"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_VOICE_DURATION_MS } from "@/lib/chatMedia";

/** Ліміт запису: 1 хвилина. */
export const MAX_RECORDING_MS = 60_000;
export const MAX_RECORDING_SECONDS = 60;

/** Готовий запис разом із реальною тривалістю (мс), виміряною за годинником, а не за тиками таймера. */
export type RecordedVoice = Blob & { durationMs?: number };

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
  // audio/mp4 (AAC) першим: він грає і в Safari/iPhone, і в Chrome/Android; webm/opus — лише запасний.
  const candidates = [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
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
  const startedAtRef = useRef(0);
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
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
        const durationMs = Date.now() - startedAtRef.current;
        // Дотик довжиною менше секунди — це не голосове, а випадковий клік: відкидаємо.
        const tooShort = durationMs < MIN_VOICE_DURATION_MS;
        const blob: RecordedVoice | null =
          cancelledRef.current || tooShort
            ? null
            : new Blob(chunksRef.current, { type });
        if (blob) blob.durationMs = durationMs;
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
      startedAtRef.current = Date.now();
      recorder.start(200);
      setIsRecording(true);
      setSeconds(0);

      // Таймер за реальним часом: тики setInterval у фоні/при тротлінгу відстають.
      tickRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setSeconds(Math.min(elapsed, MAX_RECORDING_SECONDS));
      }, 250);

      // Мікрофон відібрали (дзвінок, iOS у фоні): завершуємо запис і віддаємо те, що встигли.
      micStream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (recorderRef.current === recorder) {
            void stop().then((blob) => onAutoStopRef.current?.(blob));
          }
        });
      });

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
