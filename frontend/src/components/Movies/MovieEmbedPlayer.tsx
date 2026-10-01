"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MOVIE_EMBED_SERVERS, type MovieEmbedServer } from "@/lib/movieEmbedServers";
import styles from "./Movies.module.scss";

interface Props {
  tmdbId: number;
  imdbId?: string | null;
  title: string;
  servers?: readonly MovieEmbedServer[];
}

/**
 * Cross-origin iframe не повідомляє про помилки — доступний лише `onLoad`.
 * Якщо він не спрацював за цей час, вважаємо сервер недоступним і пробуємо наступний.
 */
const LOAD_TIMEOUT_MS = 15_000;

export default function MovieEmbedPlayer({ tmdbId, imdbId, title, servers = MOVIE_EMBED_SERVERS }: Props) {
  const t = useTranslations("movies");
  const [serverIndex, setServerIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());

  const server = servers[serverIndex];
  const allFailed = servers.length > 0 && failedIds.size >= servers.length;

  const selectServer = useCallback((index: number) => {
    setServerIndex(index);
    setLoaded(false);
  }, []);

  // Автоперемикання, якщо iframe не завантажився вчасно
  useEffect(() => {
    if (loaded || !server || allFailed) return;
    const timer = window.setTimeout(() => {
      setFailedIds((prev) => new Set(prev).add(server.id));
      const next = servers.findIndex((s, i) => i !== serverIndex && !failedIds.has(s.id));
      if (next !== -1) selectServer(next);
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, server, serverIndex, servers, failedIds, allFailed, selectServer]);

  if (!server) return null;
  const src = server.buildUrl({ tmdbId, imdbId });

  return (
    <div className={styles.playerBlock}>
      <div className={styles.serverTabs} role="tablist" aria-label={t("servers")}>
        {servers.map((s, index) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={index === serverIndex}
            className={`${styles.serverTab} ${index === serverIndex ? styles.serverTabActive : ""}`}
            onClick={() => selectServer(index)}
          >
            {t("server", { n: index + 1 })} · {s.label}
          </button>
        ))}
      </div>

      <div className={styles.playerFrame}>
        {!loaded && (
          <div className={styles.playerLoader} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden />
            <span>{allFailed ? t("playerUnavailable") : t("playerLoading")}</span>
          </div>
        )}
        {/* key: при зміні сервера iframe перемонтується, а не лишає стару історію навігації */}
        <iframe
          key={src}
          src={src}
          title={title}
          className={styles.playerIframe}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
          onLoad={() => setLoaded(true)}
        />
      </div>
      <p className={styles.playerHint}>{t("playerHint")}</p>
    </div>
  );
}
