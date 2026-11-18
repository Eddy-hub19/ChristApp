"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { WatchProvider } from "@/lib/watchSync";
import styles from "./CinemaHall.module.scss";

type ManualStageProps = {
  /** Сюди доходять лише IFRAME (сервер визнав вбудовуваним) і MANUAL (ні, або перевірку не вдалося провести). */
  provider: Extract<WatchProvider, "IFRAME" | "MANUAL">;
  /** Для IFRAME/MANUAL videoId зберігає повний URL, не id. */
  url: string;
  title: string | null;
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Показ джерела без програмного керування. IFRAME: сервер уже перевірив (X-Frame-Options/CSP),
 * що сторінка дозволяє вбудовування — але ту перевірку неможливо гарантувати назавжди (сайт міг
 * змінити заголовки, чи браузер по-своєму трактує CSP), а cross-origin iframe не дає жодної
 * надійної JS-події на "заблоковано" — тож поруч завжди є посилання "Відкрити" як запасний варіант,
 * а не лише після таймауту. MANUAL: сервер уже вирішив, що вбудувати не вдасться (або перевірку не
 * вдалося провести) — одразу картка з посиланням, без спроби iframe.
 */
export default function ManualStage({ provider, url, title }: ManualStageProps) {
  const t = useTranslations("cinema.hall");
  const hostname = title ?? hostnameOf(url) ?? url;

  if (provider === "MANUAL") {
    return (
      <div className={styles.manualPreviewCard}>
        <span className={styles.manualPreviewHost}>{hostname}</span>
        <p className={styles.manualPreviewHint}>{t("manualNotEmbeddable")}</p>
        <a href={url} target="_blank" rel="noreferrer" className={styles.manualOpenButton}>
          <ExternalLink size={15} aria-hidden /> {t("manualOpen")}
        </a>
      </div>
    );
  }

  return (
    <div className={styles.iframeStageWrap}>
      <iframe
        src={url}
        className={styles.iframeStage}
        allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        title={hostname}
      />
      <a href={url} target="_blank" rel="noreferrer" className={styles.iframeFallbackLink}>
        <ExternalLink size={12} aria-hidden /> {t("manualOpenFallback")}
      </a>
    </div>
  );
}
