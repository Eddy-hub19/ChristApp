"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import {
  bookTitleFromFilename,
  formatBytes,
  toRawCloudinaryUrl,
  type BookFormat,
} from "@/lib/book/bookFile";
import { loadBookMeta } from "@/lib/book/bookMeta";
import type { BookMeta } from "@/lib/book/bookStore";
import styles from "./BookMessageBubble.module.scss";

const BookReader = dynamic(() => import("@/components/BookReader/BookReader"), { ssr: false });

type Props = {
  fileUrl: string;
  filename: string;
  format: BookFormat;
  /** Розмір із повідомлення (його записує сервер); без нього — з метаданих книги. */
  fileSize?: number | null;
};

export default function BookMessageBubble({ fileUrl, filename, format, fileSize }: Props) {
  const t = useTranslations("book");
  const url = toRawCloudinaryUrl(fileUrl);
  const rootRef = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);

  // Метадані й обкладинку тягнемо, лише коли пузир зʼявився в зоні видимості (і один раз — далі кеш).
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadBookMeta(url, format, filename).then((loaded) => {
          if (!cancelled) setMeta(loaded);
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [url, format, filename]);

  useEffect(() => {
    if (!meta?.cover) {
      setCoverSrc(null);
      return;
    }
    const objectUrl = URL.createObjectURL(meta.cover);
    setCoverSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [meta?.cover]);

  const title = meta?.title || bookTitleFromFilename(filename);
  const size = formatBytes(fileSize ?? meta?.size);
  const kind = format === "pdf" ? t("typePdf") : t("typeEpub");

  const open = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    setReaderOpen(true);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      {/* div[role=button], а не <button>: так довгий тап на пузирі все ще відкриває меню повідомлення. */}
      <div
        className={styles.card}
        role="button"
        tabIndex={0}
        aria-label={t("openBook", { title })}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open(event);
          }
        }}
      >
        <div className={styles.cover} data-format={format}>
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: обкладинка з кешу, next/image тут не потрібен
            <img src={coverSrc} alt="" className={styles.coverImage} draggable={false} />
          ) : (
            <span className={styles.coverPlaceholder} aria-hidden>
              📖
            </span>
          )}
        </div>
        <div className={styles.info}>
          <span className={styles.title}>{title}</span>
          {meta?.author ? <span className={styles.author}>{meta.author}</span> : null}
          <span className={styles.badges}>
            <span className={styles.kind}>{kind}</span>
            {size ? <span className={styles.size}>{size}</span> : null}
          </span>
        </div>
      </div>
      {readerOpen ? (
        <BookReader
          url={url}
          filename={filename}
          format={format}
          title={title}
          onClose={() => setReaderOpen(false)}
        />
      ) : null}
    </div>
  );
}
