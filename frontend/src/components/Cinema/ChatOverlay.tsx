"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  addCard,
  cardFromMessage,
  editCard,
  isFading,
  pruneCards,
  removeCard,
  type OverlayCard,
} from "@/lib/chatOverlay";
import { isSystemMessage, systemMessageText } from "@/lib/watchSystemMessage";
import type { HallMember, HallMessageEvent } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

const TICK_MS = 200;

type ChatOverlayProps = {
  subscribe: (listener: (event: HallMessageEvent) => void) => () => void;
  /** Показувати лише у fullscreen і коли користувач не вимкнув 💬. Поки неактивний — не підписаний, тож
   *  повідомлення, що прийшли раніше, не спливають пачкою при вході. */
  active: boolean;
  /** Потрібні, щоб підписати службові рядки ("… керування переходить до Х"). */
  members: HallMember[];
};

/** Картки нових повідомлень чату зали зліва внизу поверх відео. Тільки перегляд: без вводу й дотиків. */
export default function ChatOverlay({ subscribe, active, members }: ChatOverlayProps) {
  const t = useTranslations("cinema.hall");
  const membersRef = useRef(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);
  const [cards, setCards] = useState<OverlayCard[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const hasCards = cards.length > 0;

  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribe((event) => {
      const at = Date.now();
      setNow(at);
      setCards((prev) => {
        if (event.type === "new") {
          if (isSystemMessage(event.message)) {
            // Службовий рядок: коротка сіра картка без імені (ім'я вже в тексті).
            const text = systemMessageText(t, event.message, membersRef.current);
            if (!text) return prev;
            const card = { ...cardFromMessage({ ...event.message, content: text, replyTo: null }, at), name: "", system: true };
            return addCard(prev, card, at);
          }
          return addCard(prev, cardFromMessage(event.message, at), at);
        }
        if (event.type === "edited") return editCard(prev, event.messageId, event.content);
        return removeCard(prev, event.messageId, at);
      });
    });
    return () => {
      unsubscribe();
      setCards([]);
    };
  }, [active, subscribe, t]);

  useEffect(() => {
    if (!active || !hasCards) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      setCards((prev) => pruneCards(prev, at));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, hasCards]);

  if (!active) return null;

  return (
    <div className={styles.chatOverlay} aria-hidden>
      {cards.map((card) => (
        <div
          key={card.id}
          className={`${styles.chatOverlayCard} ${card.system ? styles.chatOverlayCardSystem : ""} ${isFading(card, now) ? styles.chatOverlayCardLeaving : ""}`}
        >
          {card.name ? <span className={styles.chatOverlayName}>{card.name}</span> : null}
          <span className={styles.chatOverlayText}>
            {card.replyName ? <span className={styles.chatOverlayReply}>↩ {card.replyName} </span> : null}
            {card.text}
          </span>
        </div>
      ))}
    </div>
  );
}
