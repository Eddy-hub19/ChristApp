"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isOldTestamentBook } from "@/lib/bibleBooks";
import styles from "./BibleNavPanel.module.scss";

type NavBook = { id: string; name: string; chapters: number };

type Props = {
  books: NavBook[];
  currentBookId: string;
  currentChapter: number;
  onPick: (book: NavBook, chapter: number) => void;
};

/** Завіт → книги → глави. Одна панель і для бічної колонки на десктопі, і для листа на телефоні. */
export default function BibleNavPanel({ books, currentBookId, currentChapter, onPick }: Props) {
  const t = useTranslations("bibleSection");
  const [testament, setTestament] = useState<"old" | "new">(
    isOldTestamentBook(currentBookId) ? "old" : "new",
  );
  const [expandedId, setExpandedId] = useState(currentBookId);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setTestament(isOldTestamentBook(currentBookId) ? "old" : "new");
    setExpandedId(currentBookId);
  }, [currentBookId]);

  // Поточна книга потрапляє у видиму зону списку.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentBookId, testament]);

  const list = books.filter((b) => isOldTestamentBook(b.id) === (testament === "old"));

  return (
    <nav className={styles.panel} aria-label={t("navTitle")}>
      <div className={styles.tabs} role="tablist">
        {(["old", "new"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={testament === value}
            className={`${styles.tab} ${testament === value ? styles.tabActive : ""}`}
            onClick={() => setTestament(value)}
          >
            {value === "old" ? t("oldTestament") : t("newTestament")}
          </button>
        ))}
      </div>

      <ul className={styles.books}>
        {list.map((b) => {
          const open = expandedId === b.id;
          const active = b.id === currentBookId;
          return (
            <li key={b.id}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                className={`${styles.book} ${active ? styles.bookActive : ""}`}
                aria-expanded={open}
                onClick={() => setExpandedId(open ? "" : b.id)}
              >
                <span>{b.name}</span>
                <span aria-hidden className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>›</span>
              </button>
              {open && (
                <ul className={styles.chapters}>
                  {Array.from({ length: b.chapters }, (_, i) => i + 1).map((n) => (
                    <li key={n}>
                      <button
                        type="button"
                        className={`${styles.chapter} ${active && n === currentChapter ? styles.chapterActive : ""}`}
                        aria-label={t("chapterShort", { n })}
                        aria-current={active && n === currentChapter ? "true" : undefined}
                        onClick={() => onPick(b, n)}
                      >
                        {n}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
