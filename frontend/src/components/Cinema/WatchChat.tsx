"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SendHorizontal } from "lucide-react";
import PersonAvatar from "./PersonAvatar";
import type { HallMessage } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

type WatchChatProps = {
  messages: HallMessage[];
  currentUserId: string | undefined;
  hostId: string | undefined;
  reactions: string[];
  onSend: (content: string) => Promise<boolean>;
  onReact: (emoji: string) => void;
};

export default function WatchChat({
  messages,
  currentUserId,
  hostId,
  reactions,
  onSend,
  onReact,
}: WatchChatProps) {
  const t = useTranslations("cinema.hall");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const ok = await onSend(content);
    setSending(false);
    if (ok) {
      setDraft("");
      stickToBottom.current = true;
    }
  };

  return (
    <section className={styles.chat} aria-label={t("chat")}>
      <h2 className={styles.chatTitle}>{t("chat")}</h2>
      <div
        ref={listRef}
        className={styles.chatList}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        aria-live="polite"
      >
        {messages.length === 0 ? <p className={styles.chatEmpty}>{t("chatEmpty")}</p> : null}
        {messages.map((m) => {
          const mine = m.user.id === currentUserId;
          return (
            <div key={m.id} className={`${styles.chatMessage} ${mine ? styles.chatMessageMine : ""}`}>
              {!mine ? <PersonAvatar user={m.user} size={26} /> : null}
              <div className={styles.chatBubble}>
                {!mine ? (
                  <span className={styles.chatAuthor}>
                    {m.user.nickname || m.user.username}
                    {m.user.id === hostId ? " 👑" : ""}
                  </span>
                ) : null}
                <span className={styles.chatText}>{m.content}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.reactionBar} role="group" aria-label={t("reactions")}>
        {reactions.map((emoji) => (
          <button key={emoji} type="button" className={styles.reactionButton} onClick={() => onReact(emoji)}>
            {emoji}
          </button>
        ))}
      </div>

      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className={styles.chatInput}
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("chatPlaceholder")}
          aria-label={t("chatPlaceholder")}
          enterKeyHint="send"
        />
        <button type="submit" className={styles.sendButton} disabled={!draft.trim() || sending} aria-label={t("send")}>
          <SendHorizontal size={18} />
        </button>
      </form>
    </section>
  );
}
