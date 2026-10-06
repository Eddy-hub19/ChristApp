"use client";

import { useEffect, useState } from "react";
import {
  addCard,
  cardFromMessage,
  editCard,
  isFading,
  pruneCards,
  removeCard,
  type OverlayCard,
} from "@/lib/chatOverlay";
import type { HallMessageEvent } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

const TICK_MS = 200;

type ChatOverlayProps = {
  subscribe: (listener: (event: HallMessageEvent) => void) => () => void;
  /** Показувати лише у fullscreen і коли користувач не вимкнув 💬. Поки неактивний — не підписаний, тож
   *  повідомлення, що прийшли раніше, не спливають пачкою при вході. */
  active: boolean;
};

/** Картки нових повідомлень чату зали зліва внизу поверх відео. Тільки перегляд: без вводу й дотиків. */
export default function ChatOverlay({ subscribe, active }: ChatOverlayProps) {
  const [cards, setCards] = useState<OverlayCard[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const hasCards = cards.length > 0;

  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribe((event) => {
      const at = Date.now();
      setNow(at);
      setCards((prev) => {
        if (event.type === "new") return addCard(prev, cardFromMessage(event.message, at), at);
        if (event.type === "edited") return editCard(prev, event.messageId, event.content);
        return removeCard(prev, event.messageId, at);
      });
    });
    return () => {
      unsubscribe();
      setCards([]);
    };
  }, [active, subscribe]);

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
          className={`${styles.chatOverlayCard} ${isFading(card, now) ? styles.chatOverlayCardLeaving : ""}`}
        >
          <span className={styles.chatOverlayName}>{card.name}</span>
          <span className={styles.chatOverlayText}>
            {card.replyName ? <span className={styles.chatOverlayReply}>↩ {card.replyName} </span> : null}
            {card.text}
          </span>
        </div>
      ))}
    </div>
  );
}
