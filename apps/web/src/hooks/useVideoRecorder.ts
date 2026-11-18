"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseVideoRecorderOptions = {
  uploadUrl: string;
  getAuthToken: () => Promise<string | null>;
  onUploaded: (secureUrl: string) => void | Promise<void>;
  onError?: (message: string) => void;
};

type UseVideoRecorderResult = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  closeScene: () => Promise<void>;
  switchCamera: () => Promise<void>;
  isRecording: boolean;
  isUploading: boolean;
  isSwitchingCamera: boolean;
  isSceneOpen: boolean;
  elapsedSeconds: number;
  maxDurationSeconds: number;
  facingMode: "user" | "environment";
  previewVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
};

const MAX_VIDEO_NOTE_SECONDS = 60;
/** Кружок квадратний — пишемо рівно в такий канвас. */
const VIDEO_NOTE_SIZE_PX = 480;
const VIDEO_NOTE_FPS = 30;

const VIDEO_NOTE_MIME_ALLOW = new Set([
  "video/webm",
  "video/mp4",
  "video/quicktime",
]);

function pickVideoMimeType(): string {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
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

export function useVideoRecorder({
  uploadUrl,
  getAuthToken,
  onUploaded,
  onError,
}: UseVideoRecorderOptions): UseVideoRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isSceneOpen, setIsSceneOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const recorderRef = useRef<MediaRecorder | null>(null);
  /** Потік камери: міняється при перевороті. */
  const cameraStreamRef = useRef<MediaStream | null>(null);
  /** Потік мікрофона: живе всю сесію, щоб звук не рвався при перевороті камери. */
  const micStreamRef = useRef<MediaStream | null>(null);
  /** Те, що реально пише MediaRecorder: відео з канвасу + постійний звук. */
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");

  const stopCameraStream = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
  }, []);

  const stopDrawLoop = useCallback(() => {
    if (drawFrameRef.current !== null) {
      cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = null;
    }
  }, []);

  const teardownMedia = useCallback(() => {
    stopDrawLoop();
    stopCameraStream();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    recordingStreamRef.current = null;
    canvasRef.current = null;
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  }, [stopCameraStream, stopDrawLoop]);

  /** Відкриває камеру з потрібного боку і показує її в прев'ю. Звук не чіпає. */
  const openCameraStream = useCallback(
    async (nextFacingMode: "user" | "environment") => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: VIDEO_NOTE_SIZE_PX },
          height: { ideal: VIDEO_NOTE_SIZE_PX },
          aspectRatio: { ideal: 1 },
          facingMode: nextFacingMode,
        },
        audio: false,
      });

      // Стару камеру глушимо лише після того, як нова вже відкрилась,
      // інакше на перевороті буде чорний кадр у записі.
      stopCameraStream();
      cameraStreamRef.current = stream;
      facingModeRef.current = nextFacingMode;

      const previewVideo = previewVideoRef.current;
      if (previewVideo) {
        previewVideo.srcObject = stream;
        await previewVideo.play().catch(() => undefined);
      }

      return stream;
    },
    [stopCameraStream],
  );

  /**
   * Пишемо не напряму з камери, а з канвасу: доріжка канвасу не переривається,
   * тому камеру можна перевернути просто посеред запису (як у Telegram).
   */
  const startDrawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const drawFrame = () => {
      drawFrameRef.current = requestAnimationFrame(drawFrame);

      const video = previewVideoRef.current;
      if (!video || video.readyState < 2) {
        return;
      }

      const side = Math.min(video.videoWidth, video.videoHeight);
      if (!side) {
        return;
      }
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;

      context.save();
      // Фронтальну камеру дзеркалимо — інакше запис не збігається з тим, що людина бачить.
      if (facingModeRef.current === "user") {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(
        video,
        sx,
        sy,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      context.restore();
    };

    stopDrawLoop();
    drawFrame();
  }, [stopDrawLoop]);

  const uploadBlob = useCallback(
    async (blob: Blob) => {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Нет токена авторизации");
      }

      const sourceMime = blob.type.split(";")[0].trim().toLowerCase();
      const normalizedMime = VIDEO_NOTE_MIME_ALLOW.has(sourceMime)
        ? sourceMime
        : "video/webm";
      const ext = normalizedMime.includes("mp4")
        ? "mp4"
        : normalizedMime.includes("quicktime")
          ? "mov"
          : "webm";

      // Всегда создаём File с явным чистым MIME без codec-суффиксов,
      // иначе Multer может передать «video/webm;codecs=vp9,opus» в file.mimetype
      // и NestJS FileTypeValidator / ручная проверка завалится.
      const fileToUpload = new File([blob], `video-note.${ext}`, {
        type: normalizedMime,
      });

      const formData = new FormData();
      formData.append("file", fileToUpload);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const reason =
          (await response.text()).trim() || `HTTP ${response.status}`;
        throw new Error(reason);
      }

      const payload = (await response.json()) as { secure_url?: string };
      const secureUrl = payload?.secure_url?.trim();
      if (!secureUrl) {
        throw new Error("Сервер не вернул secure_url");
      }

      await onUploaded(secureUrl);
    },
    [getAuthToken, onUploaded, uploadUrl],
  );

  const start = useCallback(async () => {
    if (recorderRef.current || isUploading) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      onError?.("Запись видео не поддерживается на этом устройстве");
      return;
    }

    try {
      setIsSceneOpen(true);

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      micStreamRef.current = micStream;

      await openCameraStream(facingModeRef.current);

      const canvas = document.createElement("canvas");
      canvas.width = VIDEO_NOTE_SIZE_PX;
      canvas.height = VIDEO_NOTE_SIZE_PX;
      canvasRef.current = canvas;
      startDrawLoop();

      const canvasStream = canvas.captureStream(VIDEO_NOTE_FPS);
      const recordingStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...micStream.getAudioTracks(),
      ]);
      recordingStreamRef.current = recordingStream;

      const mimeType = pickVideoMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(recordingStream, options);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "video/webm",
        });
        chunksRef.current = [];
        setIsRecording(false);
        startedAtRef.current = null;
        setElapsedSeconds(0);

        if (!blob.size) {
          teardownMedia();
          setIsSceneOpen(false);
          return;
        }

        setIsUploading(true);
        void uploadBlob(blob)
          .catch((error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "Не удалось отправить видео";
            onError?.(message);
          })
          .finally(() => {
            teardownMedia();
            setIsSceneOpen(false);
            setIsUploading(false);
          });
      };

      recorderRef.current = recorder;
      recorder.start(160);
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setIsRecording(true);
    } catch {
      teardownMedia();
      setIsSceneOpen(false);
      onError?.("Нет доступа к камере или микрофону");
    }
  }, [
    isUploading,
    onError,
    openCameraStream,
    startDrawLoop,
    teardownMedia,
    uploadBlob,
  ]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    stopDrawLoop();

    if (!recorder) {
      teardownMedia();
      setIsRecording(false);
      startedAtRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    } else {
      teardownMedia();
      setIsRecording(false);
      startedAtRef.current = null;
      setElapsedSeconds(0);
    }
  }, [stopDrawLoop, teardownMedia]);

  const closeScene = useCallback(async () => {
    if (isRecording) {
      await stop();
    } else {
      teardownMedia();
      setElapsedSeconds(0);
      startedAtRef.current = null;
      setIsSceneOpen(false);
    }
  }, [isRecording, stop, teardownMedia]);

  /** Переворот камери доступний і під час запису — доріжка канвасу не переривається. */
  const switchCamera = useCallback(async () => {
    if (isSwitchingCamera) {
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      onError?.("Камера недоступна на этом устройстве");
      return;
    }

    const nextFacingMode =
      facingModeRef.current === "user" ? "environment" : "user";
    setIsSwitchingCamera(true);
    try {
      await openCameraStream(nextFacingMode);
      setFacingMode(nextFacingMode);
    } catch {
      onError?.("Не удалось переключить камеру");
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [isSwitchingCamera, onError, openCameraStream]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) {
        return;
      }

      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= MAX_VIDEO_NOTE_SECONDS) {
        void stop();
      }
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [isRecording, stop]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      recorderRef.current = null;
      teardownMedia();
    };
  }, [teardownMedia]);

  return {
    start,
    stop,
    closeScene,
    switchCamera,
    isRecording,
    isUploading,
    isSwitchingCamera,
    isSceneOpen,
    elapsedSeconds,
    maxDurationSeconds: MAX_VIDEO_NOTE_SECONDS,
    facingMode,
    previewVideoRef,
  };
}
