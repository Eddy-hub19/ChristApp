"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { SendHorizontal, Smile } from "lucide-react";
import PersonAvatar from "./PersonAvatar";
import { watchUserName } from "@/lib/queries/watchRoomsQueries";
import { useLongPress } from "@/hooks/useLongPress";
import { useDoubleTap } from "@/hooks/useDoubleTap";
import type { HallMember, HallMessage } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

const HEART_EMOJI = "❤️";
/** Скільки чекати без нової активності вводу, перш ніж самим сказати "я більше не друкую". */
const TYPING_STOP_DELAY_MS = 2_200;
/** Не частіше цього — навіть якщо людина друкує безперервно. */
const TYPING_RESEND_INTERVAL_MS = 2_000;
const READ_AVATAR_LIMIT = 3;

type WatchChatProps = {
  messages: HallMessage[];
  members: HallMember[];
  currentUserId: string | undefined;
  hostId: string | undefined;
  reactions: string[];
  onSend: (content: string) => Promise<boolean>;
  /** rect — координати натиснутої кнопки, звідки на екрані стартує власний летючий емодзі. */
  onReact: (emoji: string, rect: DOMRect) => void;
  typingUserIds: Set<string>;
  onTyping: (isTyping: boolean) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  onMarkRead: () => void;
};

function groupMessageReactions(message: HallMessage, currentUserId: string | undefined) {
  const grouped = new Map<string, { emoji: string; userIds: string[] }>();
  for (const reaction of message.reactions) {
    const existing = grouped.get(reaction.type);
    if (existing) {
      existing.userIds.push(reaction.userId);
    } else {
      grouped.set(reaction.type, { emoji: reaction.type, userIds: [reaction.userId] });
    }
  }
  return Array.from(grouped.values()).map((g) => ({
    ...g,
    count: g.userIds.length,
    reactedByMe: Boolean(currentUserId && g.userIds.includes(currentUserId)),
  }));
}

function formatTypingLine(
  t: ReturnType<typeof useTranslations>,
  names: string[],
): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return t("typingOne", { name: names[0] });
  if (names.length === 2) return t("typingTwo", { first: names[0], second: names[1] });
  return t("typingMany");
}

export default function WatchChat({
  messages,
  members,
  currentUserId,
  hostId,
  reactions,
  onSend,
  onReact,
  typingUserIds,
  onTyping,
  onToggleMessageReaction,
  onMarkRead,
}: WatchChatProps) {
  const t = useTranslations("cinema.hall");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [openPickerMessageId, setOpenPickerMessageId] = useState<string | null>(null);
  // Лише мобільний: панель емодзі ховається за кнопкою 😊, не закривається після тапу
  // (щоб можна було швидко тапати кілька разів) — закриває повторний тап або початок вводу.
  // На десктопі клас, який ця змінна вмикає, ігнорується CSS-медіазапитом — рядок лишається видимим завжди.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    if (stickToBottom.current) scrollToBottom("smooth");
  }, [messages]);

  // Клавіатура відкривається/закривається — .chatList міняє висоту (див. useKeyboardInset
  // у WatchHall). Якщо користувач і так стежив за низом стрічки, не даємо клавіатурі
  // «підняти» останні повідомлення за межі видимої області: доганяємо низ на кожному ресайзі.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) scrollToBottom("auto");
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Кімнату (чат) видно на екрані — позначаємо прочитаним. Гранулярність як в основному
  // чаті: на рівні кімнати, не по кожному повідомленню окремо (там теж немає per-message
  // observer'а — markRoomRead викликається на вхід/фокус/нове повідомлення).
  useEffect(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    onMarkRead();
  }, [messages.length, onMarkRead]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (document.visibilityState === "visible") onMarkRead();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [onMarkRead]);

  const readReceiptsByMessageId = useMemo(() => {
    const map = new Map<string, HallMember[]>();
    const others = members.filter((m) => m.id !== currentUserId && m.status === "JOINED");
    for (const member of others) {
      let target: HallMessage | undefined;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].createdAt <= member.lastReadAt) {
          target = messages[i];
          break;
        }
      }
      if (!target) continue;
      const list = map.get(target.id) ?? [];
      list.push(member);
      map.set(target.id, list);
    }
    return map;
  }, [messages, members, currentUserId]);

  // ===== "Друкує…" =====
  const typingActiveRef = useRef(false);
  const typingLastSentAtRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const noteTypingActivity = () => {
    const now = Date.now();
    if (!typingActiveRef.current || now - typingLastSentAtRef.current >= TYPING_RESEND_INTERVAL_MS) {
      onTyping(true);
      typingActiveRef.current = true;
      typingLastSentAtRef.current = now;
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      onTyping(false);
    }, TYPING_STOP_DELAY_MS);
  };

  const stopTyping = () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      onTyping(false);
    }
  };

  const stopTypingRef = useRef(stopTyping);
  useEffect(() => {
    stopTypingRef.current = stopTyping;
  });
  useEffect(() => () => stopTypingRef.current(), []);

  const typingNames = useMemo(() => {
    const names: string[] = [];
    for (const userId of typingUserIds) {
      if (userId === currentUserId) continue;
      const member = membersById.get(userId);
      if (member) names.push(watchUserName(member));
    }
    return names;
  }, [typingUserIds, membersById, currentUserId]);
  const typingLine = formatTypingLine(t, typingNames);

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const ok = await onSend(content);
    setSending(false);
    if (ok) {
      setDraft("");
      stopTyping();
      stickToBottom.current = true;
      scrollToBottom("smooth");
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
        {openPickerMessageId ? (
          <div
            className={styles.reactionPickerBackdrop}
            onClick={() => setOpenPickerMessageId(null)}
            aria-hidden
          />
        ) : null}
        {messages.map((m) => {
          const mine = m.user.id === currentUserId;
          const reactionGroups = groupMessageReactions(m, currentUserId);
          const readers = readReceiptsByMessageId.get(m.id) ?? [];
          const visibleReaders = readers.slice(0, READ_AVATAR_LIMIT);
          const extraReadersCount = readers.length - visibleReaders.length;
          const isPickerOpen = openPickerMessageId === m.id;

          return (
            <WatchChatMessage
              key={m.id}
              message={m}
              mine={mine}
              hostId={hostId}
              reactionGroups={reactionGroups}
              reactionOptions={reactions}
              isPickerOpen={isPickerOpen}
              onOpenPicker={() => setOpenPickerMessageId(m.id)}
              onClosePicker={() => setOpenPickerMessageId(null)}
              onToggleReaction={(emoji) => onToggleMessageReaction(m.id, emoji)}
              visibleReaders={visibleReaders}
              extraReadersCount={extraReadersCount}
              t={t}
            />
          );
        })}
        {typingLine ? (
          <div className={styles.typingRow} role="status" aria-live="polite">
            <span className={styles.typingText}>{typingLine}</span>
            <span className={styles.typingDots} aria-hidden>
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </span>
          </div>
        ) : null}
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
            if (e.target.value.trim()) {
              noteTypingActivity();
            } else {
              stopTyping();
            }
            if (emojiOpen) setEmojiOpen(false);
          }}
          onFocus={() => {
            // Фокус на полі — саме тоді відкривається клавіатура: одразу показуємо
            // останні повідомлення, не чекаючи, доки користувач сам гортоне вниз.
            stickToBottom.current = true;
            scrollToBottom("smooth");
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

type WatchChatMessageProps = {
  message: HallMessage;
  mine: boolean;
  hostId: string | undefined;
  reactionGroups: Array<{ emoji: string; count: number; reactedByMe: boolean; userIds: string[] }>;
  reactionOptions: string[];
  isPickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onToggleReaction: (emoji: string) => void;
  visibleReaders: HallMember[];
  extraReadersCount: number;
  t: ReturnType<typeof useTranslations>;
};

function WatchChatMessage({
  message: m,
  mine,
  hostId,
  reactionGroups,
  reactionOptions,
  isPickerOpen,
  onOpenPicker,
  onClosePicker,
  onToggleReaction,
  visibleReaders,
  extraReadersCount,
  t,
}: WatchChatMessageProps) {
  const suppressClickRef = useRef(false);

  const longPress = useLongPress<HTMLDivElement>(
    () => {
      suppressClickRef.current = true;
      onOpenPicker();
    },
    { ms: 360, moveThreshold: 24 },
  );

  const doubleTap = useDoubleTap<HTMLDivElement>(() => onToggleReaction(HEART_EMOJI));

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    doubleTap.onClick(event);
  };

  return (
    <div className={`${styles.chatMessage} ${mine ? styles.chatMessageMine : ""}`}>
      {!mine ? <PersonAvatar user={m.user} size={26} /> : null}
      <div className={styles.chatMessageBody}>
        <div
          className={styles.chatBubble}
          {...longPress}
          onClick={handleClick}
          role="button"
          tabIndex={-1}
        >
          {!mine ? (
            <span className={styles.chatAuthor}>
              {m.user.nickname || m.user.username}
              {m.user.id === hostId ? " 👑" : ""}
            </span>
          ) : null}
          <span className={styles.chatText}>{m.content}</span>

          {isPickerOpen ? (
            <div className={styles.reactionPickerPopup} role="menu">
              {reactionOptions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={styles.reactionPickerButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleReaction(emoji);
                    onClosePicker();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {(reactionGroups.length > 0 || visibleReaders.length > 0) && (
          <div className={styles.chatMessageFooter}>
            {reactionGroups.length > 0 ? (
              <div
                className={styles.reactionPillRow}
                title={t("reactedBy", {
                  names: reactionGroups.map((g) => `${g.emoji}×${g.count}`).join(" "),
                })}
              >
                {reactionGroups.map((g) => (
                  <button
                    key={g.emoji}
                    type="button"
                    className={`${styles.reactionPill} ${g.reactedByMe ? styles.reactionPillActive : ""}`}
                    onClick={() => onToggleReaction(g.emoji)}
                  >
                    <span>{g.emoji}</span>
                    <span className={styles.reactionPillCount}>{g.count}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {visibleReaders.length > 0 ? (
              <div
                className={styles.readReceiptRow}
                title={t("seenBy", {
                  names: visibleReaders.map((r) => watchUserName(r)).join(", "),
                })}
              >
                {visibleReaders.map((reader) => (
                  <PersonAvatar
                    key={reader.id}
                    user={reader}
                    size={15}
                    className={styles.readReceiptAvatar}
                  />
                ))}
                {extraReadersCount > 0 ? (
                  <span className={styles.readReceiptMore}>+{extraReadersCount}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
