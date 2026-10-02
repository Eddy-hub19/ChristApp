"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Check, CheckCheck, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Message } from "@/types/message";
import { apiFetch } from "@/lib/apiFetch";
import { getAuthToken } from "@/lib/auth";
import { getHttpApiBase } from "@/lib/apiBase";
import { playableVoiceUrl } from "@/lib/chatMedia";
import {
  VOICE_RATES,
  cycleVoiceRate,
  getVoicePlaybackState,
  registerVoice,
  seekVoice,
  subscribeVoicePlayback,
  toggleVoice,
  type VoiceSource,
} from "@/lib/voicePlayback";
import styles from "./VoiceMessageBubble.module.scss";

type VoiceMessageComponentProps = {
  username: string;
  src: string;
  isOwn: boolean;
  message: Message;
  currentUserId?: string;
  hideSenderName?: boolean;
  compactSenderLabel?: string;
};

const BAR_COUNT = 36;

function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Детерміновані "піки" з id повідомлення: вигляд волни стабільний між перемальовуваннями. */
function waveformBars(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const rand = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    bars.push(0.25 + rand * 0.75);
  }
  return bars;
}

function markListened(messageId: string) {
  const token = getAuthToken();
  if (!token) return;
  void apiFetch(`${getHttpApiBase()}/messages/voice/${messageId}/listen`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

export default function VoiceMessageBubble({
  username,
  src,
  isOwn,
  message,
  currentUserId,
  hideSenderName = false,
  compactSenderLabel,
}: VoiceMessageComponentProps) {
  const t = useTranslations("chat");
  const rootRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const markedRef = useRef(false);

  const playback = useSyncExternalStore(
    subscribeVoicePlayback,
    getVoicePlaybackState,
    getVoicePlaybackState,
  );
  const isActive = playback.activeId === message.id;
  const isPlaying = isActive && playback.playing;

  const listened = Boolean(
    currentUserId && message.voiceListenedBy?.includes(currentUserId),
  );
  const listenedByOthers = Boolean(
    message.voiceListenedBy?.some((id) => id !== message.senderId),
  );

  const source = useMemo<VoiceSource>(
    () => ({
      id: message.id,
      urls: Array.from(new Set([playableVoiceUrl(src), src])),
      senderId: message.senderId,
      element: () => rootRef.current,
      title: `${username} — ${t("voiceLabel")}`,
      onStarted: () => {
        if (!isOwn && !markedRef.current) {
          markedRef.current = true;
          markListened(message.id);
        }
      },
    }),
    [isOwn, message.id, message.senderId, src, t, username],
  );

  useEffect(() => registerVoice(source), [source]);

  const knownDuration = message.voiceDuration ?? 0;
  const duration = isActive && playback.duration ? playback.duration : knownDuration;
  const currentTime = isActive ? playback.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const rate = isActive ? playback.rate : 1;
  const bars = useMemo(() => waveformBars(message.id), [message.id]);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const wave = waveRef.current;
      if (!wave || !duration) return;
      const rect = wave.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      seekVoice(source, fraction * duration);
    },
    [duration, source],
  );

  const draggingRef = useRef(false);

  return (
    <div
      ref={rootRef}
      className={`${styles.voiceMessage} ${isOwn ? styles.voiceMessageOwn : ""}`}
      data-bubble-control
    >
      {compactSenderLabel ? (
        <p className={styles.voiceCompactSender}>{compactSenderLabel}</p>
      ) : null}
      {!hideSenderName ? (
        <p className={styles.voiceUsername}>
          {username}
          <span className={styles.voiceKind}>— {t("voiceLabel")}</span>
        </p>
      ) : null}
      <div className={styles.voiceRow}>
        <button
          type="button"
          className={styles.playButton}
          onClick={() => toggleVoice(source)}
          aria-label={isPlaying ? t("voicePause") : t("voicePlay")}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>

        <div className={styles.voiceBody}>
          <div
            ref={waveRef}
            className={styles.waveform}
            role="slider"
            tabIndex={0}
            aria-label={t("voiceSeekAria")}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            onPointerDown={(event) => {
              draggingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromPointer(event.clientX);
            }}
            onPointerMove={(event) => {
              if (draggingRef.current) seekFromPointer(event.clientX);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (!duration) return;
              if (event.key === "ArrowRight") seekVoice(source, Math.min(duration, currentTime + 5));
              if (event.key === "ArrowLeft") seekVoice(source, Math.max(0, currentTime - 5));
            }}
          >
            {bars.map((height, index) => (
              <span
                key={index}
                className={`${styles.bar} ${(index + 0.5) / BAR_COUNT <= progress ? styles.barPlayed : ""}`}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            ))}
          </div>
          <div className={styles.metaRow}>
            <span className={styles.time}>
              {isActive && currentTime > 0
                ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
                : formatDuration(duration)}
            </span>
            {!isOwn && !listened ? (
              <span className={styles.unlistenedDot} aria-label={t("voiceUnlistened")} />
            ) : null}
            {isOwn ? (
              <span
                className={styles.listenedMark}
                title={listenedByOthers ? t("voiceListened") : t("voiceNotListened")}
                aria-label={listenedByOthers ? t("voiceListened") : t("voiceNotListened")}
              >
                {listenedByOthers ? <CheckCheck size={14} /> : <Check size={14} />}
              </span>
            ) : null}
            <button
              type="button"
              className={styles.rateButton}
              onClick={() => cycleVoiceRate()}
              aria-label={t("voiceSpeedAria")}
              hidden={!isActive}
            >
              {rate}×
            </button>
          </div>
        </div>
      </div>
      {isActive && playback.error ? (
        <p className={styles.voiceError}>{t("voiceLoadError")}</p>
      ) : null}
    </div>
  );
}

export { VOICE_RATES };
