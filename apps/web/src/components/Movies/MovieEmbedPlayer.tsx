"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MOVIE_EMBED_SERVERS, type MovieEmbedServer } from "@/lib/movieEmbedServers";
import type { EmbedStatusResponse } from "@/lib/movieEmbedStatus";
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
 * Стан скидається remount-ом: батько віддає `key={tmdbId}`.
 */
const LOAD_TIMEOUT_MS = 15_000;

export default function MovieEmbedPlayer({ tmdbId, imdbId, title, servers = MOVIE_EMBED_SERVERS }: Props) {
  const t = useTranslations("movies");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userPicked, setUserPicked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const [downIds, setDownIds] = useState<ReadonlySet<string>>(new Set());

  // Серверна перевірка: які балансери зараз відповідають. Помилка перевірки не критична.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/movies/embed-status?tmdbId=${tmdbId}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<EmbedStatusResponse>) : null))
      .then((data) => {
        if (!data) return;
        const down = new Set(data.servers.filter((s) => !s.ok).map((s) => s.id));
        // Якщо «впали» всі — перевірка, найімовірніше, хибна (наш хост ≠ мережа користувача): нічого не ховаємо
        if (down.size < servers.length) setDownIds(down);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tmdbId, servers.length]);

  // Живі — першими, збережений відносний порядок
  const ordered = useMemo(
    () => [...servers].sort((a, b) => Number(downIds.has(a.id)) - Number(downIds.has(b.id))),
    [servers, downIds],
  );

  const server = ordered.find((s) => s.id === selectedId) ?? ordered[0];
  const allFailed = servers.length > 0 && failedIds.size >= servers.length;

  // Поки користувач сам не обирав — слідуємо за найкращим сервером (після відповіді перевірки може змінитись)
  const activeId = userPicked ? server?.id : ordered[0]?.id;
  const active = ordered.find((s) => s.id === activeId) ?? server;

  const select = (id: string, byUser: boolean) => {
    setSelectedId(id);
    if (byUser) setUserPicked(true);
    setLoaded(false);
  };

  // Автоперемикання, якщо iframe не завантажився вчасно
  useEffect(() => {
    if (loaded || !active || allFailed) return;
    const timer = window.setTimeout(() => {
      setFailedIds((prev) => new Set(prev).add(active.id));
      const next = ordered.find((s) => s.id !== active.id && !failedIds.has(s.id));
      if (next) select(next.id, true);
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, active, ordered, failedIds, allFailed]);

  if (!active) return null;
  // Cloudflare-401/челендж усередині iframe все одно дає `onLoad`, тож відрізнити його від робочого
  // плеєра неможливо — тому перемикання на наступний сервер завжди під рукою, а не лише після таймауту.
  const nextServer = ordered[(ordered.findIndex((s) => s.id === active.id) + 1) % ordered.length];
  const hasOtherServer = ordered.length > 1;
  const src = active.buildUrl({ tmdbId, imdbId });

  return (
    <div className={styles.playerBlock}>
      <div className={styles.serverTabs} role="tablist" aria-label={t("servers")}>
        {ordered.map((s, index) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active.id}
            className={`${styles.serverTab} ${s.id === active.id ? styles.serverTabActive : ""} ${
              downIds.has(s.id) ? styles.serverTabDown : ""
            }`}
            title={downIds.has(s.id) ? t("serverDown") : undefined}
            onClick={() => select(s.id, true)}
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
      <p className={styles.playerHint}>
        {t("playerHint")}{" "}
        {hasOtherServer ? (
          <button type="button" className={styles.playerNextButton} onClick={() => select(nextServer.id, true)}>
            {t("tryNextServer")}
          </button>
        ) : null}
      </p>
    </div>
  );
}
