"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import BibleSearchPanel, { type BibleBookItem } from "./BibleSearchPanel";
import { parseBibleReference } from "@/lib/bibleBooks";
import {
  clearBibleSearchHistory,
  pushBibleSearchHistory,
  readBibleSearchHistory,
  removeBibleSearchHistory,
} from "@/lib/bibleSearchHistory";
import styles from "./BibleSearchTab.module.scss";

type Props = {
  translation: string;
  ready: boolean;
  lang: string;
  books: BibleBookItem[];
  onOpen: (bookId: string, chapter: number, verse?: number, verseTo?: number) => void;
};

/** Вкладка «Пошук» у вікні вибору книги: поле, історія та результати. */
export default function BibleSearchTab({ translation, ready, lang, books, onOpen }: Props) {
  const t = useTranslations("bibleSection");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHistory(readBibleSearchHistory());
  }, []);

  const commit = (q: string) => setHistory(pushBibleSearchHistory(q));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    commit(q);
    const ref = parseBibleReference(q, books);
    if (ref) onOpen(ref.bookId, ref.chapter ?? 1, ref.verseFrom, ref.verseTo);
  };

  return (
    <div className={styles.tab}>
      <form className={styles.field} role="search" onSubmit={submit}>
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className={styles.clear}
            aria-label={t("clearSearch")}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </form>
      <BibleSearchPanel
        query={query}
        translation={translation}
        ready={ready}
        lang={lang}
        books={books}
        history={history}
        onPickQuery={(q) => {
          setQuery(q);
          inputRef.current?.focus();
        }}
        onRemoveHistory={(q) => setHistory(removeBibleSearchHistory(q))}
        onClearHistory={() => setHistory(clearBibleSearchHistory())}
        onCommit={commit}
        onOpen={onOpen}
      />
    </div>
  );
}
