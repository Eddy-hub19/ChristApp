"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SendHorizontal, Smile } from "lucide-react";
import PersonAvatar from "./PersonAvatar";
import { watchUserName } from "@/lib/queries/watchRoomsQueries";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import MessageActionMenu from "@/components/ChatShared/MessageActionMenu";
import ReactionPills from "@/components/ChatShared/ReactionPills";
import ReplyBanner from "@/components/ChatShared/ReplyBanner";
import ReplyQuote from "@/components/ChatShared/ReplyQuote";
import { HEART_REACTION } from "@/components/ChatShared/chatReactions";
import { replyPreviewText } from "@/components/ChatShared/replyPreview";
import { stripLegacyReplyPrefix } from "@/lib/legacyReplyPrefix";
import { useMessageGestures } from "@/components/ChatShared/useMessageGestures";
import sharedStyles from "@/components/ChatShared/ChatShared.module.scss";
import { isSystemMessage, systemMessageText, systemMessageTime } from "@/lib/watchSystemMessage";
import type { HallMember, HallMessage } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

const HIGHLIGHT_MS = 1_700;
const NOTICE_MS = 3_000;
/** Після переходу до цитати автопрокрутка "до низу" не має перебивати плавну прокрутку до оригіналу. */
const JUMP_STICK_SUPPRESS_MS = 2_500;
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
  onSend: (content: string, replyToId?: string) => Promise<boolean>;
  onDeleteMessage: (messageId: string) => Promise<boolean>;
  onEditMessage: (messageId: string, content: string) => Promise<boolean>;
  /** Дозавантажити історію старішу за beforeId (до untilId включно). */
  onLoadOlder: (beforeId: string, untilId?: string) => Promise<boolean>;
  /** rect — координати натиснутої кнопки, звідки на екрані стартує власний летючий емодзі. */
  onReact: (emoji: string, rect: DOMRect) => void;
  typingUserIds: Set<string>;
  onTyping: (isTyping: boolean) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  onMarkRead: () => void;
};

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
  onDeleteMessage,
  onEditMessage,
  onLoadOlder,
  onReact,
  typingUserIds,
  onTyping,
  onToggleMessageReaction,
  onMarkRead,
}: WatchChatProps) {
  const t = useTranslations("cinema.hall");
  const locale = useLocale();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTargetRaw, setReplyTarget] = useState<HallMessage | null>(null);
  const [editingRaw, setEditing] = useState<HallMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const jumpAttemptedRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  // Лише мобільний: панель емодзі ховається за кнопкою 😊, не закривається після тапу
  // (щоб можна було швидко тапати кілька разів) — закриває повторний тап або початок вводу.
  // На десктопі клас, який ця змінна вмикає, ігнорується CSS-медіазапитом — рядок лишається видимим завжди.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const suppressStickUntilRef = useRef(0);
  const stickSuppressed = () => Date.now() < suppressStickUntilRef.current;

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const tShared = useTranslations("chatShared");

  // Повідомлення, на яке відповідаємо/яке редагуємо, могли видалити — тоді плашку не показуємо.
  const replyTarget =
    replyTargetRaw && messages.some((m) => m.id === replyTargetRaw.id) ? replyTargetRaw : null;
  const editing = editingRaw && messages.some((m) => m.id === editingRaw.id) ? editingRaw : null;

  // Автори реакцій/повідомлень можуть уже не бути учасниками — беремо їх і з самих повідомлень.
  const usersById = useMemo(() => {
    const map = new Map<string, HallMessage["user"]>();
    for (const m of messages) map.set(m.user.id, m.user);
    for (const member of members) map.set(member.id, member);
    return map;
  }, [messages, members]);

  const resolveReactionUser = useCallback(
    (userId: string) => {
      const user = usersById.get(userId);
      return {
        avatarSrc: resolvePublicAvatarUrl(user?.avatarUrl),
        label: user ? watchUserName(user) : "",
      };
    },
    [usersById],
  );

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    if (stickToBottom.current && Date.now() >= suppressStickUntilRef.current) scrollToBottom("smooth");
  }, [messages]);

  // Клавіатура відкривається/закривається — .chatList міняє висоту (див. useKeyboardInset
  // у WatchHall). Якщо користувач і так стежив за низом стрічки, не даємо клавіатурі
  // «підняти» останні повідомлення за межі видимої області: доганяємо низ на кожному ресайзі.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current && Date.now() >= suppressStickUntilRef.current) scrollToBottom("auto");
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
        if (!isSystemMessage(messages[i]) && messages[i].createdAt <= member.lastReadAt) {
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

  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const findMessageElement = (messageId: string) =>
    listRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`) ?? null;

  const scrollToMessage = (messageId: string): boolean => {
    const target = findMessageElement(messageId);
    const list = listRef.current;
    if (!target || !list) return false;
    const targetRect = target.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const top =
      list.scrollTop + (targetRect.top - listRect.top) - (list.clientHeight - targetRect.height) / 2;
    stickToBottom.current = false;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    setHighlightedId(messageId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(
      () => setHighlightedId((prev) => (prev === messageId ? null : prev)),
      HIGHLIGHT_MS,
    );
    return true;
  };

  /** Тап по цитаті: гортаємо до оригіналу; якщо його ще немає у списку — дозавантажуємо історію. */
  const jumpToMessage = async (messageId: string) => {
    stickToBottom.current = false;
    suppressStickUntilRef.current = Date.now() + JUMP_STICK_SUPPRESS_MS;
    if (scrollToMessage(messageId)) return;
    const oldest = messages[0];
    if (!oldest || jumpAttemptedRef.current.has(messageId)) {
      showNotice(tShared("quoteOriginalNotFound"));
      return;
    }
    jumpAttemptedRef.current.add(messageId);
    showNotice(tShared("quoteOriginalLoading"));
    const ok = await onLoadOlder(oldest.id, messageId);
    if (!ok) {
      showNotice(tShared("quoteOriginalNotFound"));
      return;
    }
    // Дати React домалювати дозавантажені рядки, тоді гортати.
    window.setTimeout(() => {
      if (scrollToMessage(messageId)) setNotice(null);
      else showNotice(tShared("quoteOriginalNotFound"));
    }, 80);
  };

  const startReply = (message: HallMessage) => {
    setEditing(null);
    setReplyTarget(message);
    inputRef.current?.focus();
  };

  const startEdit = (message: HallMessage) => {
    setReplyTarget(null);
    setEditing(message);
    setDraft(stripLegacyReplyPrefix(message.content));
    inputRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const ok = editing
      ? await onEditMessage(editing.id, content)
      : await onSend(content, replyTarget?.id);
    setSending(false);
    if (ok) {
      setDraft("");
      setReplyTarget(null);
      setEditing(null);
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
          if (stickSuppressed()) return;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        aria-live="polite"
      >
        {messages.length === 0 ? <p className={styles.chatEmpty}>{t("chatEmpty")}</p> : null}
        {messages.map((m) => {
          if (isSystemMessage(m)) {
            const text = systemMessageText(t, m, members);
            if (!text) return null;
            const time = new Date(systemMessageTime(m)).toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div key={m.id} className={styles.systemRow} data-message-id={m.id}>
                {text} · {time}
              </div>
            );
          }
          const readers = readReceiptsByMessageId.get(m.id) ?? [];
          const visibleReaders = readers.slice(0, READ_AVATAR_LIMIT);
          const extraReadersCount = readers.length - visibleReaders.length;

          return (
            <WatchChatMessage
              key={m.id}
              message={m}
              mine={m.user.id === currentUserId}
              currentUserId={currentUserId}
              hostId={hostId}
              reactionOptions={reactions}
              highlighted={highlightedId === m.id}
              resolveReactionUser={resolveReactionUser}
              onToggleReaction={(emoji) => onToggleMessageReaction(m.id, emoji)}
              onReply={() => startReply(m)}
              onEdit={() => startEdit(m)}
              onDelete={() => {
                if (window.confirm(tShared("deleteConfirm"))) void onDeleteMessage(m.id);
              }}
              onQuoteClick={(id) => void jumpToMessage(id)}
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

      {notice ? (
        <p className={styles.chatNotice} role="status">
          {notice}
        </p>
      ) : null}

      {replyTarget || editing ? (
        <div className={styles.chatBanner}>
          <ReplyBanner
            mode={editing ? "edit" : "reply"}
            username={replyTarget ? watchUserName(replyTarget.user) : ""}
            text={replyPreviewText(tShared, { content: (editing ?? replyTarget)?.content ?? "" })}
            onCancel={editing ? cancelEdit : () => setReplyTarget(null)}
          />
        </div>
      ) : null}

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
          ref={inputRef}
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
  currentUserId: string | undefined;
  hostId: string | undefined;
  reactionOptions: string[];
  highlighted: boolean;
  resolveReactionUser: (userId: string) => { avatarSrc?: string; label: string };
  onToggleReaction: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuoteClick: (messageId: string) => void;
  visibleReaders: HallMember[];
  extraReadersCount: number;
  t: ReturnType<typeof useTranslations>;
};

function WatchChatMessage({
  message: m,
  mine,
  currentUserId,
  hostId,
  reactionOptions,
  highlighted,
  resolveReactionUser,
  onToggleReaction,
  onReply,
  onEdit,
  onDelete,
  onQuoteClick,
  visibleReaders,
  extraReadersCount,
  t,
}: WatchChatMessageProps) {
  const tShared = useTranslations("chatShared");
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const closeMenu = useCallback(() => setMenuRect(null), []);

  const gestures = useMessageGestures<HTMLDivElement>({
    onReply,
    onDoubleTap: () => onToggleReaction(HEART_REACTION),
    onOpenMenu: setMenuRect,
  });

  const myReactions = useMemo(
    () =>
      new Set(
        m.reactions.filter((r) => currentUserId && r.userId === currentUserId).map((r) => r.type),
      ),
    [m.reactions, currentUserId],
  );

  return (
    <div
      className={`${styles.chatMessage} ${mine ? styles.chatMessageMine : ""}`}
      data-message-id={m.id}
    >
      {!mine ? <PersonAvatar user={m.user} size={26} /> : null}
      <div className={styles.chatMessageBody}>
        <div
          ref={gestures.setElement}
          className={`${styles.chatBubble} ${sharedStyles.gestureSurface} ${highlighted ? sharedStyles.highlight : ""}`}
          {...gestures.handlers}
          role="button"
          tabIndex={-1}
        >
          {!mine ? (
            <span className={styles.chatAuthor}>
              {m.user.nickname || m.user.username}
              {m.user.id === hostId ? " 👑" : ""}
            </span>
          ) : null}
          {m.replyTo ? (
            <ReplyQuote
              username={m.replyTo.deleted ? undefined : m.replyTo.username}
              text={m.replyTo.deleted ? undefined : replyPreviewText(tShared, { content: m.replyTo.content })}
              deleted={m.replyTo.deleted}
              onClick={() => onQuoteClick(m.replyTo!.id)}
            />
          ) : null}
          <span className={styles.chatText}>
            {m.content}
            {m.editedAt ? <span className={styles.chatEdited}> · {tShared("edited")}</span> : null}
          </span>
        </div>

        {(m.reactions.length > 0 || visibleReaders.length > 0) && (
          <div className={styles.chatMessageFooter}>
            <ReactionPills
              reactions={m.reactions}
              currentUserId={currentUserId}
              resolveUser={resolveReactionUser}
              onToggle={onToggleReaction}
              align={mine ? "end" : "start"}
            />

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

      {menuRect ? (
        <MessageActionMenu
          anchorRect={menuRect}
          reactions={reactionOptions}
          myReactions={myReactions}
          onReact={onToggleReaction}
          onReply={onReply}
          copyText={stripLegacyReplyPrefix(m.content)}
          onEdit={mine ? onEdit : undefined}
          onDelete={mine ? onDelete : undefined}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}
