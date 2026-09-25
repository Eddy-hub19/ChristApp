"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SendHorizontal, Smile } from "lucide-react";
import PersonAvatar from "./PersonAvatar";
import type { HallMessage } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

type WatchChatProps = {
  messages: HallMessage[];
  currentUserId: string | undefined;
  hostId: string | undefined;
  reactions: string[];
  onSend: (content: string) => Promise<boolean>;
  /** rect — координати натиснутої кнопки, звідки на екрані стартує власний летючий емодзі. */
  onReact: (emoji: string, rect: DOMRect) => void;
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
  // Лише мобільний: панель емодзі ховається за кнопкою 😊, не закривається після тапу
  // (щоб можна було швидко тапати кілька разів) — закриває повторний тап або початок вводу.
  // На десктопі клас, який ця змінна вмикає, ігнорується CSS-медіазапитом — рядок лишається видимим завжди.
  const [emojiOpen, setEmojiOpen] = useState(false);
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

      <div
        className={`${styles.reactionBar} ${emojiOpen ? styles.reactionBarOpen : ""}`}
        role="group"
        aria-label={t("reactions")}
      >
        {reactions.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={styles.reactionButton}
            onClick={(e) => onReact(emoji, e.currentTarget.getBoundingClientRect())}
          >
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
        <button
          type="button"
          className={`${styles.emojiToggle} ${emojiOpen ? styles.emojiToggleActive : ""}`}
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label={t("reactions")}
          aria-pressed={emojiOpen}
        >
          <Smile size={20} />
        </button>
        <input
          className={styles.chatInput}
          value={draft}
          maxLength={500}
          onChange={(e) => {
            setDraft(e.target.value);
            if (emojiOpen) setEmojiOpen(false);
          }}
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
