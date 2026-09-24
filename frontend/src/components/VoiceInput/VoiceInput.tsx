"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import styles from "./VoiceInput.module.scss";
import { MAX_RECORDING_SECONDS } from "@/hooks/useVoiceRecorder";

type VoiceRecordingBarProps = {
  stream: MediaStream | null;
  seconds: number;
  /** Запис зафіксовано свайпом угору — тримати кнопку більше не треба. */
  isLocked: boolean;
  /** Палець уже за порогом скасування: підсвічуємо, що відпускання скасує запис. */
  isCancelArmed: boolean;
  /** 0..1 — наскільки далеко відведено палець убік (для плавного згасання підказки). */
  cancelProgress: number;
  onCancel: () => void;
  onSend: () => void;
};

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

type RecordingWaveformProps = {
  stream: MediaStream;
};

function RecordingWaveform({ stream }: RecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dimsRef = useRef({ w: 0, h: 32 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) {
        dimsRef.current = { w: rect.width, h: Math.max(rect.height, 24) };
      }
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let audioCtx: AudioContext;
    try {
      audioCtx = new AudioContext();
    } catch {
      return;
    }

    void audioCtx.resume().catch(() => undefined);

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -10;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      void audioCtx.close();
      return;
    }

    const barCount = 32;
    const step = Math.max(1, Math.floor(bufferLength / barCount));
    let lastW = 0;
    let lastH = 0;

    const draw = () => {
      if (!canvasRef.current) return;

      analyser.getByteFrequencyData(dataArray);

      const { w: rawW, h: rawH } = dimsRef.current;
      const w = rawW > 0 ? rawW : 200;
      const h = rawH > 0 ? rawH : 32;
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

      if (w < 4 || h < 4) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      if (Math.abs(w - lastW) > 0.5 || Math.abs(h - lastH) > 0.5) {
        lastW = w;
        lastH = h;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const accent = readCssVar("--accent", "#b8956a");
      const soft = readCssVar("--accent-soft", "rgba(180, 149, 106, 0.35)");

      context.clearRect(0, 0, w, h);

      const gap = 2;
      const barW = (w - gap * (barCount - 1)) / barCount;
      const mid = h * 0.5;

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[Math.min(i * step + j, bufferLength - 1)];
        }
        const norm = sum / step / 255;
        const barH = Math.max(3, norm * h * 0.88 + 2);
        const x = i * (barW + gap);
        const y = mid - barH * 0.5;

        const gradient = context.createLinearGradient(x, y + barH, x, y);
        gradient.addColorStop(0, soft);
        gradient.addColorStop(1, accent);

        context.fillStyle = gradient;
        context.globalAlpha = 0.4 + norm * 0.6;
        const radius = Math.min(3, barW * 0.45);
        context.beginPath();
        if (typeof context.roundRect === "function") {
          context.roundRect(x, y, barW, barH, radius);
        } else {
          context.rect(x, y, barW, barH);
        }
        context.fill();
      }
      context.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      void audioCtx.close().catch(() => undefined);
    };
  }, [stream]);

  return (
    <div ref={wrapRef} className={styles.waveCanvasWrap}>
      <canvas ref={canvasRef} className={styles.waveCanvas} aria-hidden />
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Панель активного запису (як у Telegram): таймер, індикатор, підказка «свайп щоб скасувати».
 * Самі жести живуть на кнопці мікрофона в `MessageInput` — сюди приходить уже готовий стан.
 */
export default function VoiceRecordingBar({
  stream,
  seconds,
  isLocked,
  isCancelArmed,
  cancelProgress,
  onCancel,
  onSend,
}: VoiceRecordingBarProps) {
  const t = useTranslations("chat");
  const remaining = Math.max(0, MAX_RECORDING_SECONDS - seconds);

  return (
    <div
      className={`${styles.recordingBar}${isCancelArmed ? ` ${styles.recordingBarCancelArmed}` : ""}`}
      role="status"
      aria-live="polite"
      aria-label={t("voiceRecordingAria")}
    >
      <span className={styles.recDot} aria-hidden />
      <span className={styles.timeElapsed}>{formatDuration(seconds)}</span>

      {stream ? <RecordingWaveform stream={stream} /> : null}

      {isLocked ? (
        <div className={styles.lockedActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            {t("voiceCancel")}
          </button>
          <button
            type="button"
            className={styles.sendButton}
            onClick={onSend}
            autoFocus
          >
            {t("voiceSend")}
          </button>
        </div>
      ) : (
        <span
          className={styles.slideHint}
          style={{ opacity: Math.max(0, 1 - cancelProgress) }}
        >
          {isCancelArmed ? t("voiceReleaseToCancel") : t("voiceSlideToCancel")}
        </span>
      )}

      {!isLocked && remaining <= 10 ? (
        <span className={styles.timeRemaining}>
          {formatDuration(remaining)}
        </span>
      ) : null}
    </div>
  );
}
