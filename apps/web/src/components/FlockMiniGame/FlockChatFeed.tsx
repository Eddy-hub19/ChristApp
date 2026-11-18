"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { phraseById, type PhraseLang } from "./flockPhrases";
import styles from "./FlockChatFeed.module.scss";

/** Одне повідомлення стрічки: id готової фрази (phrase > 0) або свій текст; team - колір ніка в «Замках». */
export interface FeedItem {
  id: number;
  pid: number;
  name: string;
  team: number;
  phrase: number;
  text?: string;
  at: number;
}

/** Скільки останніх повідомлень тримає клієнт. */
export const FEED_MAX = 30;
const COLLAPSED_KEY = "christapp:flockFeedCollapsed";
const TICK_MS = 5000;

/** Ник у стрічці - не більше NAME_MAX символів (з «…»). */
const NAME_MAX = 4;
const shortName = (name: string) => {
  const chars = Array.from(name);
  return chars.length > NAME_MAX ? `${chars.slice(0, NAME_MAX).join("")}…` : name;
};

type Props = {
  items: FeedItem[];
  selfPid: number;
  lang: PhraseLang;
  /** «Ховати чужі фрази»: чужі повідомлення в стрічці теж ховаються. */
  hideOthers: boolean;
};

/**
 * Сворачиваемая стрічка повідомлень арени під індикаторами бонусів: згорнута - «Чат» з лічильником нових, розгорнута -
 * останні повідомлення (ник, текст, час), що прокручуються. Стан згортання - у localStorage (за замовчуванням згорнута).
 */
export default function FlockChatFeed({ items, selfPid, lang, hideOthers }: Props) {
  const t = useTranslations("flock.feed");
  const [collapsed, setCollapsed] = useState(true);
  const [seen, setSeen] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) !== "0");
    } catch {
      /* сховище недоступне - лишається згорнутою */
    }
  }, []);

  const shown = hideOthers ? items.filter((m) => m.pid === selfPid) : items;
  const lastId = shown.length ? shown[shown.length - 1].id : 0;

  // відкрита стрічка вважає все прочитаним; час у підписах оновлюється рідко
  useEffect(() => {
    if (!collapsed) setSeen(lastId);
  }, [collapsed, lastId]);
  useEffect(() => {
    if (collapsed) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [collapsed]);
  // відкрили - одразу до останніх повідомлень; нове повідомлення - донизу, якщо користувач і так біля кінця
  const stickRef = useRef(true);
  useEffect(() => {
    if (collapsed) stickRef.current = true;
  }, [collapsed]);
  useEffect(() => {
    const el = listRef.current;
    if (!el || collapsed) return;
    if (stickRef.current || el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
    stickRef.current = false;
  }, [lastId, collapsed]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? "0" : "1");
      } catch {
        /* не критично */
      }
      if (prev) setNow(Date.now());
      return !prev;
    });
  }, []);

  const unread = collapsed ? shown.filter((m) => m.id > seen && m.pid !== selfPid).length : 0;
  const ago = (at: number) => {
    const s = Math.max(0, Math.round((now - at) / 1000));
    return s < 60 ? t("sec", { n: Math.max(1, s) }) : t("min", { n: Math.floor(s / 60) });
  };

  return (
    <section className={styles.feed} aria-label={t("title")}>
      <button type="button" className={styles.head} aria-expanded={!collapsed} onClick={toggle} title={t("toggle")}>
        <MessageCircle size={14} aria-hidden />
        <span className={styles.title}>{t("title")}</span>
        {unread > 0 ? (
          <span className={styles.badge} aria-label={t("unread", { n: unread })}>
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
        <ChevronDown size={14} aria-hidden className={`${styles.chevron} ${collapsed ? "" : styles.chevronOpen}`} />
      </button>
      {collapsed ? null : (
        <ul ref={listRef} className={styles.list} aria-live="polite">
          {shown.length === 0 ? <li className={styles.empty}>{t("empty")}</li> : null}
          {shown.map((m) => {
            const body = m.phrase > 0 ? (phraseById(m.phrase)?.text[lang] ?? "") : (m.text ?? "");
            const own = m.pid === selfPid;
            return (
              <li key={m.id} className={`${styles.row} ${own ? styles.own : ""}`}>
                <span className={`${styles.name} ${m.team === 1 ? styles.teamSheep : m.team === 2 ? styles.teamWolf : ""}`} title={m.name}>{shortName(m.name)}</span>
                <span className={styles.text}>{body}</span>
                <span className={styles.time}>{ago(m.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
