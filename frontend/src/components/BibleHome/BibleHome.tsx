"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import BibleSearchPanel from "@/components/BibleSearch/BibleSearchPanel";
import { useBibleTranslation } from "@/hooks/useBibleTranslation";
import { BIBLE_BOOKS, bookDisplayName, parseBibleReference } from "@/lib/bibleBooks";
import { bibleReaderHref } from "@/lib/bibleSearchApi";
import {
  clearBibleSearchHistory,
  pushBibleSearchHistory,
  readBibleSearchHistory,
  removeBibleSearchHistory,
} from "@/lib/bibleSearchHistory";
import { BIBLE_LAST_READ_STORAGE_KEY, type BibleLastRead } from "@/lib/bibleReadingProgress";
import styles from "./BibleHome.module.scss";

function readLastRead(): BibleLastRead | null {
  try {
    const raw = window.localStorage.getItem(BIBLE_LAST_READ_STORAGE_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<BibleLastRead>) : null;
    return p?.bookId && typeof p.chapter === "number"
      ? { bookId: String(p.bookId), chapter: p.chapter, bookName: p.bookName }
      : null;
  } catch {
    return null;
  }
}

export default function BibleHome() {
  const t = useTranslations("bibleSection");
  const router = useRouter();
  const params = useSearchParams();
  const { lang, translation, ready, books } = useBibleTranslation();

  const bookParam = params.get("book");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [lastRead, setLastRead] = useState<BibleLastRead | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHistory(readBibleSearchHistory());
    setLastRead(readLastRead());
  }, []);

  useEffect(() => {
    if (params.get("search") === "1") inputRef.current?.focus();
  }, [params]);

  const nameOf = useMemo(() => {
    const map = new Map(books.map((b) => [b.id, b.name]));
    return (id: string) => map.get(id) ?? bookDisplayName(id, lang);
  }, [books, lang]);

  const searchOpen = focused || query.trim().length > 0;

  const commit = useCallback((q: string) => setHistory(pushBibleSearchHistory(q)), []);

  const closeSearch = () => {
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const ref = parseBibleReference(q, books);
    if (ref?.chapter !== undefined) {
      commit(q);
      router.push(bibleReaderHref(ref.bookId, ref.chapter, ref.verseFrom, ref.verseTo));
    } else if (ref) {
      commit(q);
      router.push(`/bible?book=${ref.bookId}`);
      closeSearch();
    } else {
      commit(q);
    }
  };

  const selectedBook = bookParam ? BIBLE_BOOKS.find((b) => b.id === bookParam) : null;
  const apiBook = selectedBook ? books.find((b) => b.id === selectedBook.id) : undefined;

  const grid = (testament: "old" | "new") => (
    <section className={styles.testament} aria-labelledby={`bible-${testament}`}>
      <h2 id={`bible-${testament}`} className={styles.testamentTitle}>
        {testament === "old" ? t("oldTestament") : t("newTestament")}
      </h2>
      <ul className={styles.bookGrid}>
        {BIBLE_BOOKS.filter((b) => b.testament === testament).map((b) => (
          <li key={b.id}>
            <Link className={styles.bookCard} href={`/bible?book=${b.id}`} scroll={false}>
              {nameOf(b.id)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className={styles.home}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("title")}</h1>
        </header>

        <form className={styles.searchRow} role="search" onSubmit={submit}>
          <div className={styles.searchField}>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              className={styles.searchInput}
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
              onFocus={() => setFocused(true)}
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
          </div>
          {searchOpen && (
            <button type="button" className={styles.cancel} onClick={closeSearch}>
              {t("back")}
            </button>
          )}
        </form>

        {searchOpen ? (
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
          />
        ) : selectedBook ? (
          <section className={styles.chapters}>
            <Link className={styles.backLink} href="/bible" scroll={false}>
              ← {t("backToBooks")}
            </Link>
            <h2 className={styles.bookTitle}>{nameOf(selectedBook.id)}</h2>
            {apiBook ? (
              <ul className={styles.chapterGrid}>
                {Array.from({ length: apiBook.chapters }, (_, i) => i + 1).map((n) => (
                  <li key={n}>
                    <Link
                      className={styles.chapterCell}
                      href={bibleReaderHref(selectedBook.id, n)}
                      aria-label={t("chapterShort", { n })}
                    >
                      {n}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.skeletonGrid} aria-hidden />
            )}
          </section>
        ) : (
          <>
            {lastRead && BIBLE_BOOKS.some((b) => b.id === lastRead.bookId) && (
              <Link
                className={styles.continueCard}
                href={bibleReaderHref(lastRead.bookId, lastRead.chapter)}
              >
                <span className={styles.continueLabel}>{t("continueReading")}</span>
                <span className={styles.continueValue}>
                  {nameOf(lastRead.bookId)} · {t("chapterShort", { n: lastRead.chapter })}
                </span>
              </Link>
            )}
            <div className={styles.testaments}>
              {grid("old")}
              {grid("new")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
