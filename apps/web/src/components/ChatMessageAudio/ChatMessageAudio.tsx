"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getHttpApiBase } from "@/lib/apiBase";
import { type AudioTrack, usePlayer } from "@/providers/PlayerProvider";
import styles from "@/components/ChatMessageAudio/ChatMessageAudio.module.scss";

const LINK_REGEX =
  /(https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/watch\?[^\s]+|youtu\.be\/[^\s]+))/i;

/** Одна ссылка = один запрос за сессию (иначе каждый ререндер списка дёргал бы yt-dlp). */
const trackCache = new Map<string, Promise<AudioTrack | null>>();

function loadTrack(url: string): Promise<AudioTrack | null> {
  let pending = trackCache.get(url);
  if (!pending) {
    pending = apiFetch(`${getHttpApiBase()}/api/media/extract-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      timeoutMs: 45_000,
    })
      .then((res) => (res.ok ? (res.json() as Promise<AudioTrack>) : null))
      .catch(() => null);
    trackCache.set(url, pending);
    void pending.then((track) => {
      if (!track) trackCache.delete(url);
    });
  }
  return pending;
}

export default function ChatMessageAudio({ text }: { text: string }) {
  const { currentTrack, isPlaying, toggleTrack } = usePlayer();
  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [loading, setLoading] = useState(false);

  const matchedUrl = text.match(LINK_REGEX)?.[0];

  useEffect(() => {
    if (!matchedUrl) return;
    let cancelled = false;
    setLoading(true);
    void loadTrack(matchedUrl).then((data) => {
      if (cancelled) return;
      setTrack(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [matchedUrl]);

  if (!matchedUrl) return null;
  if (loading) return <div className={styles.loading}>Загрузка аудио…</div>;
  if (!track) return null;

  const active = currentTrack?.audioUrl === track.audioUrl && isPlaying;

  return (
    <div className={styles.card} data-bubble-control>
      <button
        type="button"
        className={styles.button}
        onClick={(event) => {
          event.stopPropagation();
          toggleTrack(track);
        }}
      >
        {active ? "Пауза" : "Слушать"}
      </button>
      <div className={styles.info}>
        <div className={styles.title}>{track.title}</div>
        {track.artist ? <div className={styles.artist}>{track.artist}</div> : null}
      </div>
    </div>
  );
}
