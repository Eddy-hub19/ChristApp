"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { BIBLE_BOOKS, bookDisplayName, parseBibleReference } from "@/lib/bibleBooks";
import {
  BIBLE_SEARCH_MIN_LENGTH,
  highlightSegments,
  isSearchable,
  parseSearchQuery,
} from "@/lib/bibleSearchCore";
import { bibleReaderHref, fetchBibleSearch } from "@/lib/bibleSearchApi";
import type { BibleSearchScope } from "@/lib/bibleSearchTypes";
import type { BibleBookItem } from "@/hooks/useBibleTranslation";
import styles from "./BibleSearchPanel.module.scss";

type Props = {
  query: string;
  translation: string;
  ready: boolean;
  lang: string;
  books: BibleBookItem[];
  history: string[];
  onPickQuery: (q: string) => void;
  onRemoveHistory: (q: string) => void;
  onClearHistory: () => void;
  /** Користувач відкрив результат/посилання — запит варто запам'ятати. */
  onCommit: (q: string) => void;
};

const EXAMPLES = {
  ua: { ref: "Ін 3:16", words: "не бійся", phrase: "\"Бог є любов\"" },
  ru: { ref: "Ин 3:16", words: "не бойся", phrase: "\"Бог есть любовь\"" },
  en: { ref: "John 3:16", words: "fear not", phrase: "\"God is love\"" },
} as const;

export default function BibleSearchPanel({
  query,
  translation,
  ready,
  lang,
  books,
  history,
  onPickQuery,
  onRemoveHistory,
  onClearHistory,
  onCommit,
}: Props) {
  const t = useTranslations("bibleSection");
  const [scopeState, setScopeState] = useState<{ key: string; value: BibleSearchScope }>({
    key: "",
    value: "all",
  });

  const trimmed = query.trim();
  const reference = useMemo(
    () => (trimmed ? parseBibleReference(trimmed, books) : null),
    [trimmed, books],
  );
  const refWithChapter = reference?.chapter !== undefined ? reference : null;

  // Debounce, щоб не слати запит на кожну літеру.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(trimmed), 300);
    return () => window.clearTimeout(id);
  }, [trimmed]);

  // Фільтр скидається разом із запитом/перекладом.
  const scopeKey = `${translation}\u0000${debounced}`;
  const scope: BibleSearchScope = scopeState.key === scopeKey ? scopeState.value : "all";
  const setScope = (value: BibleSearchScope) => setScopeState({ key: scopeKey, value });

  const wordSearchOn =
    ready && !refWithChapter && isSearchable(debounced) && debounced === trimmed;

  const search = useInfiniteQuery({
    queryKey: ["bible", "search", translation, debounced, scope],
    queryFn: ({ pageParam, signal }) =>
      fetchBibleSearch({ translation, q: debounced, scope, offset: pageParam, signal }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: wordSearchOn,
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = search;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const nameOf = useMemo(() => {
    const map = new Map(books.map((b) => [b.id, b.name]));
    return (id: string) => map.get(id) ?? bookDisplayName(id, lang);
  }, [books, lang]);

  const parsed = useMemo(() => parseSearchQuery(debounced), [debounced]);
  const first = search.data?.pages[0];
  const facets = first?.facets ?? {};
  const results = search.data?.pages.flatMap((p) => p.results) ?? [];

  const facetBooks = BIBLE_BOOKS.filter((b) => facets[b.id]);

  /* ===== Порожній стан ===== */
  if (!trimmed) {
    const ex = EXAMPLES[(lang as keyof typeof EXAMPLES) in EXAMPLES ? (lang as keyof typeof EXAMPLES) : "ru"];
    return (
      <div className={styles.panel}>
        {history.length > 0 && (
          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h2>{t("recent")}</h2>
              <button type="button" className={styles.linkBtn} onClick={onClearHistory}>
                {t("clearHistory")}
              </button>
            </div>
            <ul className={styles.chips}>
              {history.map((h) => (
                <li key={h} className={styles.chipWrap}>
                  <button type="button" className={styles.chip} onClick={() => onPickQuery(h)}>
                    {h}
                  </button>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={t("removeFromHistory")}
                    onClick={() => onRemoveHistory(h)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className={styles.block}>
          <h2>{t("examplesTitle")}</h2>
          <p className={styles.hint}>{t("emptyHint")}</p>
          <ul className={styles.examples}>
            {[
              [t("exampleRef"), ex.ref],
              [t("exampleWords"), ex.words],
              [t("examplePhrase"), ex.phrase],
            ].map(([label, value]) => (
              <li key={label}>
                <button type="button" className={styles.example} onClick={() => onPickQuery(value)}>
                  <span className={styles.exampleLabel}>{label}</span>
                  <span className={styles.exampleValue}>{value}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  /* ===== Посилання з главою — відкриваємо одразу (Enter) або тапом ===== */
  if (refWithChapter) {
    const label = `${nameOf(refWithChapter.bookId)} ${refWithChapter.chapter}${
      refWithChapter.verseFrom
        ? `:${refWithChapter.verseFrom}${refWithChapter.verseTo ? `–${refWithChapter.verseTo}` : ""}`
        : ""
    }`;
    return (
      <div className={styles.panel}>
        <Link
          className={styles.refCard}
          href={bibleReaderHref(
            refWithChapter.bookId,
            refWithChapter.chapter ?? 1,
            refWithChapter.verseFrom,
            refWithChapter.verseTo,
          )}
          onClick={() => onCommit(trimmed)}
        >
          <span className={styles.refLabel}>{t("openReference", { ref: label })}</span>
          <span aria-hidden className={styles.refArrow}>→</span>
        </Link>
      </div>
    );
  }

  const tooShort = !isSearchable(trimmed);

  return (
    <div className={styles.panel}>
      {reference && (
        <Link
          className={styles.refCard}
          href={`/bible?book=${reference.bookId}`}
          onClick={() => onCommit(trimmed)}
        >
          <span className={styles.refLabel}>
            {t("openBook", { book: nameOf(reference.bookId) })}
          </span>
          <span aria-hidden className={styles.refArrow}>→</span>
        </Link>
      )}

      {tooShort ? (
        <p className={styles.hint} role="status">
          {t("tooShort", { min: BIBLE_SEARCH_MIN_LENGTH })}
        </p>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label={t("searchLabel")}>
            {(
              [
                ["all", t("filterAll")],
                ["ot", t("filterOld")],
                ["nt", t("filterNew")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`${styles.filter} ${scope === value ? styles.filterActive : ""}`}
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
              >
                {label}
              </button>
            ))}
            {facetBooks.length > 0 && (
              <select
                className={`${styles.filter} ${styles.filterSelect} ${
                  scope !== "all" && scope !== "ot" && scope !== "nt" ? styles.filterActive : ""
                }`}
                aria-label={t("filterBook")}
                value={scope !== "all" && scope !== "ot" && scope !== "nt" ? scope : ""}
                onChange={(e) => setScope(e.target.value || "all")}
              >
                <option value="">{t("filterBookAny")}</option>
                {facetBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {nameOf(b.id)} ({facets[b.id]})
                  </option>
                ))}
              </select>
            )}
          </div>

          {search.isError && !first ? (
            <div className={styles.state} role="alert">
              <p>{t("searchError")}</p>
              <button type="button" className={styles.linkBtn} onClick={() => void search.refetch()}>
                {t("retry")}
              </button>
            </div>
          ) : !first ? (
            <p className={styles.hint} role="status">{t("searching")}</p>
          ) : first.total === 0 ? (
            <p className={styles.hint} role="status">{t("noResults", { query: trimmed })}</p>
          ) : (
            <>
              <p className={styles.count} role="status">{t("found", { count: first.total })}</p>
              <ol className={styles.results}>
                {results.map((hit, i) => {
                  const newGroup = i === 0 || results[i - 1].bookId !== hit.bookId;
                  return (
                    <li key={`${hit.bookId}-${hit.chapter}-${hit.verse}`}>
                      {newGroup && (
                        <h3 className={styles.group}>
                          {nameOf(hit.bookId)}
                          <span className={styles.groupCount}>{facets[hit.bookId]}</span>
                        </h3>
                      )}
                      <Link
                        className={styles.hit}
                        href={bibleReaderHref(hit.bookId, hit.chapter, hit.verse)}
                        onClick={() => onCommit(trimmed)}
                      >
                        <span className={styles.hitRef}>
                          {nameOf(hit.bookId)} {hit.chapter}:{hit.verse}
                        </span>
                        <span className={styles.hitText}>
                          {highlightSegments(hit.text, parsed).map((seg, j) =>
                            seg.hit ? <mark key={j}>{seg.text}</mark> : <span key={j}>{seg.text}</span>,
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              {hasNextPage && (
                <div ref={sentinelRef} className={styles.more}>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage ? t("searching") : t("loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
