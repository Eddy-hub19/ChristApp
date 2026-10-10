"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import Image from "next/image";
import { RotateCw, X } from "lucide-react";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import {
  type AppReactionType,
  type Message,
  isMessageFromCurrentUser,
} from "@/types/message";
import { useTranslations } from "next-intl";
import { useHydrated } from "@/hooks/useHydrated";
import { getInitials } from "@/lib/utils";
import styles from "@/components/MessageBubble/MessageBubble.module.scss";
import sharedStyles from "@/components/ChatShared/ChatShared.module.scss";
import MessageActionMenu from "@/components/ChatShared/MessageActionMenu";
import ReactionPills from "@/components/ChatShared/ReactionPills";
import ReplyQuote from "@/components/ChatShared/ReplyQuote";
import { CHAT_REACTIONS, HEART_REACTION } from "@/components/ChatShared/chatReactions";
import { replyPreviewText } from "@/components/ChatShared/replyPreview";
import { useMessageGestures } from "@/components/ChatShared/useMessageGestures";
import {
  buildVerseReference,
  parseVerseSharePayload,
} from "@/lib/verseShareMessage";
import { Link } from "@/i18n/navigation";
import { VOICE_META_PREFIX, VOICE_META_SUFFIX } from "@/lib/voiceMessage";
import { parseStickerMessagePayload } from "@/lib/stickerMessage";
import { parseFlockInvite } from "@/lib/flockInviteMessage";
import FlockInviteCard from "@/components/FlockMiniGame/FlockInviteCard";
import { parseVoiceMessageUrl } from "@/lib/voiceMessage";
import { stripLegacyReplyPrefix } from "@/lib/legacyReplyPrefix";
import ChatImage from "@/components/ChatImage/ChatImage";
import FileBubble from "@/components/FileBubble/FileBubble";
import VoiceMessageBubble from "@/components/VoiceMessageBubble/VoiceMessageBubble";
import { ScriptureText } from "@/components/ScriptureText/ScriptureText";
import VideoSheep from "@/components/VideoSheep/VideoSheep";
import BookMessageBubble from "@/components/BookMessageBubble/BookMessageBubble";
import { bookFormatFromName, isBookFileName, toRawCloudinaryUrl } from "@/lib/book/bookFile";
import { fetchBookFile, shareOrDownloadBook, canShareFiles } from "@/lib/book/shareFile";

type MessageBubbleProps = {
  message: Message;
  currentUsername?: string;
  currentUser?: { id: string; username: string; nickname?: string } | null;
  /** Відкрити фото у повноекранному перегляді (галерея чату). */
  onOpenImage?: (message: Message) => void;
  /** Фото альбому (разом із цим повідомленням першим): рендеряться сіткою. */
  albumMessages?: Message[];
  avatarSrc?: string;
  onAvatarClick?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  canDeleteOwnMessage?: boolean;
  canDeleteAnyMessage?: boolean;
  showReadReceipt?: boolean;
  readReceiptUsers?: Array<{ id: string; avatarSrc?: string; label?: string }>;
  readReceiptAvatarSrc?: string;
  readReceiptLabel?: string;
  onToggleReaction?: (message: Message, reaction: AppReactionType) => void;
  /** «Не надіслано»: повторити відправку (той самий clientMessageId — без дубля) / прибрати. */
  onRetryUnsent?: (message: Message) => void;
  onDismissUnsent?: (message: Message) => void;
  onReplyPreviewClick?: (replyMessageId: string) => void;
  resolveReactionAvatarUrl?: (userId: string) => string | undefined;
  resolveReactionUserLabel?: (userId: string) => string | undefined;
  isHighlighted?: boolean;
  hideSenderName?: boolean;
  hideOwnSenderName?: boolean;
  senderNameMode?: "inline" | "compact-above";
};

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

type LinkChunk =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

function isAudioFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "mp3" || ext === "m4a";
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function splitMessageWithLinks(content: string): LinkChunk[] {
  const chunks: LinkChunk[] = [];
  let lastIndex = 0;
  URL_REGEX.lastIndex = 0;

  for (const match of content.matchAll(URL_REGEX)) {
    const matched = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      chunks.push({ type: "text", value: content.slice(lastIndex, start) });
    }

    const clean = matched.replace(/[),.;!?]+$/, "");
    const suffix = matched.slice(clean.length);
    chunks.push({ type: "link", value: clean, href: normalizeHref(clean) });
    if (suffix) {
      chunks.push({ type: "text", value: suffix });
    }
    lastIndex = start + matched.length;
  }

  if (lastIndex < content.length) {
    chunks.push({ type: "text", value: content.slice(lastIndex) });
  }

  if (chunks.length === 0) {
    return [{ type: "text", value: content }];
  }

  return chunks;
}

function extractYoutubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }

    if (host.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function LinkPreviewCard({ href }: { href: string }) {
  let hostname = href;
  try {
    hostname = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    // keep fallback hostname = href
  }

  const youtubeEmbedUrl = extractYoutubeEmbedUrl(href);

  if (youtubeEmbedUrl) {
    return (
      <div className={styles.linkPreviewWrap} data-bubble-control>
        <div className={styles.youtubeFrameWrap}>
          <iframe
            src={youtubeEmbedUrl}
            className={styles.youtubeFrame}
            title="YouTube preview"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <a
          className={styles.linkPreviewCard}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          <span className={styles.linkPreviewTitle}>YouTube</span>
          <span className={styles.linkPreviewUrl}>{hostname}</span>
        </a>
      </div>
    );
  }

  return (
    <a
      className={styles.linkPreviewCard}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      data-bubble-control
    >
      <span className={styles.linkPreviewTitle}>Ссылка</span>
      <span className={styles.linkPreviewUrl}>{hostname}</span>
    </a>
  );
}

function AudioFileBubble({ src, filename }: { src: string; filename: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(audio.duration);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else void audio.play();
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const val = parseFloat(e.target.value);
    audio.currentTime = val;
    setCurrentTime(val);
  };

  return (
    <div className={styles.audioFileBubble} data-bubble-control>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="metadata" />
      <p className={styles.audioFileTitle}>
        <span className={styles.audioFileIcon} aria-hidden>
          ♪
        </span>
        <span className={styles.audioFileName}>{filename}</span>
      </p>
      <div className={styles.audioFileControls}>
        <button
          type="button"
          className={styles.audioPlayButton}
          onClick={toggle}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          className={styles.audioFileProgress}
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          onClick={(e) => e.stopPropagation()}
          aria-label="Прогресс воспроизведения"
        />
        <span className={styles.audioFileTime}>
          {duration > 0
            ? `${fmtTime(currentTime)} / ${fmtTime(duration)}`
            : fmtTime(currentTime)}
        </span>
      </div>
    </div>
  );
}

function SenderName({ name, as }: { name: string; as: "strong" | "span" }) {
  const Tag = as;
  return <Tag>{name}</Tag>;
}

function MessageBubble({
  message,
  currentUsername,
  currentUser,
  onOpenImage,
  albumMessages,
  avatarSrc,
  onAvatarClick,
  onReply,
  onDelete,
  onEdit,
  canDeleteOwnMessage = false,
  onRetryUnsent,
  onDismissUnsent,
  canDeleteAnyMessage = false,
  showReadReceipt = false,
  readReceiptUsers = [],
  readReceiptAvatarSrc,
  readReceiptLabel = "Просмотрено",
  onToggleReaction,
  onReplyPreviewClick,
  resolveReactionAvatarUrl,
  resolveReactionUserLabel,
  isHighlighted = false,
  hideSenderName = false,
  hideOwnSenderName = false,
  senderNameMode = "inline",
}: MessageBubbleProps) {
  const tShared = useTranslations("chatShared");
  const tChat = useTranslations("chat");
  const hydrated = useHydrated();
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

  const date = new Date(message.createdAt);
  const formattedDate = hydrated
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "\u2007";

  const isOwnMessage = currentUser
    ? isMessageFromCurrentUser(message, currentUser)
    : message.sender === "me" ||
      (Boolean(currentUsername) && message.username === currentUsername) ||
      message.username === "Ты";

  const stickerPayload = parseStickerMessagePayload(message.content);
  const flockInvite = parseFlockInvite(message.content);
  const isMediaMessage =
    message.type === "IMAGE" ||
    message.type === "FILE" ||
    message.type === "VIDEO_NOTE" ||
    message.type === "VOICE" ||
    message.content.startsWith(VOICE_META_PREFIX);
  const stickerImagePath = stickerPayload?.path ?? null;
  const bubble = isOwnMessage
    ? `${styles.bubble} ${styles.myBubble} ${stickerPayload ? styles.stickerBubble : ""} ${isMediaMessage ? styles.mediaBubble : ""}`
    : `${styles.bubble} ${stickerPayload ? styles.stickerBubble : ""} ${isMediaMessage ? styles.mediaBubble : ""}`;

  const showAvatar = Boolean(
    avatarSrc || (onAvatarClick && message.senderId && !isOwnMessage),
  );
  const canDeleteThisMessage =
    canDeleteOwnMessage && (isOwnMessage || canDeleteAnyMessage);

  const isPlainText =
    (!message.type || message.type === "TEXT") &&
    !stickerPayload &&
    !flockInvite &&
    !parseVoiceMessageUrl(message.content);
  const canEditThisMessage = Boolean(isOwnMessage && onEdit && isPlainText);
  const copyText = isPlainText ? stripLegacyReplyPrefix(message.content).trim() : "";
  const bookFileName = message.type === "FILE" ? message.content?.trim() ?? "" : "";
  const bookFormat = message.fileUrl && isBookFileName(bookFileName) ? bookFormatFromName(bookFileName) : null;
  const handleShareBook = bookFormat
    ? () => {
        const url = toRawCloudinaryUrl(message.fileUrl ?? "");
        void fetchBookFile(url, bookFileName, bookFormat)
          .then(shareOrDownloadBook)
          .catch(() => undefined);
      }
    : undefined;

  const currentUserId = currentUser?.id;
  const myReactions = useMemo(
    () =>
      new Set(
        (message.reactions ?? [])
          .filter((reaction) => currentUserId && reaction.userId === currentUserId)
          .map((reaction) => reaction.type),
      ),
    [currentUserId, message.reactions],
  );

  const gestures = useMessageGestures<HTMLElement>({
    onReply: onReply ? () => onReply(message) : undefined,
    onDoubleTap: onToggleReaction
      ? () => onToggleReaction(message, HEART_REACTION)
      : undefined,
    onOpenMenu: setMenuRect,
  });

  const closeMenu = useCallback(() => setMenuRect(null), []);

  const handleDeleteClick = () => onDelete?.(message);
  const handleEditClick = () => onEdit?.(message);

  const handleAvatarClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isOwnMessage && message.senderId) {
      onAvatarClick?.(message);
    }
  };

  const handleReplyPreviewClick = () => {
    if (message.replyTo?.id) {
      onReplyPreviewClick?.(message.replyTo.id);
    }
  };

  const bubbleClassName = `${bubble} ${sharedStyles.gestureSurface} ${isHighlighted ? styles.highlightedBubble : ""}`;
  const interactiveBubbleProps = {
    ref: gestures.setElement,
    ...gestures.handlers,
  };

  const bubbleBody = (
    <>
      {message.replyTo ? (
        <ReplyQuote
          username={message.replyTo.username}
          text={replyPreviewText(tShared, {
            content: message.replyTo.content,
            type: message.replyTo.type,
            fileUrl: message.replyTo.fileUrl,
          })}
          deleted={message.replyTo.deleted}
          onClick={handleReplyPreviewClick}
        />
      ) : null}

      {(() => {
        const senderName = message.username || "Unknown";
        const canShowSenderName =
          !hideSenderName && !(hideOwnSenderName && isOwnMessage);
        const showCompactSender =
          senderNameMode === "compact-above" && canShowSenderName;

        if (flockInvite) {
          return (
            <FlockInviteCard
              senderName={senderName}
              arenaId={flockInvite.arenaId}
              isOwn={isOwnMessage}
            />
          );
        }

        if (stickerPayload) {
          return (
            <div className={styles.stickerMessage}>
              {stickerImagePath ? (
                <Image
                  src={stickerImagePath}
                  alt="Стикер"
                  width={120}
                  height={120}
                  className={styles.stickerImage}
                  loading="lazy"
                />
              ) : (
                <span className={styles.stickerFallback} aria-label="Стикер">
                  🙂
                </span>
              )}
            </div>
          );
        }

        const imgUrl = message.fileUrl?.trim();
        if (message.type === "VIDEO_NOTE" && imgUrl) {
          return (
            <div className={styles.imageMessage}>
              {showCompactSender ? (
                <p className={styles.senderCompact}>
                  <SenderName name={senderName} as="span" />
                </p>
              ) : null}
              {canShowSenderName && !showCompactSender ? (
                <p className={styles.imageMessageMeta}>
                  <SenderName name={senderName} as="strong" />
                  <span> — {tChat("videoNoteLabel")}</span>
                </p>
              ) : null}
              <VideoSheep src={imgUrl} />
            </div>
          );
        }

        if (message.type === "IMAGE" && imgUrl) {
          return (
            <div className={styles.imageMessage}>
              {showCompactSender ? (
                <p className={styles.senderCompact}>
                  <SenderName name={senderName} as="span" />
                </p>
              ) : null}
              {canShowSenderName && !showCompactSender ? (
                <p className={styles.imageMessageMeta}>
                  <SenderName name={senderName} as="strong" />
                  <span> — {tChat("photoLabel")}</span>
                </p>
              ) : null}
              {albumMessages && albumMessages.length > 1 ? (
                <div
                  className={styles.albumGrid}
                  data-count={Math.min(albumMessages.length, 4)}
                >
                  {albumMessages.map((member) => (
                    <ChatImage
                      key={member.id}
                      variant="tile"
                      src={member.fileUrl as string}
                      width={member.mediaWidth}
                      height={member.mediaHeight}
                      onOpen={
                        onOpenImage ? () => onOpenImage(member) : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
              <ChatImage
                src={imgUrl}
                width={message.mediaWidth}
                height={message.mediaHeight}
                caption={message.content?.trim() || undefined}
                onOpen={onOpenImage ? () => onOpenImage(message) : undefined}
              />
              )}
            </div>
          );
        }

        if (message.type === "FILE" && imgUrl) {
          const fallbackName = (() => {
            const raw = message.content?.trim();
            if (raw) {
              return raw;
            }
            try {
              const pathname = new URL(imgUrl).pathname;
              const segment = pathname.split("/").filter(Boolean).pop();
              return segment ? decodeURIComponent(segment) : "file";
            } catch {
              return "file";
            }
          })();

          if (isAudioFileName(fallbackName)) {
            return (
              <div className={styles.fileMessage}>
                {showCompactSender ? (
                  <p className={styles.senderCompact}>
                    <SenderName name={senderName} as="span" />
                  </p>
                ) : null}
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.fileMessageMeta}>
                    <SenderName
                      name={senderName}
                      as="strong"
                    />
                    <span> — {tChat("musicLabel")}</span>
                  </p>
                ) : null}
                <AudioFileBubble src={imgUrl} filename={fallbackName} />
              </div>
            );
          }

          if (isBookFileName(fallbackName)) {
            return (
              <div className={styles.fileMessage}>
                {showCompactSender ? (
                  <p className={styles.senderCompact}>
                    <SenderName name={senderName} as="span" />
                  </p>
                ) : null}
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.fileMessageMeta}>
                    <SenderName
                      name={senderName}
                      as="strong"
                    />
                    <span> — {tChat("bookLabel")}</span>
                  </p>
                ) : null}
                <BookMessageBubble
                  fileUrl={imgUrl}
                  filename={fallbackName}
                  fileSize={message.fileSize}
                  format={bookFormatFromName(fallbackName) ?? "pdf"}
                />
              </div>
            );
          }

          return (
            <div className={styles.fileMessage}>
              {showCompactSender ? (
                <p className={styles.senderCompact}>
                  <SenderName name={senderName} as="span" />
                </p>
              ) : null}
              {canShowSenderName && !showCompactSender ? (
                <p className={styles.fileMessageMeta}>
                  <SenderName name={senderName} as="strong" />
                  <span> — {tChat("fileLabel")}</span>
                </p>
              ) : null}
              <FileBubble
                href={imgUrl}
                fileName={fallbackName}
                fileSize={message.fileSize}
              />
            </div>
          );
        }

        const rawUrl = message.content.trim();
        if (
          rawUrl.startsWith(VOICE_META_PREFIX) &&
          rawUrl.endsWith(VOICE_META_SUFFIX)
        ) {
          const cleanUrl = rawUrl
            .replace(VOICE_META_PREFIX, "")
            .replace(VOICE_META_SUFFIX, "");
          let playerSrc = cleanUrl;
          try {
            playerSrc = decodeURIComponent(cleanUrl);
          } catch {
            /* бекенд кладе encodeURIComponent(URL); якщо рядок уже «голий» — лишаємо cleanUrl */
          }
          return (
            <VoiceMessageBubble
              username={senderName}
              src={playerSrc}
              isOwn={isOwnMessage}
              message={message}
              currentUserId={currentUser?.id}
              hideSenderName={showCompactSender || !canShowSenderName}
              compactSenderLabel={showCompactSender ? senderName : undefined}
            />
          );
        }

        const verseShare = parseVerseSharePayload(message.content);
        if (!verseShare.payload) {
          const showInlineAuthor = canShowSenderName && !showCompactSender;
          const chunks = splitMessageWithLinks(message.content);
          const previewLinks = Array.from(
            new Set(
              chunks
                .filter(
                  (chunk): chunk is Extract<LinkChunk, { type: "link" }> =>
                    chunk.type === "link",
                )
                .map((chunk) => chunk.href),
            ),
          ).slice(0, 2);
          return (
            <>
              {showCompactSender ? (
                <p className={styles.senderCompact}>
                  <SenderName name={senderName} as="span" />
                </p>
              ) : null}
              <p className={styles.messageContent}>
                {showInlineAuthor ? (
                  <>
                    <SenderName
                      name={senderName}
                      as="strong"
                    />
                    <span>:</span>
                  </>
                ) : null}
                {showInlineAuthor ? " " : null}
                {chunks.map((chunk, idx) =>
                  chunk.type === "text" ? (
                    <span key={`txt-${idx}`}>{chunk.value}</span>
                  ) : (
                    <a
                      key={`lnk-${idx}`}
                      className={styles.inlineLink}
                      href={chunk.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      data-bubble-control
                    >
                      {chunk.value}
                    </a>
                  ),
                )}
              </p>
              {previewLinks.length > 0 ? (
                <div className={styles.linkPreviewList}>
                  {previewLinks.map((href) => (
                    <LinkPreviewCard key={href} href={href} />
                  ))}
                </div>
              ) : null}
            </>
          );
        }

        return (
          <>
            {showCompactSender ? (
              <p className={styles.senderCompact}>
                <SenderName name={senderName} as="span" />
              </p>
            ) : null}
            {verseShare.payload.bookId ? (
              <Link
                href={`/bible/${verseShare.payload.bookId}?chapter=${verseShare.payload.chapter}&verse=${verseShare.payload.verses[0]}`}
                className={styles.verseShareCard}
              >
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.verseShareAuthor}>
                    <SenderName name={senderName} as="span" />{" "}
                    поделился стихом
                  </p>
                ) : null}
                <p className={styles.verseShareReference}>
                  {buildVerseReference(verseShare.payload)}
                </p>
                <ScriptureText
                  html={verseShare.payload.text}
                  className={styles.verseShareText}
                />
              </Link>
            ) : (
              <div className={styles.verseShareCard}>
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.verseShareAuthor}>
                    <SenderName name={senderName} as="span" />{" "}
                    поделился стихом
                  </p>
                ) : null}
                <p className={styles.verseShareReference}>
                  {buildVerseReference(verseShare.payload)}
                </p>
                <ScriptureText
                  html={verseShare.payload.text}
                  className={styles.verseShareText}
                />
              </div>
            )}
          </>
        );
      })()}

      <div className={styles.metaRow}>
        <div className={styles.metaRowTrailing}>
          <span className={styles.date}>
            {formattedDate}
            {message.isEdited ? ` · ${tShared("edited")}` : ""}
          </span>
        </div>
      </div>

      {message.deliveryStatus === "failed" ? (
        <div className={styles.unsentRow} role="alert">
          <span className={styles.unsentText}>{tChat("messageNotSent")}</span>
          <button
            type="button"
            className={styles.unsentRetry}
            onClick={() => onRetryUnsent?.(message)}
          >
            <RotateCw size={14} aria-hidden /> {tChat("uploadRetry")}
          </button>
          <button
            type="button"
            className={styles.unsentDismiss}
            onClick={() => onDismissUnsent?.(message)}
            aria-label={tChat("uploadDismiss")}
            title={tChat("uploadDismiss")}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      {onToggleReaction || (message.reactions?.length ?? 0) > 0 ? (
        <ReactionPills
          reactions={message.reactions ?? []}
          currentUserId={currentUserId}
          resolveUser={(userId) => ({
            avatarSrc: resolveReactionAvatarUrl?.(userId),
            label: resolveReactionUserLabel?.(userId) ?? "",
          })}
          onToggle={(emoji) => onToggleReaction?.(message, emoji)}
          align={isOwnMessage ? "start" : "end"}
        />
      ) : null}

      {isOwnMessage && showReadReceipt ? (
        <div className={styles.readReceiptRow} aria-label={readReceiptLabel}>
          {readReceiptUsers.length > 0 ? (
            <>
              <span className={styles.readReceiptAvatarStack}>
                {readReceiptUsers.slice(0, 3).map((reader) => (
                  <AvatarWithFallback
                    key={reader.id}
                    src={reader.avatarSrc}
                    initials={getInitials(reader.label ?? "U")}
                    colorSeed={reader.id}
                    width={12}
                    height={12}
                    imageClassName={styles.readReceiptAvatarImg}
                    fallbackClassName={styles.readReceiptAvatarFallback}
                    fallbackTag="span"
                    fallbackTint="onError"
                  />
                ))}
              </span>
              <span className={styles.readReceiptText}>
                {readReceiptUsers.length === 1
                  ? readReceiptLabel
                  : String(readReceiptUsers.length)}
              </span>
            </>
          ) : (
            <>
              <AvatarWithFallback
                src={readReceiptAvatarSrc}
                initials="•"
                colorSeed={message.id}
                width={12}
                height={12}
                imageClassName={styles.readReceiptAvatarImg}
                fallbackClassName={styles.readReceiptAvatarFallback}
                fallbackTag="span"
                fallbackTint="onError"
              />
              <span className={styles.readReceiptText}>{readReceiptLabel}</span>
            </>
          )}
        </div>
      ) : null}
    </>
  );

  const menu = menuRect ? (
    <MessageActionMenu
      anchorRect={menuRect}
      reactions={CHAT_REACTIONS}
      myReactions={myReactions}
      onReact={(emoji) => onToggleReaction?.(message, emoji)}
      onReply={onReply ? () => onReply(message) : undefined}
      copyText={copyText || undefined}
      onShare={handleShareBook}
      shareMode={canShareFiles() ? "share" : "download"}
      onEdit={canEditThisMessage ? handleEditClick : undefined}
      onDelete={canDeleteThisMessage ? handleDeleteClick : undefined}
      onClose={closeMenu}
    />
  ) : null;

  if (isOwnMessage) {
    return (
      <>
        <article className={bubbleClassName} {...interactiveBubbleProps}>
          {bubbleBody}
        </article>
        {menu}
      </>
    );
  }

  if (showAvatar) {
    return (
      <article className={styles.row}>
        <button
          type="button"
          className={styles.avatarBtn}
          onClick={handleAvatarClick}
          aria-label={`Написать ${message.handle ? `@${message.handle}` : message.username}`}
        >
          <AvatarWithFallback
            src={avatarSrc}
            initials={getInitials(message.username)}
            colorSeed={message.senderId ?? message.username ?? "?"}
            width={36}
            height={36}
            imageClassName={styles.avatarImg}
            fallbackClassName={styles.avatarFallback}
            fallbackTag="span"
            fallbackTint="onError"
          />
        </button>
        <div className={bubbleClassName} {...interactiveBubbleProps}>
          {bubbleBody}
        </div>
        {menu}
      </article>
    );
  }

  return (
    <>
      <article className={bubbleClassName} {...interactiveBubbleProps}>
        {bubbleBody}
      </article>
      {menu}
    </>
  );
}

export default memo(MessageBubble);
